"""Pydantic schemas for the deterministic historical backtesting engine."""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, model_validator


class StrategyType(str, Enum):
    SMA_CROSSOVER = "SMA_CROSSOVER"
    RSI_MEAN_REVERSION = "RSI_MEAN_REVERSION"
    MACD_MOMENTUM = "MACD_MOMENTUM"


class BacktestRequest(BaseModel):
    symbol: str = Field(default="RELIANCE.NS", description="Stock ticker (e.g. RELIANCE.NS, TCS.NS)")
    strategy: StrategyType = Field(default=StrategyType.SMA_CROSSOVER, description="Quantitative strategy")
    period: str = Field(default="1y", description="Data period: 6mo, 1y, 2y, 5y, max")
    interval: str = Field(default="1d", description="Candle interval: 1d")
    start_date: Optional[str] = Field(default=None, description="Optional filter start date YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="Optional filter end date YYYY-MM-DD")
    fast_period: int = Field(default=20, ge=2, le=100, description="Fast moving average period")
    slow_period: int = Field(default=50, ge=5, le=300, description="Slow moving average period")
    initial_capital: float = Field(default=100000.0, gt=0, description="Virtual initial cash in INR")
    position_size_pct: float = Field(default=100.0, gt=0, le=100.0, description="Percent of cash allocated per trade")
    brokerage_pct: float = Field(default=0.05, ge=0.0, le=5.0, description="Brokerage commission % per execution")
    slippage_pct: float = Field(default=0.02, ge=0.0, le=5.0, description="Execution slippage percentage")
    stop_loss_pct: Optional[float] = Field(default=None, ge=0.1, le=50.0, description="Optional stop-loss percentage")
    take_profit_pct: Optional[float] = Field(default=None, ge=0.1, le=100.0, description="Optional take-profit percentage")
    daily_loss_limit: Optional[float] = Field(default=None, ge=0.0, description="Optional daily loss limit in INR")

    @model_validator(mode="after")
    def validate_periods(self):
        if self.fast_period >= self.slow_period:
            raise ValueError(f"Fast period ({self.fast_period}) must be strictly less than slow period ({self.slow_period}).")
        return self


class BacktestTrade(BaseModel):
    id: str = Field(description="Unique trade sequence identifier (e.g. BT-001)")
    entry_date: str = Field(description="ISO 8601 entry timestamp / date")
    exit_date: str = Field(description="ISO 8601 exit timestamp / date")
    type: str = Field(default="BUY", description="Trade direction (BUY)")
    entry_price: float = Field(description="Execution entry price with slippage")
    exit_price: float = Field(description="Execution exit price with slippage")
    quantity: int = Field(description="Number of shares traded")
    gross_pnl: float = Field(description="Gross profit/loss before fees in INR")
    net_pnl: float = Field(description="Net profit/loss after slippage & brokerage in INR")
    costs: float = Field(description="Total round-trip brokerage costs in INR")
    return_pct: float = Field(description="Net return percentage on trade")
    reason: str = Field(description="Signal rationale for entry and exit")


class EquityPoint(BaseModel):
    date: str = Field(description="Candle date string YYYY-MM-DD")
    portfolio_value: float = Field(description="Total portfolio equity (cash + holdings)")
    cash: float = Field(description="Uninvested cash balance")
    holdings_value: float = Field(description="Current market value of active stock holdings")
    benchmark_value: float = Field(description="Buy & Hold benchmark portfolio value")
    drawdown_pct: float = Field(description="Percentage drawdown from peak portfolio equity")


class BacktestMetrics(BaseModel):
    net_return: float
    net_return_pct: float
    gross_return: float
    gross_return_pct: float
    total_costs: float
    buy_and_hold_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    annualized_volatility_pct: float
    win_rate_pct: float
    profit_factor: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_winning_trade: float
    avg_losing_trade: float


class BacktestResponse(BaseModel):
    backtest_id: str
    symbol: str
    strategy: str
    initial_capital: float
    final_capital: float
    net_return: float
    net_return_pct: float
    benchmark_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    profit_factor: float
    metrics: BacktestMetrics
    equity_curve: List[EquityPoint]
    trades: List[BacktestTrade]
    params: Dict[str, Any]
    data_source: str
    data_timestamp: str
    disclaimer: str = (
        "Deterministic backtesting simulation for historical research only. "
        "Past performance does not guarantee future results. "
        "Slippage, brokerage, and non-look-ahead next-bar executions are modeled, "
        "but real-market liquidity, margin changes, and market impact may differ. "
        "Not SEBI registered financial advice."
    )
