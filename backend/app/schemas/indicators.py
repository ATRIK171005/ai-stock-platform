from typing import List, Optional
from pydantic import BaseModel, Field
from .stock import OHLCVCandle


class IndicatorValues(BaseModel):
    sma20: Optional[float] = Field(default=None, description="20-period Simple Moving Average")
    sma50: Optional[float] = Field(default=None, description="50-period Simple Moving Average")
    ema12: Optional[float] = Field(default=None, description="12-period Exponential Moving Average")
    ema26: Optional[float] = Field(default=None, description="26-period Exponential Moving Average")
    rsi14: Optional[float] = Field(default=None, description="14-period Relative Strength Index")
    macd_line: Optional[float] = Field(default=None, description="MACD line (EMA12 - EMA26)")
    signal_line: Optional[float] = Field(default=None, description="MACD Signal line (EMA9)")
    macd_histogram: Optional[float] = Field(default=None, description="MACD Histogram (MACD - Signal)")
    atr14: Optional[float] = Field(default=None, description="14-period Average True Range")


class CandleWithIndicators(OHLCVCandle):
    indicators: IndicatorValues = Field(description="Calculated technical indicators for this timestamp")


class StockIndicatorsResponse(BaseModel):
    symbol: str = Field(description="Standardized equity ticker")
    source: str = Field(description="Data provider source")
    interval: str = Field(description="Data interval")
    period: str = Field(description="Data period")
    last_updated: str = Field(description="Timestamp of calculation")
    is_delayed: bool = Field(default=True)
    total_candles: int
    latest_indicators: IndicatorValues = Field(description="Most recent valid indicator values")
    trend_summary: str = Field(description="High-level directional summary")
    trend_score: int = Field(ge=0, le=100, description="Quantitative score from 0 (extreme bearish) to 100 (extreme bullish)")
    candles: List[CandleWithIndicators] = Field(description="Chronological candles with indicator series")
