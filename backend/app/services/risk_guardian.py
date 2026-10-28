"""Personal Risk Guardian domain service.

Provides deterministic pre-trade risk evaluation, configurable user risk profiles,
and ACID order submission enforcement against portfolio risk guardrails.
"""
from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from ..config import settings
from ..core.exceptions import (
    InvalidInputError,
    RiskLimitViolationError,
)
from ..db.models import (
    PaperAccountModel,
    PaperPositionModel,
    RiskProfileModel,
)
from ..schemas.risk_guardian import (
    PreTradeAssessmentRequest,
    PreTradeAssessmentResponse,
    RiskAssessmentOutcome,
    RiskProfileSchema,
)
from .market_data import default_market_provider

logger = logging.getLogger("market_platform.risk_guardian")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RiskGuardianService:
    """Core domain service for deterministic pre-trade evaluation and profile enforcement."""

    def get_or_create_risk_profile(
        self, db: Session, account_id: str = "default_account", user_id: str = "default_user"
    ) -> RiskProfileModel:
        """Retrieves or initializes a persistent RiskProfileModel for the account."""
        profile = db.query(RiskProfileModel).filter(RiskProfileModel.account_id == account_id).first()
        if not profile:
            profile = RiskProfileModel(
                account_id=account_id,
                user_id=user_id,
                max_order_value=Decimal(str(settings.paper_max_order_value)),
                max_position_allocation_pct=Decimal(str(settings.paper_max_position_size_pct)),
                max_open_positions=settings.paper_max_open_positions,
                max_daily_loss_pct=Decimal("5.00"),
                max_risk_per_trade_pct=Decimal("2.00"),
                require_stop_loss=False,
                max_portfolio_concentration_pct=Decimal("50.00"),
                version=1,
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
            logger.info("Initialized default risk profile for account '%s'", account_id)
        return profile

    def update_risk_profile(
        self, db: Session, account_id: str, new_settings: RiskProfileSchema
    ) -> RiskProfileModel:
        """Updates user risk guardrail thresholds and increments profile version."""
        profile = self.get_or_create_risk_profile(db, account_id)

        if new_settings.max_order_value <= 0:
            raise InvalidInputError("max_order_value must be strictly positive.")
        if not (0.0 < new_settings.max_position_allocation_pct <= 100.0):
            raise InvalidInputError("max_position_allocation_pct must be between 0.1% and 100%.")
        if new_settings.max_open_positions < 1:
            raise InvalidInputError("max_open_positions must be at least 1.")

        profile.max_order_value = Decimal(str(round(new_settings.max_order_value, 2)))
        profile.max_position_allocation_pct = Decimal(str(round(new_settings.max_position_allocation_pct, 2)))
        profile.max_open_positions = new_settings.max_open_positions
        profile.max_daily_loss_pct = Decimal(str(round(new_settings.max_daily_loss_pct, 2)))
        profile.max_risk_per_trade_pct = Decimal(str(round(new_settings.max_risk_per_trade_pct, 2)))
        profile.require_stop_loss = new_settings.require_stop_loss
        profile.max_portfolio_concentration_pct = Decimal(str(round(new_settings.max_portfolio_concentration_pct, 2)))
        profile.version += 1
        profile.updated_at = utcnow()

        db.commit()
        db.refresh(profile)
        logger.info("Updated risk profile for account '%s' to version %d", account_id, profile.version)
        return profile

    def assess_pre_trade_risk(
        self, db: Session, req: PreTradeAssessmentRequest
    ) -> PreTradeAssessmentResponse:
        """Deterministically evaluates a proposed paper trade against the active risk profile."""
        account_id = req.account_id or "default_account"
        profile = self.get_or_create_risk_profile(db, account_id)

        # 1. Fetch account and calculate real-time portfolio equity
        account = db.query(PaperAccountModel).filter(PaperAccountModel.id == account_id).first()
        if not account:
            from .paper_trading import default_paper_service
            account = default_paper_service.get_or_create_account(db, account_id)

        positions = db.query(PaperPositionModel).filter(PaperPositionModel.account_id == account_id).all()

        clean_sym, exchange = default_market_provider.normalize_symbol(req.symbol)
        side = req.side.upper()
        qty = req.quantity

        # 2. Revalue portfolio equity to current mark-to-market prices
        invested_value = Decimal("0.00")
        for pos in positions:
            latest_price, _, _ = self._get_price(pos.symbol, fallback=pos.last_known_price)
            pos.last_known_price = latest_price
            invested_value += Decimal(pos.quantity) * latest_price

        current_cash = account.cash_balance
        total_equity = current_cash + invested_value
        if total_equity <= Decimal("0.00"):
            total_equity = Decimal("100000.00")

        # 3. Retrieve target security price
        market_price, is_stale, price_ts = self._get_price(clean_sym)
        data_source_label = f"Yahoo Finance ({exchange}) - Historical/Delayed"

        hard_breaches: List[str] = []
        soft_warnings: List[str] = []

        if market_price <= Decimal("0.00"):
            hard_breaches.append(f"No valid market price quote available for symbol '{clean_sym}'.")
            market_price = Decimal("100.00")  # fallback for display arithmetic only

        if is_stale:
            soft_warnings.append(
                f"Market price for {clean_sym} is delayed or reflects the prior session close ({price_ts})."
            )

        # Price used for execution estimate
        exec_price = Decimal(str(round(req.limit_price, 2))) if req.limit_price else market_price

        # 4. Financial Arithmetic: Estimated Value & Fees
        order_value = Decimal(qty) * exec_price
        brokerage_pct = Decimal(str(settings.paper_default_brokerage_pct)) / Decimal("100")
        slippage_pct = Decimal(str(settings.paper_default_slippage_pct)) / Decimal("100")

        est_brokerage = order_value * brokerage_pct
        est_slippage = order_value * slippage_pct
        est_fees = round(est_brokerage + est_slippage, 2)

        existing_pos = next((p for p in positions if p.symbol == clean_sym), None)
        curr_pos_qty = existing_pos.quantity if existing_pos else 0
        curr_pos_val = Decimal(curr_pos_qty) * market_price
        curr_alloc_pct = round(float((curr_pos_val / total_equity) * Decimal("100")), 2)

        if side == "BUY":
            cash_required = order_value + est_fees
            remaining_cash = current_cash - cash_required
            projected_pos_qty = curr_pos_qty + qty
            projected_pos_val = Decimal(projected_pos_qty) * market_price
            projected_alloc_pct = round(float((projected_pos_val / total_equity) * Decimal("100")), 2)

            # Check insufficient cash
            if cash_required > current_cash:
                hard_breaches.append(
                    f"Insufficient virtual cash: Required ₹{cash_required:,.2f} (order ₹{order_value:,.2f} + fees ₹{est_fees:,.2f}), but available cash is ₹{current_cash:,.2f}."
                )

            # Check max order value
            if order_value > profile.max_order_value:
                hard_breaches.append(
                    f"Order value (₹{order_value:,.2f}) exceeds configured max order limit of ₹{profile.max_order_value:,.2f}."
                )

            # Check max position allocation
            if Decimal(str(projected_alloc_pct)) > profile.max_position_allocation_pct:
                hard_breaches.append(
                    f"Position limit exceeded: Total {clean_sym} allocation would reach ₹{projected_pos_val:,.2f} ({projected_alloc_pct:.1f}%), exceeding {profile.max_position_allocation_pct:.0f}% of equity."
                )

            # Check daily loss limit
            daily_loss_limit_inr = total_equity * (profile.max_daily_loss_pct / Decimal("100"))
            if account.daily_realized_loss >= daily_loss_limit_inr:
                hard_breaches.append(
                    f"Daily loss limit (₹{daily_loss_limit_inr:,.2f}) has been breached today. New BUY orders are blocked until reset."
                )

            # Check max open positions
            total_open = len(positions)
            if not existing_pos and total_open >= profile.max_open_positions:
                hard_breaches.append(
                    f"Maximum open position count ({profile.max_open_positions}) reached. Close an existing position before opening new stock."
                )

            # Check mandatory stop-loss
            if profile.require_stop_loss and (req.stop_loss_price is None or req.stop_loss_price <= 0):
                hard_breaches.append(
                    "Mandatory Stop-Loss required: Your risk profile mandates a valid stop-loss price for all BUY orders."
                )

        else:
            # SELL Order
            cash_received = order_value - est_fees
            remaining_cash = current_cash + cash_received
            projected_pos_qty = max(0, curr_pos_qty - qty)
            projected_pos_val = Decimal(projected_pos_qty) * market_price
            projected_alloc_pct = round(float((projected_pos_val / total_equity) * Decimal("100")), 2)

            if qty > curr_pos_qty:
                hard_breaches.append(
                    f"Insufficient shares held: Attempting to sell {qty} shares, but only holding {curr_pos_qty} shares of {clean_sym}."
                )

        # 5. Stop-Loss Risk Assessment
        stop_loss_risk_inr: Optional[float] = None
        stop_loss_risk_pct: Optional[float] = None

        if req.stop_loss_price and req.stop_loss_price > 0:
            sl_price_dec = Decimal(str(round(req.stop_loss_price, 2)))
            if side == "BUY":
                if sl_price_dec >= exec_price:
                    hard_breaches.append(
                        f"Invalid stop-loss: Stop-loss price (₹{sl_price_dec:.2f}) must be strictly below execution price (₹{exec_price:.2f}) for BUY orders."
                    )
                else:
                    loss_per_share = exec_price - sl_price_dec
                    total_potential_loss = (loss_per_share * Decimal(qty)) + (est_fees * Decimal("2"))
                    risk_pct = (total_potential_loss / total_equity) * Decimal("100")

                    stop_loss_risk_inr = float(round(total_potential_loss, 2))
                    stop_loss_risk_pct = float(round(risk_pct, 2))

                    if risk_pct > profile.max_risk_per_trade_pct:
                        hard_breaches.append(
                            f"Stop-loss risk ({risk_pct:.2f}% of equity, ₹{total_potential_loss:,.2f}) exceeds configured max risk per trade of {profile.max_risk_per_trade_pct:.2f}%."
                        )
            else:
                if sl_price_dec <= exec_price:
                    hard_breaches.append(
                        f"Invalid stop-loss: Stop-loss price (₹{sl_price_dec:.2f}) must be strictly above execution price (₹{exec_price:.2f}) for short/exit orders."
                    )
        elif side == "BUY" and not profile.require_stop_loss:
            soft_warnings.append(
                "No stop-loss specified: Order carries undefined downside risk if the market drops sharply."
            )

        # 6. Soft Warnings (Threshold Proximities)
        if side == "BUY":
            if order_value > profile.max_order_value * Decimal("0.80") and order_value <= profile.max_order_value:
                soft_warnings.append(
                    f"Order value (₹{order_value:,.2f}) is close to your configured maximum cap (₹{profile.max_order_value:,.2f})."
                )

            if (
                Decimal(str(projected_alloc_pct)) > profile.max_position_allocation_pct * Decimal("0.80")
                and Decimal(str(projected_alloc_pct)) <= profile.max_position_allocation_pct
            ):
                soft_warnings.append(
                    f"Projected allocation in {clean_sym} ({projected_alloc_pct:.1f}%) approaches the {profile.max_position_allocation_pct:.1f}% portfolio limit."
                )

            if Decimal(str(projected_alloc_pct)) > profile.max_portfolio_concentration_pct:
                soft_warnings.append(
                    f"High portfolio concentration: Stock would represent {projected_alloc_pct:.1f}% of total portfolio equity."
                )

        # 7. Determine Final Outcome
        if hard_breaches:
            outcome = RiskAssessmentOutcome.BLOCKED
            summary = f"Order BLOCKED: {len(hard_breaches)} risk management hard limit(s) violated."
        elif soft_warnings:
            outcome = RiskAssessmentOutcome.WARNING
            summary = f"Order APPROVED with {len(soft_warnings)} caution warning(s)."
        else:
            outcome = RiskAssessmentOutcome.APPROVED
            summary = "Order APPROVED: All configured portfolio risk checks passed safely."

        now_iso = utcnow().isoformat()

        return PreTradeAssessmentResponse(
            outcome=outcome,
            summary=summary,
            symbol=clean_sym,
            side=side,
            quantity=qty,
            market_price=float(round(market_price, 2)),
            price_timestamp=price_ts,
            data_source=data_source_label,
            is_stale_price=is_stale,
            estimated_order_value=float(round(order_value, 2)),
            estimated_fees=float(round(est_fees, 2)),
            estimated_cash_required=float(round(cash_required, 2)) if side == "BUY" else 0.0,
            remaining_cash=float(round(remaining_cash, 2)),
            current_position_qty=curr_pos_qty,
            projected_position_qty=projected_pos_qty,
            current_allocation_pct=curr_alloc_pct,
            projected_allocation_pct=projected_alloc_pct,
            stop_loss_risk_inr=stop_loss_risk_inr,
            stop_loss_risk_pct=stop_loss_risk_pct,
            hard_breaches=hard_breaches,
            soft_warnings=soft_warnings,
            risk_profile_version=profile.version,
            assessment_timestamp=now_iso,
        )

    def validate_order_execution_limits(
        self,
        db: Session,
        account_id: str,
        symbol: str,
        side: str,
        quantity: int,
        limit_price: Optional[float] = None,
        stop_loss_price: Optional[float] = None,
    ) -> None:
        """Mandatory order execution risk gate. Raises RiskLimitViolationError if any hard limit fails."""
        req = PreTradeAssessmentRequest(
            symbol=symbol,
            side=side,
            quantity=quantity,
            limit_price=limit_price,
            stop_loss_price=stop_loss_price,
            account_id=account_id,
        )
        assessment = self.assess_pre_trade_risk(db, req)
        if assessment.outcome == RiskAssessmentOutcome.BLOCKED:
            reasons = "; ".join(assessment.hard_breaches)
            raise RiskLimitViolationError(f"Pre-Trade Risk Guardian Check Failed: {reasons}")

    def _get_price(self, symbol: str, fallback: Optional[Decimal] = None) -> Tuple[Decimal, bool, str]:
        """Retrieves latest quote price and detects stale/historical timestamp."""
        try:
            df = default_market_provider.fetch_history(symbol, period="5d", interval="1d")
            if df is not None and not df.empty:
                close = Decimal(str(round(float(df["Close"].iloc[-1]), 2)))
                data_ts = str(df.index[-1])[:10]
                return close, False, data_ts
        except Exception as e:
            logger.warning("Could not fetch price for %s: %s", symbol, e)

        if fallback and fallback > Decimal("0.00"):
            return fallback, True, "Stale / Last Known"
        return Decimal("0.00"), True, "Unavailable"


risk_guardian_service = RiskGuardianService()
