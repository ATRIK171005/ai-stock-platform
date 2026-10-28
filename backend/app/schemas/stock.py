from typing import List, Optional
from pydantic import BaseModel, Field


class OHLCVCandle(BaseModel):
    time: str = Field(description="ISO 8601 date string (YYYY-MM-DD) or timestamp")
    open: float = Field(description="Opening price")
    high: float = Field(description="High price")
    low: float = Field(description="Low price")
    close: float = Field(description="Closing price")
    volume: int = Field(description="Trading volume")


class StockHistoryResponse(BaseModel):
    symbol: str = Field(description="Standardized equity ticker (e.g., RELIANCE.NS)")
    exchange: str = Field(description="Exchange name (NSE or BSE)")
    source: str = Field(description="Market data source provider")
    interval: str = Field(description="Data interval (e.g., 1d)")
    period: str = Field(description="Data period (e.g., 1y)")
    last_updated: str = Field(description="Timestamp when the data was retrieved")
    is_delayed: bool = Field(default=True, description="True if prices are potentially delayed")
    total_candles: int = Field(description="Number of candles returned")
    candles: List[OHLCVCandle] = Field(description="Chronological OHLCV candles")


class StockSearchResult(BaseModel):
    symbol: str = Field(description="Exchange ticker (e.g., TCS.NS)")
    name: str = Field(description="Full company name")
    exchange: str = Field(description="NSE or BSE")
    sector: Optional[str] = Field(default=None, description="Industry sector")


class StockSearchResponse(BaseModel):
    query: str
    total: int
    results: List[StockSearchResult]
