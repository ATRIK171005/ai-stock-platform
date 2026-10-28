"""Deterministic rule-based signal generation engine.

Executes quantitative crossover analysis between moving averages,
evaluates momentum confirmation, and generates explainable signals.
"""
from datetime import datetime, timezone
from typing import List
import pandas as pd

from ..schemas.signals import SignalType, StockSignalResponse


def generate_crossover_signal(
    symbol: str,
    df_with_indicators: pd.DataFrame,
    source: str = "Yahoo Finance (NSE/BSE)",
) -> StockSignalResponse:
    """Evaluates dual SMA crossover strategy on chronological data.

    Rules:
    - BUY: SMA20 crosses above SMA50 at the current candle (i.e. SMA20[t-1] <= SMA50[t-1] and SMA20[t] > SMA50[t])
    - SELL: SMA20 crosses below SMA50 at the current candle (i.e. SMA20[t-1] >= SMA50[t-1] and SMA20[t] < SMA50[t])
    - HOLD: No active crossover on the current candle.
    """
    if len(df_with_indicators) < 51:
        # Insufficient data for 50 SMA crossover
        now_iso = datetime.now(timezone.utc).isoformat()
        return StockSignalResponse(
            symbol=symbol,
            signal=SignalType.HOLD,
            confidence=0.50,
            strategy="SMA Crossover (20/50)",
            signal_timestamp=now_iso,
            data_source=source,
            data_timestamp=str(df_with_indicators.index[-1])[:10] if not df_with_indicators.empty else now_iso[:10],
            indicator_values={},
            reasons=["Insufficient historical data (less than 51 sessions) to evaluate 50-period SMA crossover."],
            risks=["Lack of sufficient history prevents reliable quantitative analysis."],
        )

    # Filter to rows with valid SMA20 and SMA50
    valid_mask = df_with_indicators["SMA20"].notna() & df_with_indicators["SMA50"].notna()
    valid_df = df_with_indicators[valid_mask]

    if len(valid_df) < 2:
        now_iso = datetime.now(timezone.utc).isoformat()
        return StockSignalResponse(
            symbol=symbol,
            signal=SignalType.HOLD,
            confidence=0.50,
            strategy="SMA Crossover (20/50)",
            signal_timestamp=now_iso,
            data_source=source,
            data_timestamp=str(df_with_indicators.index[-1])[:10],
            indicator_values={},
            reasons=["Warm-up period in progress. Less than 2 candles with fully calculated 50-day moving averages."],
            risks=["Warm-up boundary prevents crossover detection."],
        )

    curr_row = valid_df.iloc[-1]
    prev_row = valid_df.iloc[-2]

    curr_close = float(curr_row["Close"])
    curr_sma20 = float(curr_row["SMA20"])
    curr_sma50 = float(curr_row["SMA50"])

    prev_sma20 = float(prev_row["SMA20"])
    prev_sma50 = float(prev_row["SMA50"])

    # Optional supplementary indicators
    rsi_val = float(curr_row["RSI14"]) if pd.notna(curr_row.get("RSI14")) else None
    macd_hist = float(curr_row["MACD_Hist"]) if pd.notna(curr_row.get("MACD_Hist")) else None
    atr_val = float(curr_row["ATR14"]) if pd.notna(curr_row.get("ATR14")) else None

    # Calculate recent dynamic pivots (past 20 sessions)
    recent_slice = df_with_indicators.iloc[-20:]
    support_level = round(float(recent_slice["Low"].min()), 2)
    resistance_level = round(float(recent_slice["High"].max()), 2)

    # Detect exact crossovers
    is_bullish_crossover = (prev_sma20 <= prev_sma50) and (curr_sma20 > curr_sma50)
    is_bearish_crossover = (prev_sma20 >= prev_sma50) and (curr_sma20 < curr_sma50)

    reasons: List[str] = []
    risks: List[str] = []
    confidence: float = 0.50

    if is_bullish_crossover:
        signal = SignalType.BUY
        confidence = 0.78
        reasons.append(
            f"Golden Cross Confirmed: 20-day SMA (₹{curr_sma20:.2f}) crossed decisively above 50-day SMA (₹{curr_sma50:.2f})."
        )
        reasons.append(f"Current closing price ₹{curr_close:.2f} is sustaining above both moving average baselines.")
        if rsi_val is not None:
            if 45 <= rsi_val <= 68:
                confidence += 0.05
                reasons.append(f"RSI-14 ({rsi_val:.1f}) confirms healthy upward momentum without overbought exhaustion.")
            elif rsi_val > 70:
                risks.append(f"RSI is currently elevated ({rsi_val:.1f}), signaling short-term overbought pullback risk.")
        if macd_hist is not None and macd_hist > 0:
            reasons.append(f"MACD histogram (+{macd_hist:.2f}) confirms expanding bullish velocity.")

        risks.append(f"Overhead resistance near recent 20-session peak at ₹{resistance_level:.2f}.")
        risks.append("Broad market volatility across Indian benchmark indices (NIFTY/SENSEX) can trigger false breakouts.")

    elif is_bearish_crossover:
        signal = SignalType.SELL
        confidence = 0.75
        reasons.append(
            f"Death Cross Confirmed: 20-day SMA (₹{curr_sma20:.2f}) broke below 50-day SMA (₹{curr_sma50:.2f})."
        )
        reasons.append(f"Price ₹{curr_close:.2f} is trading beneath moving average trendlines.")
        if rsi_val is not None and rsi_val < 50:
            reasons.append(f"RSI-14 ({rsi_val:.1f}) indicates persistent institutional selling pressure.")

        risks.append(f"Key dynamic support situated near recent 20-session low at ₹{support_level:.2f}.")
        risks.append("Oversold counter-trend bounces or sudden positive corporate disclosures may cause whip-saws.")

    else:
        # No fresh crossover -> HOLD
        signal = SignalType.HOLD
        confidence = 0.60

        if curr_sma20 > curr_sma50:
            reasons.append(
                f"Bullish Trend Sustained: 20 SMA (₹{curr_sma20:.2f}) remains above 50 SMA (₹{curr_sma50:.2f}), but no new crossover occurred today."
            )
            reasons.append("Prior BUY signal remains active. Wait for next directional crossover or exit trigger.")
            if rsi_val is not None:
                reasons.append(f"Current RSI is {rsi_val:.1f}.")
        else:
            reasons.append(
                f"Bearish Trend Sustained: 20 SMA (₹{curr_sma20:.2f}) remains below 50 SMA (₹{curr_sma50:.2f})."
            )
            reasons.append("No bullish crossover observed on current candle. Maintain defensive HOLD stance.")

        risks.append("Consolidation within trading range can lead to delayed trend identification.")
        if atr_val is not None:
            risks.append(f"Daily volatility (ATR ₹{atr_val:.2f}) may produce wide intraday oscillations.")

    # Indicator values snapshot
    indicator_values = {
        "price": round(curr_close, 2),
        "sma20": round(curr_sma20, 2),
        "sma50": round(curr_sma50, 2),
        "prev_sma20": round(prev_sma20, 2),
        "prev_sma50": round(prev_sma50, 2),
        "rsi14": round(rsi_val, 2) if rsi_val is not None else None,
        "macd_hist": round(macd_hist, 2) if macd_hist is not None else None,
        "atr14": round(atr_val, 2) if atr_val is not None else None,
    }

    # Timestamp from candle index
    candle_idx = curr_row.name
    data_timestamp = candle_idx.strftime("%Y-%m-%d") if hasattr(candle_idx, "strftime") else str(candle_idx)[:10]
    now_iso = datetime.now(timezone.utc).isoformat()

    return StockSignalResponse(
        symbol=symbol,
        signal=signal,
        confidence=min(1.0, max(0.1, round(confidence, 2))),
        strategy="SMA Crossover (20/50)",
        signal_timestamp=now_iso,
        data_source=source,
        data_timestamp=data_timestamp,
        indicator_values=indicator_values,
        reasons=reasons,
        risks=risks,
        support_level=support_level,
        resistance_level=resistance_level,
    )
