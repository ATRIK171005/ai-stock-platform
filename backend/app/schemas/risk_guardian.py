"""Pydantic schemas for Personal Risk Guardian pre-trade risk evaluation and user risk profiles."""
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class RiskAssessmentOutcome(str, Enum):
    """Overall pre-trade decision outcome."""

    APPROVED = "APPROVED"
    WARNING = "WARNING"
    BLOCKED = "BLOCKED"


class RiskProfileSchema(BaseModel):
    """Configurable user risk management guardrails and thresholds."""

    account_id: str = "default_account"
    max_order_value: float = Field(default=50000.0, gt=0, description="Max single order value in INR")
    max_position_allocation_pct: float = Field(default=25.0, gt=0, le=100.0, description="Max allocation in a single stock (% of equity)")
    max_open_positions: int = Field(default=5, ge=1, le=50, description="Max simultaneous open positions")
    max_daily_loss_pct: float = Field(default=5.0, gt=0, le=50.0, description="Max daily loss (% of equity)")
    max_risk_per_trade_pct: float = Field(default=2.0, gt=0, le=20.0, description="Max risk to stop-loss per trade (% of equity)")
    require_stop_loss: bool = Field(default=False, description="Mandate stop-loss for every new BUY order")
    max_portfolio_concentration_pct: float = Field(default=50.0, gt=0, le=100.0, description="Max concentration in top positions (% of equity)")
    version: int = 1


class PreTradeAssessmentRequest(BaseModel):
    """Parameters for evaluating pre-trade risk before submitting a paper order."""

    symbol: str = Field(min_length=1, max_length=32, description="Target stock ticker (e.g., RELIANCE.NS)")
    side: str = Field(description="Order side: BUY or SELL")
    quantity: int = Field(gt=0, description="Number of shares (strictly > 0)")
    order_type: str = Field(default="MARKET", description="MARKET or LIMIT")
    limit_price: Optional[float] = Field(default=None, gt=0, description="Optional limit price")
    stop_loss_price: Optional[float] = Field(default=None, gt=0, description="Optional stop-loss price")
    account_id: str = Field(default="default_account", description="Paper trading account ID")


class PreTradeAssessmentResponse(BaseModel):
    """Deterministic pre-trade risk assessment outcome and rule analysis."""

    outcome: RiskAssessmentOutcome
    summary: str
    symbol: str
    side: str
    quantity: int

    market_price: float
    price_timestamp: str
    data_source: str = "Yahoo Finance (NSE/BSE)"
    is_stale_price: bool = False

    estimated_order_value: float
    estimated_fees: float
    estimated_cash_required: float
    remaining_cash: float

    current_position_qty: int
    projected_position_qty: int
    current_allocation_pct: float
    projected_allocation_pct: float

    stop_loss_risk_inr: Optional[float] = None
    stop_loss_risk_pct: Optional[float] = None

    hard_breaches: List[str]
    soft_warnings: List[str]

    risk_profile_version: int
    assessment_timestamp: str
