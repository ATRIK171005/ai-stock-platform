"""Stock technical indicators and rule-based signal routes with validation."""
from fastapi import APIRouter, Query

from ...schemas.indicators import StockIndicatorsResponse
from ...schemas.signals import StockSignalResponse
from ...services.indicators import (
    build_indicators_response,
    calculate_all_indicators,
)
from ...services.market_data import default_market_provider
from ...services.signal_engine import generate_crossover_signal
from .stocks import validate_period_and_interval, validate_symbol_format

router = APIRouter(prefix="/stocks", tags=["Technical Indicators & Signals"])


@router.get("/{symbol}/indicators", response_model=StockIndicatorsResponse)
def get_stock_indicators(
    symbol: str,
    period: str = Query(default="1y", description="History period (1mo, 3mo, 6mo, 1y, 2y, 5y)"),
    interval: str = Query(default="1d", description="Candle interval (1d, 1wk, 1mo)"),
) -> StockIndicatorsResponse:
    """Computes SMA20, SMA50, EMA12, EMA26, RSI14, MACD, and ATR14 over chronological data."""
    validate_symbol_format(symbol)
    validate_period_and_interval(period, interval)

    clean_sym, _ = default_market_provider.normalize_symbol(symbol)
    df = default_market_provider.fetch_history(clean_sym, period=period, interval=interval)

    enriched_df = calculate_all_indicators(df)
    return build_indicators_response(
        symbol=clean_sym,
        df_with_indicators=enriched_df,
        source="Yahoo Finance (NSE/BSE)",
        period=period,
        interval=interval,
    )


@router.get("/{symbol}/signal", response_model=StockSignalResponse)
def get_stock_signal(
    symbol: str,
    period: str = Query(default="1y", description="History period"),
    interval: str = Query(default="1d", description="Candle interval"),
) -> StockSignalResponse:
    """Generates an explainable, deterministic rule-based crossover signal."""
    validate_symbol_format(symbol)
    validate_period_and_interval(period, interval)

    clean_sym, _ = default_market_provider.normalize_symbol(symbol)
    df = default_market_provider.fetch_history(clean_sym, period=period, interval=interval)

    enriched_df = calculate_all_indicators(df)
    return generate_crossover_signal(
        symbol=clean_sym,
        df_with_indicators=enriched_df,
        source="Yahoo Finance (NSE/BSE)",
    )
