"""Pydantic schemas for Strategy Doctor walk-forward validation and robustness analysis."""
from datetime import datetime, timezone
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class StrategyDoctorRequest(BaseModel):
    """Parameters for running a Strategy Doctor robustness audit."""

    symbol: str = Field(default="RELIANCE.NS", description="NSE/BSE stock ticker symbol")
    strategy: str = Field(default="SMA Crossover (20/50)", description="Trading strategy name")
    fast_period: int = Field(default=20, ge=2, le=100, description="Fast moving average period")
    slow_period: int = Field(default=50, ge=5, le=300, description="Slow moving average period")

    start_date: Optional[str] = Field(default=None, description="Start date filter YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="End date filter YYYY-MM-DD")
    initial_capital: float = Field(default=100000.0, gt=0, description="Initial virtual capital in INR")
    brokerage_pct: float = Field(default=0.05, ge=0.0, le=5.0, description="Brokerage fee percentage")
    slippage_pct: float = Field(default=0.02, ge=0.0, le=5.0, description="Slippage percentage")

    # Chronological Walk-Forward Split Ratios (must sum to 100%)
    train_pct: float = Field(default=50.0, ge=20.0, le=80.0, description="Training sample percentage")
    validation_pct: float = Field(default=25.0, ge=10.0, le=40.0, description="Validation sample percentage")
    test_pct: float = Field(default=25.0, ge=10.0, le=40.0, description="Testing sample percentage")

    # Minimum Sample Check Thresholds
    min_test_trades: int = Field(default=5, ge=1, description="Minimum expected test trades for statistical adequacy")
    min_test_candles: int = Field(default=60, ge=10, description="Minimum test period candle count")

    @field_validator("slow_period")
    @classmethod
    def validate_periods(cls, slow: int, info) -> int:
        fast = info.data.get("fast_period")
        if fast is not None and slow <= fast:
            raise ValueError(f"Slow period ({slow}) must be strictly greater than fast period ({fast}).")
        return slow

    @field_validator("test_pct")
    @classmethod
    def validate_split_ratios(cls, test: float, info) -> float:
        train = info.data.get("train_pct", 50.0)
        val = info.data.get("validation_pct", 25.0)
        total = round(train + val + test, 1)
        if total != 100.0:
            raise ValueError(f"Split percentages (train: {train}%, val: {val}%, test: {test}%) must sum to exactly 100% (currently {total}%).")
        return test


class PeriodMetrics(BaseModel):
    """Calculated metrics for an individual chronological sample window."""

    period_name: str  # Train, Validation, Test
    start_date: str
    end_date: str
    candles_count: int
    trade_count: int
    winning_trades: int
    losing_trades: int
    net_return: float
    net_return_pct: float
    buy_and_hold_return_pct: float
    max_drawdown_pct: float
    win_rate_pct: float
    profit_factor: float
    sharpe_ratio: float
    annualized_volatility_pct: float
    total_costs: float


class ParameterSensitivityPoint(BaseModel):
    """Outcome for a specific parameter pair in the sensitivity grid."""

    fast_period: int
    slow_period: int
    net_return_pct: float
    max_drawdown_pct: float
    trade_count: int
    win_rate_pct: float
    is_current_selection: bool = False
    is_profitable: bool = False


class ParameterSensitivitySummary(BaseModel):
    """Aggregated sensitivity insights across the evaluated grid."""

    tested_combinations: int
    profitable_combinations: int
    profitable_ratio_pct: float
    mean_return_pct: float
    return_std_dev: float
    min_return_pct: float
    max_return_pct: float
    is_fragile: bool
    fragility_notes: str


class RegimePerformancePoint(BaseModel):
    """Performance evaluation segmented by market regime."""

    regime: str  # Bull Trend, Bear Trend, Sideways / Volatile
    description: str
    candles_count: int
    trade_count: int
    win_rate_pct: float
    net_pnl: float
    avg_trade_pnl: float
    sample_status: str  # "Adequate" or "Insufficient Sample (< 3 trades)"


class CostStressTestPoint(BaseModel):
    """Simulated results under varying transaction cost regimes."""

    tier: str  # Baseline, Elevated (2x), Severe (4x)
    brokerage_pct: float
    slippage_pct: float
    net_return: float
    net_return_pct: float
    total_costs: float
    is_profitable: bool
    return_degradation_pct: float  # Drop in return relative to baseline


class TradeConcentrationMetrics(BaseModel):
    """Analysis of return dependence on a small number of winning trades."""

    total_trades: int
    winning_trades: int
    gross_winning_profit: float
    top_1_trade_profit: float
    top_1_share_pct: float
    top_3_trades_profit: float
    top_3_share_pct: float
    is_concentrated: bool
    warning: Optional[str] = None


class RobustnessScoreBreakdown(BaseModel):
    """Deterministic, explainable heuristic robustness score."""

    overall_score: float = Field(ge=0.0, le=100.0, description="Heuristic score from 0-100")
    rating: str  # High Robustness, Moderate Robustness, Questionable, Fragile
    formula_version: str = "v1.0-heuristic"
    base_score: float = 100.0
    deductions: Dict[str, float]
    deduction_reasons: List[str]
    disclaimer: str = (
        "Internal quantitative heuristic only. Measures parameter stability, sample adequacy, and cost resilience. "
        "Does NOT constitute an empirical confidence score, probability of future profit, or financial advisory guarantee."
    )


class StrategyDoctorResponse(BaseModel):
    """Comprehensive diagnostic report on strategy robustness and overfitting risk."""

    analysis_id: str
    symbol: str
    strategy: str
    data_source: str = "Yahoo Finance (NSE/BSE)"
    initial_capital: float

    full_period: Dict[str, str]
    train_period: PeriodMetrics
    validation_period: PeriodMetrics
    test_period: PeriodMetrics

    parameter_sensitivity: List[ParameterSensitivityPoint]
    sensitivity_summary: ParameterSensitivitySummary

    regime_analysis: List[RegimePerformancePoint]
    cost_stress_test: List[CostStressTestPoint]
    trade_concentration: TradeConcentrationMetrics

    robustness_score: RobustnessScoreBreakdown

    warnings: List[str]
    limitations: List[str]

    ai_explanation: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ExplainDoctorRequest(BaseModel):
    """Request to generate an AI explanation for an existing Strategy Doctor report."""

    analysis_id: str
