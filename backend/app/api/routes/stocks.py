"""Stock search and historical market data routes with strict input validation."""
from datetime import datetime, timezone
import re
from typing import List
from fastapi import APIRouter, Query

from ...core.exceptions import InvalidSymbolError, ValidationError
from ...schemas.stock import (
    OHLCVCandle,
    StockHistoryResponse,
    StockSearchResponse,
)
from ...services.market_data import default_market_provider

router = APIRouter(prefix="/stocks", tags=["Stocks"])

SYMBOL_REGEX = re.compile(r"^[A-Za-z0-9_\.\^]{1,20}$")
ALLOWED_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}
ALLOWED_INTERVALS = {"1d", "1wk", "1mo"}


def validate_symbol_format(symbol: str) -> None:
    if not symbol or not SYMBOL_REGEX.match(symbol):
        raise InvalidSymbolError(f"Malformed symbol '{symbol}'. Symbol must be 1-20 alphanumeric characters, dots, or underscores.")


def validate_period_and_interval(period: str, interval: str) -> None:
    if period not in ALLOWED_PERIODS:
        raise ValidationError(f"Invalid period '{period}'. Allowed periods: {', '.join(sorted(ALLOWED_PERIODS))}.")
    if interval not in ALLOWED_INTERVALS:
        raise ValidationError(f"Invalid interval '{interval}'. Allowed intervals: {', '.join(sorted(ALLOWED_INTERVALS))}.")


@router.get("/search", response_model=StockSearchResponse)
def search_stocks(
    q: str = Query(default="", max_length=100, description="Search query for Indian stock symbol or name")
) -> StockSearchResponse:
    """Searches supported Indian equities (NSE & BSE)."""
    clean_q = q.strip()
    results = default_market_provider.search_symbols(clean_q)
    return StockSearchResponse(
        query=clean_q,
        total=len(results),
        results=results,
    )


@router.get("/{symbol}/history", response_model=StockHistoryResponse)
def get_stock_history(
    symbol: str,
    period: str = Query(default="1y", description="History period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)"),
    interval: str = Query(default="1d", description="Candle interval (1d, 1wk, 1mo)"),
) -> StockHistoryResponse:
    """Fetches validated, sorted chronological historical OHLCV data for an Indian equity."""
    validate_symbol_format(symbol)
    validate_period_and_interval(period, interval)

    clean_sym, exchange = default_market_provider.normalize_symbol(symbol)
    df = default_market_provider.fetch_history(clean_sym, period=period, interval=interval)

    candles: List[OHLCVCandle] = []
    for idx, row in df.iterrows():
        time_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        candles.append(
            OHLCVCandle(
                time=time_str,
                open=round(float(row["Open"]), 2),
                high=round(float(row["High"]), 2),
                low=round(float(row["Low"]), 2),
                close=round(float(row["Close"]), 2),
                volume=int(row["Volume"]),
            )
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    return StockHistoryResponse(
        symbol=clean_sym,
        exchange=exchange,
        source="Yahoo Finance (NSE/BSE)",
        interval=interval,
        period=period,
        last_updated=now_iso,
        is_delayed=True,
        total_candles=len(candles),
        candles=candles,
    )
