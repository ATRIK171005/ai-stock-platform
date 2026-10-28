"""Paper trading simulation and risk management engine.

Features:
- Fixed-precision Decimal financial arithmetic for zero rounding drift
- Strict backend risk controls (Max Position Size %, Max Order Value, Daily Loss Limit, Max Positions)
- Realized and Unrealized P&L tracking with weighted average entry prices
- Pluggable market data pricing with explicit historical/delayed feed labels
- Atomic ACID transactions and idempotency deduplication
- Account balance history and audit trail
"""
from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Dict, List, Optional, Tuple
import re
import threading
import uuid

from sqlalchemy.orm import Session

from ..config import settings
from ..core.exceptions import (
    DataUnavailableError,
    DuplicateOrderError,
    InsufficientCashError,
    InsufficientHoldingsError,
    InvalidAccountError,
    ResetConfirmationRequiredError,
)
from ..db.models import (
    PaperAccountModel,
    PaperOrderModel,
    PaperPositionModel,
    PaperTradeFillModel,
)
from ..schemas.paper import (
    OrderSide,
    OrderStatus,
    OrderType,
    PaperAccountResponse,
    PaperOrderCreateRequest,
    PaperOrderResponse,
    PaperPositionResponse,
    PaperResetResponse,
)
from .market_data import default_market_provider

logger = logging.getLogger("market_platform.paper")

ACCOUNT_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-\.]{3,64}$")


def validate_account_id(account_id: str) -> str:
    """Validates that an account_id consists of safe alphanumeric/hyphen/underscore tokens."""
    if not account_id or not isinstance(account_id, str) or not ACCOUNT_ID_REGEX.match(account_id):
        raise InvalidAccountError(
            f"Invalid account ID '{account_id}'. Must be 3-64 characters alphanumeric, underscores, hyphens, or dots."
        )
    return account_id


class AccountLockManager:
    """Thread-safe lock manager providing per-account mutual exclusion to prevent race conditions."""

    def __init__(self):
        self._locks: Dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()

    def get_lock(self, account_id: str) -> threading.Lock:
        with self._global_lock:
            if account_id not in self._locks:
                self._locks[account_id] = threading.Lock()
            return self._locks[account_id]


