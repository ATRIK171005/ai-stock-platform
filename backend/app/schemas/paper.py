"""Pydantic schemas for paper trading simulation, account summary, orders, and positions."""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, model_validator


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderStatus(str, Enum):
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    PENDING = "PENDING"
    CANCELLED = "CANCELLED"


class PaperOrderCreateRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, description="Target stock ticker (e.g., RELIANCE.NS)")
    side: OrderSide = Field(description="Order side: BUY or SELL")
    order_type: OrderType = Field(default=OrderType.MARKET, description="MARKET or LIMIT")
    quantity: int = Field(gt=0, description="Number of shares to trade (strictly > 0)")
    limit_price: Optional[float] = Field(default=None, gt=0, description="Mandatory limit price for LIMIT orders")
    stop_loss_price: Optional[float] = Field(default=None, gt=0, description="Optional stop-loss exit price")
    idempotency_key: Optional[str] = Field(default=None, max_length=64, description="Unique client key to prevent duplicate orders")
    notes: Optional[str] = Field(default=None, max_length=256, description="Optional user notes")

    @model_validator(mode="after")
    def validate_limit_order(self):
        if self.order_type == OrderType.LIMIT and (self.limit_price is None or self.limit_price <= 0):
            raise ValueError("Limit orders must include a valid positive limit_price.")
        return self


class PaperOrderResponse(BaseModel):
    id: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    limit_price: Optional[float] = None
    stop_loss_price: Optional[float] = None
    status: OrderStatus
    execution_price: Optional[float] = None
    total_value: float
    fees: float
    slippage_cost: float = 0.0
    rejection_reason: Optional[str] = None
    data_source: str
    data_timestamp: str
    timestamp: str
    notes: Optional[str] = None


class PaperPositionResponse(BaseModel):
    symbol: str
    name: str
    quantity: int
    average_entry_price: float
    current_price: float
    current_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    is_stale_price: bool = False
    price_timestamp: str = ""


class PaperAccountResponse(BaseModel):
    id: str = "default_account"
    name: str = "Primary Portfolio"
    user_id: str = "default_user"
    initial_balance: float
    cash_balance: float
    invested_value: float
    total_equity: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    total_return_percent: float
    daily_pnl: float
    currency: str = "INR"
    max_position_size_percent: float
    daily_loss_limit: float
    max_order_value: float
    open_positions_count: int
    total_fees_paid: float
    last_updated: str


class CreateAccountRequest(BaseModel):
    name: str = Field(min_length=2, max_length=64, description="Portfolio or Account Name")
    initial_balance: float = Field(default=100000.0, ge=1000.0, le=10000000.0, description="Starting cash balance")
    currency: str = Field(default="INR", max_length=8)


class AccountListItem(BaseModel):
    id: str
    name: str
    user_id: str
    initial_balance: float
    cash_balance: float
    total_equity: float
    realized_pnl: float
    open_positions_count: int
    currency: str = "INR"
    created_at: str


class PaperResetRequest(BaseModel):
    confirm: bool = Field(description="Confirmation boolean to prevent accidental resets")
    initial_balance: Optional[float] = Field(default=100000.0, gt=0, description="Virtual cash balance to restore")


class PaperResetResponse(BaseModel):
    message: str
    account: PaperAccountResponse
