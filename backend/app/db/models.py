"""SQLAlchemy database models for paper trading simulation, positions, orders, and audit trail."""
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PaperAccountModel(Base):
    """Persistent paper trading portfolio account."""

    __tablename__ = "paper_accounts"

    id = Column(String(64), primary_key=True, default="default_account")
    user_id = Column(String(64), nullable=False, default="default_user", index=True)
    initial_balance = Column(Numeric(14, 2), nullable=False, default=Decimal("100000.00"))
    cash_balance = Column(Numeric(14, 2), nullable=False, default=Decimal("100000.00"))
    realized_pnl = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    total_fees_paid = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(8), nullable=False, default="INR")

    # Persistent daily loss tracking across server restarts
    daily_realized_loss = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    daily_loss_date = Column(String(10), nullable=False, default=lambda: utcnow().strftime("%Y-%m-%d"))

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    positions = relationship("PaperPositionModel", back_populates="account", cascade="all, delete-orphan")
    orders = relationship("PaperOrderModel", back_populates="account", cascade="all, delete-orphan")
    risk_profile = relationship("RiskProfileModel", back_populates="account", uselist=False, cascade="all, delete-orphan")


class PaperPositionModel(Base):
    """Open active equity position held in the paper portfolio."""

    __tablename__ = "paper_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String(64), ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(32), nullable=False)
    name = Column(String(128), nullable=False)
    quantity = Column(Integer, nullable=False)
    average_entry_price = Column(Numeric(12, 2), nullable=False)
    total_cost_basis = Column(Numeric(14, 2), nullable=False)
    last_known_price = Column(Numeric(12, 2), nullable=False)
    is_stale_price = Column(Boolean, nullable=False, default=False)
    price_timestamp = Column(String(32), nullable=False, default="")

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    account = relationship("PaperAccountModel", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("account_id", "symbol", name="uq_account_symbol_position"),
        Index("idx_positions_account_symbol", "account_id", "symbol"),
    )


class PaperOrderModel(Base):
    """Simulated trade order records and status."""

    __tablename__ = "paper_orders"

    id = Column(String(64), primary_key=True)
    account_id = Column(String(64), ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    idempotency_key = Column(String(64), unique=True, nullable=True, index=True)

    symbol = Column(String(32), nullable=False)
    side = Column(String(8), nullable=False)  # BUY or SELL
    order_type = Column(String(16), nullable=False, default="MARKET")  # MARKET or LIMIT
    quantity = Column(Integer, nullable=False)
    limit_price = Column(Numeric(12, 2), nullable=True)
    stop_loss_price = Column(Numeric(12, 2), nullable=True)

    status = Column(String(16), nullable=False, default="PENDING")  # EXECUTED, REJECTED, PENDING, CANCELLED
    execution_price = Column(Numeric(12, 2), nullable=True)
    total_value = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    fees = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    slippage_cost = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    rejection_reason = Column(String(256), nullable=True)

    data_source = Column(String(64), nullable=False, default="Yahoo Finance (NSE/BSE)")
    data_timestamp = Column(String(32), nullable=False, default="")
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    executed_at = Column(DateTime(timezone=True), nullable=True)

    account = relationship("PaperAccountModel", back_populates="orders")
    fills = relationship("PaperTradeFillModel", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_orders_account_created", "account_id", "created_at"),
    )


class PaperTradeFillModel(Base):
    """Audit log of executed trade fills."""

    __tablename__ = "paper_trade_fills"

    id = Column(String(64), primary_key=True)
    order_id = Column(String(64), ForeignKey("paper_orders.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(String(64), nullable=False, index=True)
    symbol = Column(String(32), nullable=False)
    side = Column(String(8), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    fees = Column(Numeric(10, 2), nullable=False)
    slippage_cost = Column(Numeric(10, 2), nullable=False)
    realized_pnl = Column(Numeric(12, 2), nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    order = relationship("PaperOrderModel", back_populates="fills")


class RiskProfileModel(Base):
    """Configurable user risk management guardrails for paper trading accounts."""

    __tablename__ = "user_risk_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(
        String(64),
        ForeignKey("paper_accounts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    user_id = Column(String(64), nullable=False, default="default_user")

    max_order_value = Column(Numeric(14, 2), nullable=False, default=Decimal("50000.00"))
    max_position_allocation_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("25.00"))
    max_open_positions = Column(Integer, nullable=False, default=5)
    max_daily_loss_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("5.00"))
    max_risk_per_trade_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("2.00"))
    require_stop_loss = Column(Boolean, nullable=False, default=False)
    max_portfolio_concentration_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("50.00"))

    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    account = relationship("PaperAccountModel", back_populates="risk_profile")