def today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PaperTradingService:
    """Core domain service for simulated Indian equity execution and risk management."""

    def __init__(self):
        self._lock_manager = AccountLockManager()

    def get_or_create_account(
        self, db: Session, account_id: str = "default_account", user_id: str = "default_user"
    ) -> PaperAccountModel:
        """Retrieves or initializes a persistent paper trading account."""
        validate_account_id(account_id)
        account = db.query(PaperAccountModel).filter(PaperAccountModel.id == account_id).first()
        today_str = today_iso()

        if not account:
            account = PaperAccountModel(
                id=account_id,
                user_id=user_id,
                initial_balance=Decimal(str(settings.paper_initial_capital)),
                cash_balance=Decimal(str(settings.paper_initial_capital)),
                realized_pnl=Decimal("0.00"),
                total_fees_paid=Decimal("0.00"),
                daily_realized_loss=Decimal("0.00"),
                daily_loss_date=today_str,
                currency="INR",
            )
            db.add(account)
            db.commit()
            db.refresh(account)
            logger.info("Initialized new paper trading account '%s' with ₹%s balance", account_id, account.cash_balance)
        else:
            # Check if daily loss tracker should be rolled over to a new day
            if account.daily_loss_date != today_str:
                account.daily_realized_loss = Decimal("0.00")
                account.daily_loss_date = today_str
                db.commit()
                db.refresh(account)

        return account

    def create_account(
        self,
        db: Session,
        name: str,
        initial_balance: float = 100000.0,
        user_id: str = "default_user",
    ) -> PaperAccountModel:
        """Creates a new isolated paper trading portfolio account with an active risk profile."""
        account_id = f"acc_{uuid.uuid4().hex[:12]}"
        validate_account_id(account_id)
        today_str = today_iso()

        account = PaperAccountModel(
            id=account_id,
            name=name.strip() or "New Portfolio",
            user_id=user_id,
            initial_balance=Decimal(str(initial_balance)),
            cash_balance=Decimal(str(initial_balance)),
            realized_pnl=Decimal("0.00"),
            total_fees_paid=Decimal("0.00"),
            daily_realized_loss=Decimal("0.00"),
            daily_loss_date=today_str,
            currency="INR",
        )
        db.add(account)
        db.commit()
        db.refresh(account)

        # Initialize default risk profile for the new account
        from .risk_guardian import risk_guardian_service
        risk_guardian_service.get_or_create_risk_profile(db=db, account_id=account.id, user_id=user_id)

        logger.info("Created paper trading account '%s' ('%s') for user '%s'", account.id, account.name, user_id)
        return account

    def get_user_accounts(self, db: Session, user_id: str = "default_user") -> List[PaperAccountModel]:
        """Lists all persistent paper portfolio accounts belonging to the given user."""
        accounts = (
            db.query(PaperAccountModel)
            .filter(PaperAccountModel.user_id == user_id)
            .order_by(PaperAccountModel.created_at.asc())
            .all()
        )
        if not accounts:
            if user_id == "default_user":
                default_acc = self.get_or_create_account(db, "default_account", "default_user")
                return [default_acc]
            else:
                new_acc = self.create_account(
                    db, name="Primary Portfolio", initial_balance=settings.paper_initial_capital, user_id=user_id
                )
                return [new_acc]
        return accounts

    def get_account_summary(
        self, db: Session, account_id: str = "default_account"
    ) -> PaperAccountResponse:
        """Calculates real-time portfolio equity, mark-to-market positions, and return metrics."""
        account = self.get_or_create_account(db, account_id)
        positions = db.query(PaperPositionModel).filter(PaperPositionModel.account_id == account_id).all()

        invested_value = Decimal("0.00")
        total_unrealized_pnl = Decimal("0.00")

        # Mark positions to market using current prices
        for pos in positions:
            latest_price, is_stale, ts = self._get_latest_price(pos.symbol, fallback=pos.last_known_price)
            pos.last_known_price = latest_price
            pos.is_stale_price = is_stale
            pos.price_timestamp = ts

            cur_pos_val = Decimal(pos.quantity) * latest_price
            invested_value += cur_pos_val

            unrealized = (latest_price - pos.average_entry_price) * Decimal(pos.quantity)
            total_unrealized_pnl += unrealized

        db.commit()

        total_equity = account.cash_balance + invested_value
        total_pnl = account.realized_pnl + total_unrealized_pnl
        total_return_pct = (
            (total_pnl / account.initial_balance) * Decimal("100")
            if account.initial_balance > Decimal("0.00")
            else Decimal("0.00")
        )

        # Estimate daily PnL (realized today + unrealized swing)
        daily_pnl = total_unrealized_pnl - account.daily_realized_loss

        return PaperAccountResponse(
            id=account.id,
            name=account.name,
            user_id=account.user_id,
            initial_balance=float(round(account.initial_balance, 2)),
            cash_balance=float(round(account.cash_balance, 2)),
            invested_value=float(round(invested_value, 2)),
            total_equity=float(round(total_equity, 2)),
            realized_pnl=float(round(account.realized_pnl, 2)),
            unrealized_pnl=float(round(total_unrealized_pnl, 2)),
            total_pnl=float(round(total_pnl, 2)),
            total_return_percent=float(round(total_return_pct, 2)),
            daily_pnl=float(round(daily_pnl, 2)),
            currency=account.currency,
            max_position_size_percent=settings.paper_max_position_size_pct,
            daily_loss_limit=settings.paper_daily_loss_limit,
            max_order_value=settings.paper_max_order_value,
            open_positions_count=len(positions),
            total_fees_paid=float(round(account.total_fees_paid, 2)),
            last_updated=utcnow().isoformat(),
        )

    def get_positions(
        self, db: Session, account_id: str = "default_account"
    ) -> List[PaperPositionResponse]:
        """Returns active open positions with live mark-to-market valuations."""
        self.get_or_create_account(db, account_id)
        positions = db.query(PaperPositionModel).filter(PaperPositionModel.account_id == account_id).all()

        responses: List[PaperPositionResponse] = []
        for pos in positions:
            latest_price, is_stale, ts = self._get_latest_price(pos.symbol, fallback=pos.last_known_price)
            pos.last_known_price = latest_price
            pos.is_stale_price = is_stale
            pos.price_timestamp = ts

            cur_val = Decimal(pos.quantity) * latest_price
            unrealized = (latest_price - pos.average_entry_price) * Decimal(pos.quantity)
            unrealized_pct = (
                ((latest_price - pos.average_entry_price) / pos.average_entry_price) * Decimal("100")
                if pos.average_entry_price > Decimal("0.00")
                else Decimal("0.00")
            )

            responses.append(
                PaperPositionResponse(
                    symbol=pos.symbol,
                    name=pos.name,
                    quantity=pos.quantity,
                    average_entry_price=float(round(pos.average_entry_price, 2)),
                    current_price=float(round(latest_price, 2)),
                    current_value=float(round(cur_val, 2)),
                    unrealized_pnl=float(round(unrealized, 2)),
                    unrealized_pnl_percent=float(round(unrealized_pct, 2)),
                    is_stale_price=is_stale,
                    price_timestamp=ts,
                )
            )

        db.commit()
        return responses

    def get_orders(
        self, db: Session, account_id: str = "default_account", limit: int = 50
    ) -> List[PaperOrderResponse]:
        """Retrieves historical simulated orders in reverse chronological order."""
        validate_account_id(account_id)
        orders = (
            db.query(PaperOrderModel)
            .filter(PaperOrderModel.account_id == account_id)
            .order_by(PaperOrderModel.created_at.desc())
            .limit(limit)
            .all()
        )

        return [
            PaperOrderResponse(
                id=o.id,
                symbol=o.symbol,
                side=OrderSide(o.side),
                order_type=OrderType(o.order_type),
                quantity=o.quantity,
                limit_price=float(round(o.limit_price, 2)) if o.limit_price else None,
                stop_loss_price=float(round(o.stop_loss_price, 2)) if getattr(o, "stop_loss_price", None) else None,
                status=OrderStatus(o.status),
                execution_price=float(round(o.execution_price, 2)) if o.execution_price else None,
                total_value=float(round(o.total_value, 2)),
                fees=float(round(o.fees, 2)),
                slippage_cost=float(round(o.slippage_cost, 2)),
                rejection_reason=o.rejection_reason,
                data_source=o.data_source,
                data_timestamp=o.data_timestamp,
                timestamp=o.created_at.isoformat(),
                notes=o.notes,
            )
            for o in orders
        ]

    def place_order(
        self, db: Session, req: PaperOrderCreateRequest, account_id: str = "default_account"
    ) -> PaperOrderResponse:
        """Processes and executes a simulated trade with risk checks and Decimal accounting."""
        validate_account_id(account_id)
        with self._lock_manager.get_lock(account_id):
            return self._place_order_internal(db=db, req=req, account_id=account_id)

    def _place_order_internal(
        self, db: Session, req: PaperOrderCreateRequest, account_id: str = "default_account"
    ) -> PaperOrderResponse:
        clean_sym, exchange = default_market_provider.normalize_symbol(req.symbol)
        account = self.get_or_create_account(db, account_id)

        # 1. Idempotency Check
        if req.idempotency_key:
            existing_order = (
                db.query(PaperOrderModel)
                .filter(
                    PaperOrderModel.account_id == account_id,
                    PaperOrderModel.idempotency_key == req.idempotency_key,
                )
                .first()
            )
            if existing_order:
                raise DuplicateOrderError(
                    f"Order with idempotency key '{req.idempotency_key}' was already processed with status {existing_order.status}."
                )

        # 2. Retrieve Latest Market Price
        market_price, is_stale, data_ts = self._get_latest_price(clean_sym)
        if market_price <= Decimal("0.00"):
            raise DataUnavailableError(f"No valid price quote available for symbol '{clean_sym}'.")

        data_source_label = f"Yahoo Finance ({exchange}) - Historical/Delayed"

        # 3. Calculate Base Order Value
        order_value = Decimal(req.quantity) * market_price

        # 4. Mandatory Risk Guardian Pre-Trade Enforcement
        from .risk_guardian import risk_guardian_service
        risk_guardian_service.validate_order_execution_limits(
            db=db,
            account_id=account_id,
            symbol=clean_sym,
            side=req.side.value,
            quantity=req.quantity,
            limit_price=req.limit_price,
            stop_loss_price=req.stop_loss_price,
        )

        existing_pos = (
            db.query(PaperPositionModel)
            .filter(PaperPositionModel.account_id == account_id, PaperPositionModel.symbol == clean_sym)
            .first()
        )

        # 5. Check Limit Order Condition
        is_limit_filled = True
        limit_note = None
        if req.order_type == OrderType.LIMIT:
            limit_price_dec = Decimal(str(round(req.limit_price, 2)))
            if req.side == OrderSide.BUY and market_price > limit_price_dec:
                is_limit_filled = False
                limit_note = f"Pending: Market price ₹{market_price:.2f} is above BUY limit ₹{limit_price_dec:.2f}."
            elif req.side == OrderSide.SELL and market_price < limit_price_dec:
                is_limit_filled = False
                limit_note = f"Pending: Market price ₹{market_price:.2f} is below SELL limit ₹{limit_price_dec:.2f}."

        order_id = f"ORD-{uuid.uuid4().hex[:10].upper()}"

        if not is_limit_filled:
            # Record Pending Limit Order without modifying cash/holdings
            pending_order = PaperOrderModel(
                id=order_id,
                account_id=account_id,
                idempotency_key=req.idempotency_key,
                symbol=clean_sym,
                side=req.side.value,
                order_type=req.order_type.value,
                quantity=req.quantity,
                limit_price=Decimal(str(round(req.limit_price, 2))),
                stop_loss_price=Decimal(str(round(req.stop_loss_price, 2))) if req.stop_loss_price else None,
                status=OrderStatus.PENDING.value,
                total_value=order_value,
                fees=Decimal("0.00"),
                slippage_cost=Decimal("0.00"),
                data_source=data_source_label,
                data_timestamp=data_ts,
                notes=limit_note,
                created_at=utcnow(),
            )
            db.add(pending_order)
            db.commit()
            db.refresh(pending_order)

            return PaperOrderResponse(
                id=pending_order.id,
                symbol=pending_order.symbol,
                side=OrderSide(pending_order.side),
                order_type=OrderType(pending_order.order_type),
                quantity=pending_order.quantity,
                limit_price=float(round(pending_order.limit_price, 2)),
                stop_loss_price=float(round(pending_order.stop_loss_price, 2)) if pending_order.stop_loss_price else None,
                status=OrderStatus.PENDING,
                execution_price=None,
                total_value=float(round(pending_order.total_value, 2)),
                fees=0.0,
                slippage_cost=0.0,
                rejection_reason=None,
                data_source=pending_order.data_source,
                data_timestamp=pending_order.data_timestamp,
                timestamp=pending_order.created_at.isoformat(),
                notes=pending_order.notes,
            )

        # 6. Execute Simulated Order with Slippage and Brokerage
        brokerage_pct = Decimal(str(settings.paper_default_brokerage_pct)) / Decimal("100")
        slippage_pct = Decimal(str(settings.paper_default_slippage_pct)) / Decimal("100")

        if req.side == OrderSide.BUY:
            # Slippage increases execution price for buyers
            exec_price = round(market_price * (Decimal("1") + slippage_pct), 2)
            trade_value = exec_price * Decimal(req.quantity)
            fees = round(trade_value * brokerage_pct, 2)
            slippage_cost = round((exec_price - market_price) * Decimal(req.quantity), 2)
            total_cash_required = trade_value + fees

            if total_cash_required > account.cash_balance:
                raise InsufficientCashError(
                    f"Insufficient virtual cash. Required: ₹{total_cash_required:,.2f} (incl. ₹{fees:.2f} fees), Available: ₹{account.cash_balance:,.2f}."
                )

            # Deduct cash
            account.cash_balance -= total_cash_required
            account.total_fees_paid += fees

            # Update or create position with weighted average entry price
            if existing_pos:
                new_qty = existing_pos.quantity + req.quantity
                new_cost_basis = existing_pos.total_cost_basis + trade_value
                existing_pos.average_entry_price = round(new_cost_basis / Decimal(new_qty), 2)
                existing_pos.total_cost_basis = new_cost_basis
                existing_pos.quantity = new_qty
                existing_pos.last_known_price = market_price
                existing_pos.price_timestamp = data_ts
                existing_pos.is_stale_price = is_stale
            else:
                new_pos = PaperPositionModel(
                    account_id=account_id,
                    symbol=clean_sym,
                    name=clean_sym.replace(".NS", "").replace(".BO", ""),
                    quantity=req.quantity,
                    average_entry_price=exec_price,
                    total_cost_basis=trade_value,
                    last_known_price=market_price,
                    is_stale_price=is_stale,
                    price_timestamp=data_ts,
                )
                db.add(new_pos)

            realized_trade_pnl = None

        else:
            # SELL Order
            owned_qty = existing_pos.quantity if existing_pos else 0
            if req.quantity > owned_qty:
                raise InsufficientHoldingsError(
                    f"Insufficient shares held to sell {req.quantity} of {clean_sym}. Currently holding: {owned_qty} shares."
                )

            # Slippage reduces execution price for sellers
            exec_price = round(market_price * (Decimal("1") - slippage_pct), 2)
            trade_value = exec_price * Decimal(req.quantity)
            fees = round(trade_value * brokerage_pct, 2)
            slippage_cost = round((market_price - exec_price) * Decimal(req.quantity), 2)
            net_proceeds = trade_value - fees

            # Realized P&L
            gross_pnl = (exec_price - existing_pos.average_entry_price) * Decimal(req.quantity)
            realized_trade_pnl = round(gross_pnl - fees, 2)

            account.cash_balance += net_proceeds
            account.realized_pnl += realized_trade_pnl
            account.total_fees_paid += fees

            if realized_trade_pnl < Decimal("0.00"):
                account.daily_realized_loss += abs(realized_trade_pnl)

            # Update position
            remaining_qty = existing_pos.quantity - req.quantity
            if remaining_qty == 0:
                db.delete(existing_pos)
            else:
                existing_pos.quantity = remaining_qty
                existing_pos.total_cost_basis = existing_pos.average_entry_price * Decimal(remaining_qty)
                existing_pos.last_known_price = market_price
                existing_pos.price_timestamp = data_ts
                existing_pos.is_stale_price = is_stale

        # 7. Record Order and Trade Fill Audit Records
        now_dt = utcnow()
        order_model = PaperOrderModel(
            id=order_id,
            account_id=account_id,
            idempotency_key=req.idempotency_key,
            symbol=clean_sym,
            side=req.side.value,
            order_type=req.order_type.value,
            quantity=req.quantity,
            limit_price=Decimal(str(round(req.limit_price, 2))) if req.limit_price else None,
            stop_loss_price=Decimal(str(round(req.stop_loss_price, 2))) if req.stop_loss_price else None,
            status=OrderStatus.EXECUTED.value,
            execution_price=exec_price,
            total_value=trade_value,
            fees=fees,
            slippage_cost=slippage_cost,
            data_source=data_source_label,
            data_timestamp=data_ts,
            notes=req.notes or f"Simulated {req.side.value} executed at ₹{exec_price:.2f}",
            created_at=now_dt,
            executed_at=now_dt,
        )
        db.add(order_model)

        fill_model = PaperTradeFillModel(
            id=f"FILL-{uuid.uuid4().hex[:10].upper()}",
            order_id=order_id,
            account_id=account_id,
            symbol=clean_sym,
            side=req.side.value,
            quantity=req.quantity,
            price=exec_price,
            fees=fees,
            slippage_cost=slippage_cost,
            realized_pnl=realized_trade_pnl,
            timestamp=now_dt,
        )
        db.add(fill_model)

        db.commit()
        db.refresh(order_model)

        logger.info(
            "Executed simulated %s for %s (%d shares @ ₹%s, fees: ₹%s)",
            req.side.value,
            clean_sym,
            req.quantity,
            exec_price,
            fees,
        )

        return PaperOrderResponse(
            id=order_model.id,
            symbol=order_model.symbol,
            side=OrderSide(order_model.side),
            order_type=OrderType(order_model.order_type),
            quantity=order_model.quantity,
            limit_price=float(round(order_model.limit_price, 2)) if order_model.limit_price else None,
            stop_loss_price=float(round(order_model.stop_loss_price, 2)) if getattr(order_model, "stop_loss_price", None) else None,
            status=OrderStatus.EXECUTED,
            execution_price=float(round(order_model.execution_price, 2)),
            total_value=float(round(order_model.total_value, 2)),
            fees=float(round(order_model.fees, 2)),
            slippage_cost=float(round(order_model.slippage_cost, 2)),
            rejection_reason=None,
            data_source=order_model.data_source,
            data_timestamp=order_model.data_timestamp,
            timestamp=order_model.created_at.isoformat(),
            notes=order_model.notes,
        )

    def reset_account(
        self,
        db: Session,
        account_id: str = "default_account",
        confirm: bool = False,
        initial_balance: float = 100000.0,
    ) -> PaperResetResponse:
        """Resets virtual balance and purges paper positions and order history with confirmation."""
        validate_account_id(account_id)
        if not confirm:
            raise ResetConfirmationRequiredError("Explicit confirmation (confirm=true) is required to reset account.")

        with self._lock_manager.get_lock(account_id):
            return self._reset_account_internal(
                db=db, account_id=account_id, initial_balance=initial_balance
            )

    def _reset_account_internal(
        self,
        db: Session,
        account_id: str = "default_account",
        initial_balance: float = 100000.0,
    ) -> PaperResetResponse:
        account = self.get_or_create_account(db, account_id)

        # Clear positions and orders
        db.query(PaperPositionModel).filter(PaperPositionModel.account_id == account_id).delete()
        db.query(PaperOrderModel).filter(PaperOrderModel.account_id == account_id).delete()
        db.query(PaperTradeFillModel).filter(PaperTradeFillModel.account_id == account_id).delete()

        # Reset account cash and balances
        init_bal_dec = Decimal(str(round(initial_balance, 2)))
        account.initial_balance = init_bal_dec
        account.cash_balance = init_bal_dec
        account.realized_pnl = Decimal("0.00")
        account.total_fees_paid = Decimal("0.00")
        account.daily_realized_loss = Decimal("0.00")
        account.daily_loss_date = today_iso()

        db.commit()
        db.refresh(account)
        logger.info("Reset paper trading account '%s' to initial balance ₹%s", account_id, init_bal_dec)

        summary = self.get_account_summary(db, account_id)
        return PaperResetResponse(
            message=f"Paper trading account '{account_id}' successfully reset to ₹{init_bal_dec:,.2f}.",
            account=summary,
        )

    def _get_latest_price(
        self, symbol: str, fallback: Optional[Decimal] = None
    ) -> Tuple[Decimal, bool, str]:
        """Fetches the latest close price from provider, safely handling stale states."""
        try:
            df = default_market_provider.fetch_history(symbol, period="5d", interval="1d")
            if df is not None and not df.empty:
                last_close = Decimal(str(round(float(df["Close"].iloc[-1]), 2)))
                ts = str(df.index[-1])[:10]
                return last_close, False, ts
        except Exception as e:
            logger.warning("Could not fetch live price for %s: %s", symbol, e)

        # Fallback to last known position valuation
        if fallback is not None and fallback > Decimal("0.00"):
            return fallback, True, "Stale / Last Known"

        return Decimal("0.00"), True, "Unavailable"


# Default singleton instance
default_paper_service = PaperTradingService()
