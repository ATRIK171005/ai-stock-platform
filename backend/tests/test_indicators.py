"""Unit tests for Technical Indicator calculations."""
import numpy as np
import pandas as pd
import pytest

from app.services.indicators import (
    calculate_all_indicators,
    compute_atr,
    compute_ema,
    compute_macd,
    compute_rsi,
    compute_sma,
    safe_float,
)


def test_sma_calculation(synthetic_candles_100: pd.DataFrame):
    close = synthetic_candles_100["Close"]
    sma20 = compute_sma(close, 20)
    sma50 = compute_sma(close, 50)

    # First 19 rows of SMA20 must be NaN (warmup)
    assert sma20.iloc[:19].isna().all()
    # Row 20 (index 19) must be valid float
    assert not np.isnan(sma20.iloc[19])
    expected_sma20_at_19 = close.iloc[:20].mean()
    assert pytest.approx(sma20.iloc[19], 0.001) == expected_sma20_at_19

    # First 49 rows of SMA50 must be NaN
    assert sma50.iloc[:49].isna().all()
    assert not np.isnan(sma50.iloc[49])
    expected_sma50_at_49 = close.iloc[:50].mean()
    assert pytest.approx(sma50.iloc[49], 0.001) == expected_sma50_at_49


def test_ema_calculation(synthetic_candles_100: pd.DataFrame):
    close = synthetic_candles_100["Close"]
    ema12 = compute_ema(close, 12)
    ema26 = compute_ema(close, 26)

    # First 11 rows of EMA12 are NaN
    assert ema12.iloc[:11].isna().all()
    assert not np.isnan(ema12.iloc[11])

    # First 25 rows of EMA26 are NaN
    assert ema26.iloc[:25].isna().all()
    assert not np.isnan(ema26.iloc[25])


def test_rsi_bounds_and_warmup(synthetic_candles_100: pd.DataFrame):
    close = synthetic_candles_100["Close"]
    rsi = compute_rsi(close, 14)

    # Warmup period check
    assert rsi.iloc[:14].isna().all()

    # Valid values must be within [0, 100]
    valid_rsi = rsi.dropna()
    assert len(valid_rsi) > 0
    assert (valid_rsi >= 0.0).all()
    assert (valid_rsi <= 100.0).all()


def test_macd_calculation(synthetic_candles_100: pd.DataFrame):
    close = synthetic_candles_100["Close"]
    macd_line, sig_line, hist = compute_macd(close, 12, 26, 9)

    # MACD requires at least 26 rows to start
    assert macd_line.iloc[:25].isna().all()
    assert not np.isnan(macd_line.iloc[25])

    # Histogram = MACD - Signal
    valid_mask = hist.notna()
    diff = (macd_line[valid_mask] - sig_line[valid_mask]) - hist[valid_mask]
    assert (diff.abs() < 1e-6).all()


def test_atr_calculation(synthetic_candles_100: pd.DataFrame):
    atr = compute_atr(synthetic_candles_100, 14)

    # Warmup check
    assert atr.iloc[:13].isna().all()
    valid_atr = atr.dropna()
    # ATR is always non-negative
    assert (valid_atr > 0).all()


def test_insufficient_history():
    # Only 5 candles
    short_df = pd.DataFrame({
        "Open": [10, 11, 12, 13, 14],
        "High": [12, 13, 14, 15, 16],
        "Low": [9, 10, 11, 12, 13],
        "Close": [11, 12, 13, 14, 15],
        "Volume": [100, 200, 300, 400, 500],
    })
    enriched = calculate_all_indicators(short_df)
    # SMA20 and SMA50 must be completely NaN
    assert enriched["SMA20"].isna().all()
    assert enriched["SMA50"].isna().all()
    assert enriched["RSI14"].isna().all()


def test_safe_float_helper():
    assert safe_float(None) is None
    assert safe_float(np.nan) is None
    assert safe_float(float("inf")) is None
    assert safe_float(123.456) == 123.46
    assert safe_float(0.0) == 0.0
