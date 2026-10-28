from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class SignalType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class StockSignalResponse(BaseModel):
    symbol: str = Field(description="Standardized ticker")
    signal: SignalType = Field(description="Deterministic trading signal: BUY, SELL, or HOLD")
    confidence: float = Field(ge=0.0, le=1.0, description="Algorithmic conviction score (0.0 to 1.0)")
    strategy: str = Field(description="Strategy name")
    signal_timestamp: str = Field(description="Timestamp of signal generation")
    data_source: str = Field(description="Data feed source")
    data_timestamp: str = Field(description="Last candle date used")
    indicator_values: Dict[str, Optional[float]] = Field(description="Snapshot of indicators evaluated")
    reasons: List[str] = Field(description="Deterministic human-readable reasons supporting the signal")
    risks: List[str] = Field(description="Important uncertainties and risk factors")
    support_level: Optional[float] = Field(default=None, description="Recent dynamic support pivot")
    resistance_level: Optional[float] = Field(default=None, description="Recent dynamic resistance pivot")
    disclaimer: str = Field(
        default="Rule-based quantitative model output for simulated analysis. Historical behavior does not guarantee future results. Not SEBI registered investment advice.",
        description="Statutory non-advisory disclaimer",
    )
