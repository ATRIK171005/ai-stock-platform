"""Unit tests for Rule-Based Signal Engine."""
import pandas as pd

from app.schemas.signals import SignalType
from app.services.indicators import calculate_all_indicators
from app.services.signal_engine import generate_crossover_signal


def test_buy_crossover_signal(synthetic_crossover_buy: pd.DataFrame):
    enriched = calculate_all_indicators(synthetic_crossover_buy)
    signal_res = generate_crossover_signal("RELIANCE.NS", enriched)

    assert signal_res.symbol == "RELIANCE.NS"
    assert signal_res.signal == SignalType.BUY
    assert signal_res.confidence >= 0.70
    assert "Golden Cross Confirmed" in signal_res.reasons[0]
    assert len(signal_res.risks) >= 1
    assert "Not SEBI registered" in signal_res.disclaimer
    assert signal_res.support_level is not None
    assert signal_res.resistance_level is not None


def test_sell_crossover_signal(synthetic_crossover_sell: pd.DataFrame):
    enriched = calculate_all_indicators(synthetic_crossover_sell)
    signal_res = generate_crossover_signal("TCS.NS", enriched)

    assert signal_res.symbol == "TCS.NS"
    assert signal_res.signal == SignalType.SELL
    assert signal_res.confidence >= 0.70
    assert "Death Cross Confirmed" in signal_res.reasons[0]
    assert len(signal_res.risks) >= 1
    assert "Not SEBI registered" in signal_res.disclaimer


def test_hold_signal(synthetic_candles_100: pd.DataFrame):
    enriched = calculate_all_indicators(synthetic_candles_100)
    signal_res = generate_crossover_signal("INFY.NS", enriched)

    # In steady uptrend without an exact crossover on the current candle, it must be HOLD
    # (Do not treat every candle above MA as a new BUY signal)
    curr_sma20 = enriched["SMA20"].iloc[-1]
    curr_sma50 = enriched["SMA50"].iloc[-1]
    prev_sma20 = enriched["SMA20"].iloc[-2]
    prev_sma50 = enriched["SMA50"].iloc[-2]

    # If neither cross happened on the last day, it must be HOLD
    if not (prev_sma20 <= prev_sma50 and curr_sma20 > curr_sma50) and not (prev_sma20 >= prev_sma50 and curr_sma20 < curr_sma50):
        assert signal_res.signal == SignalType.HOLD
        assert "Sustained" in signal_res.reasons[0]


def test_insufficient_data_signal():
    short_df = pd.DataFrame({
        "Open": [100.0] * 10,
        "High": [105.0] * 10,
        "Low": [95.0] * 10,
        "Close": [102.0] * 10,
        "Volume": [1000] * 10,
    })
    enriched = calculate_all_indicators(short_df)
    signal_res = generate_crossover_signal("HDFCBANK.NS", enriched)

    assert signal_res.signal == SignalType.HOLD
    assert "Insufficient historical data" in signal_res.reasons[0]
