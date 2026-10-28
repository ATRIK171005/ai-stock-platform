"""Technical indicator calculations using pandas and NumPy.

Strictly preserves chronological ordering, avoids look-ahead bias,
and assigns None for warm-up periods.
"""
from datetime import datetime, timezone
from typing import List, Optional, Tuple
import numpy as np
import pandas as pd

from ..schemas.indicators import (
    CandleWithIndicators,
    IndicatorValues,
    StockIndicatorsResponse,
)


def compute_sma(series: pd.Series, window: int) -> pd.Series:
    """Computes Simple Moving Average with exact min_periods warm-up."""
    return series.rolling(window=window, min_periods=window).mean()


def compute_ema(series: pd.Series, span: int) -> pd.Series:
    """Computes Exponential Moving Average with min_periods warm-up."""
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Computes Relative Strength Index using Wilder's smoothing."""
    if len(series) < period + 1:
        return pd.Series(index=series.index, data=[np.nan] * len(series))

    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    # Wilder's Smoothing: ewm with alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))

    # Where avg_loss is 0 and avg_gain > 0, RSI is 100
    rsi = rsi.where(~((avg_loss == 0) & (avg_gain > 0)), 100.0)
    # Where both are 0, RSI is 50
    rsi = rsi.where(~((avg_loss == 0) & (avg_gain == 0)), 50.0)

    return rsi


def compute_macd(
    series: pd.Series,
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9,
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Computes MACD line, signal line, and histogram."""
    ema_fast = compute_ema(series, span=fast_period)
    ema_slow = compute_ema(series, span=slow_period)

    macd_line = ema_fast - ema_slow

    # Compute signal line over MACD line
    signal_line = macd_line.ewm(span=signal_period, adjust=False, min_periods=signal_period).mean()
    histogram = macd_line - signal_line

    return macd_line, signal_line, histogram


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Computes Average True Range over High, Low, Close."""
    if len(df) < 2:
        return pd.Series(index=df.index, data=[np.nan] * len(df))

    high = df["High"]
    low = df["Low"]
    prev_close = df["Close"].shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Wilder's smoothing for ATR
    atr = tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    return atr


def calculate_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Calculates all standard technical indicators and attaches them to DataFrame."""
    res_df = df.copy()

    close = res_df["Close"]
    res_df["SMA20"] = compute_sma(close, 20)
    res_df["SMA50"] = compute_sma(close, 50)
    res_df["EMA12"] = compute_ema(close, 12)
    res_df["EMA26"] = compute_ema(close, 26)
    res_df["RSI14"] = compute_rsi(close, 14)

    macd_line, sig_line, hist = compute_macd(close, 12, 26, 9)
    res_df["MACD_Line"] = macd_line
    res_df["MACD_Signal"] = sig_line
    res_df["MACD_Hist"] = hist

    res_df["ATR14"] = compute_atr(res_df, 14)

    return res_df


def safe_float(val) -> Optional[float]:
    """Helper to convert float/nan to JSON-friendly Optional[float]."""
    if val is None or pd.isna(val) or np.isnan(val) or np.isinf(val):
        return None
    return round(float(val), 2)


def build_indicators_response(
    symbol: str,
    df_with_indicators: pd.DataFrame,
    source: str = "Yahoo Finance (NSE/BSE)",
    period: str = "1y",
    interval: str = "1d",
) -> StockIndicatorsResponse:
    """Transforms enriched DataFrame into structured StockIndicatorsResponse."""
    candles: List[CandleWithIndicators] = []

    for idx, row in df_with_indicators.iterrows():
        # Timestamp formatting
        if hasattr(idx, "strftime"):
            time_str = idx.strftime("%Y-%m-%d")
        else:
            time_str = str(idx)[:10]

        candle = CandleWithIndicators(
            time=time_str,
            open=round(float(row["Open"]), 2),
            high=round(float(row["High"]), 2),
            low=round(float(row["Low"]), 2),
            close=round(float(row["Close"]), 2),
            volume=int(row["Volume"]),
            indicators=IndicatorValues(
                sma20=safe_float(row.get("SMA20")),
                sma50=safe_float(row.get("SMA50")),
                ema12=safe_float(row.get("EMA12")),
                ema26=safe_float(row.get("EMA26")),
                rsi14=safe_float(row.get("RSI14")),
                macd_line=safe_float(row.get("MACD_Line")),
                signal_line=safe_float(row.get("MACD_Signal")),
                macd_histogram=safe_float(row.get("MACD_Hist")),
                atr14=safe_float(row.get("ATR14")),
            ),
        )
        candles.append(candle)

    # Get latest row for summary
    latest_row = df_with_indicators.iloc[-1]
    latest_indicators = IndicatorValues(
        sma20=safe_float(latest_row.get("SMA20")),
        sma50=safe_float(latest_row.get("SMA50")),
        ema12=safe_float(latest_row.get("EMA12")),
        ema26=safe_float(latest_row.get("EMA26")),
        rsi14=safe_float(latest_row.get("RSI14")),
        macd_line=safe_float(latest_row.get("MACD_Line")),
        signal_line=safe_float(latest_row.get("MACD_Signal")),
        macd_histogram=safe_float(latest_row.get("MACD_Hist")),
        atr14=safe_float(latest_row.get("ATR14")),
    )

    # Determine trend score & summary
    score = 50
    close_val = latest_row["Close"]

    if latest_indicators.sma20 is not None:
        if close_val > latest_indicators.sma20:
            score += 15
        else:
            score -= 15

    if latest_indicators.sma20 is not None and latest_indicators.sma50 is not None:
        if latest_indicators.sma20 > latest_indicators.sma50:
            score += 15
        else:
            score -= 15

    if latest_indicators.rsi14 is not None:
        if 50 <= latest_indicators.rsi14 <= 70:
            score += 10
        elif latest_indicators.rsi14 > 70:
            score -= 5  # overbought caution
        elif latest_indicators.rsi14 < 40:
            score -= 10

    if latest_indicators.macd_histogram is not None:
        if latest_indicators.macd_histogram > 0:
            score += 10
        else:
            score -= 10

    trend_score = max(5, min(95, score))

    if trend_score >= 70:
        trend_summary = "BULLISH"
    elif trend_score <= 35:
        trend_summary = "BEARISH"
    else:
        trend_summary = "NEUTRAL"

    now_iso = datetime.now(timezone.utc).isoformat()

    return StockIndicatorsResponse(
        symbol=symbol,
        source=source,
        interval=interval,
        period=period,
        last_updated=now_iso,
        is_delayed=True,
        total_candles=len(candles),
        latest_indicators=latest_indicators,
        trend_summary=trend_summary,
        trend_score=trend_score,
        candles=candles,
    )
