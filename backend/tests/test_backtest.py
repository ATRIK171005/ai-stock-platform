"""Unit and integration tests for historical backtesting engine with zero look-ahead bias."""
from datetime import datetime, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient
import pandas as pd

from app.schemas.backtest import BacktestRequest, StrategyType
from app.services.backtest_engine import BacktestEngine


def generate_synthetic_crossover_data(n_bars: int = 100) -> pd.DataFrame:
    """Creates a deterministic DataFrame with clear crossover patterns."""
    start_date = datetime(2024, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(n_bars)]

    # First 40 bars: flat 100.0
    # Bars 40-60: uptrend to 150.0 (Fast crosses above Slow around bar 45)
    # Bars 60-80: downtrend to 90.0 (Fast crosses below Slow around bar 68)
    # Bars 80-100: consolidation around 95.0
    prices = []
    for i in range(n_bars):
        if i < 40:
            prices.append(100.0)
        elif i < 60:
            prices.append(100.0 + (i - 40) * 2.5)
        elif i < 80:
            prices.append(150.0 - (i - 60) * 3.0)
        else:
            prices.append(90.0 + (i - 80) * 0.25)

    records = []
    for d, p in zip(dates, prices):
        records.append({
            "Date": d,
            "Open": round(p * 0.995, 2),
            "High": round(p * 1.015, 2),
            "Low": round(p * 0.985, 2),
            "Close": round(p, 2),
            "Volume": 1000000,
        })
    df = pd.DataFrame(records)
    return df.set_index("Date")


def test_chronological_execution_timing_at_next_bar_open():
    """Validates that a signal on candle t executes strictly at candle t+1 Open with slippage."""
    df = generate_synthetic_crossover_data(90)
    req = BacktestRequest(
        symbol="RELIANCE.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=100000.0,
        position_size_pct=100.0,
        brokerage_pct=0.05,
        slippage_pct=0.10,  # 0.1% slippage
    )

    engine = BacktestEngine(df, req)
    res = engine.run()

    assert len(res.trades) > 0, "Expected at least one trade executed."
    first_trade = res.trades[0]

    # Find the row corresponding to entry_date in df
    date_strs = [str(d)[:10] for d in df.index]
    entry_idx = date_strs.index(first_trade.entry_date)

    # The entry occurred at entry_idx. The signal must have been generated at entry_idx - 1!
    assert entry_idx >= 1
    # Check that entry price matches open of entry_idx * (1 + slippage)
    expected_entry_open = float(df["Open"].iloc[entry_idx])
    expected_entry_with_slippage = round(expected_entry_open * (1.0 + 0.001), 2)
    assert abs(first_trade.entry_price - expected_entry_with_slippage) <= 0.05


def test_future_data_invariance_no_lookahead_leakage():
    """Future data invariance test:

    Adding new future candles to the end of the historical series MUST NOT alter
    any trades or signals that occurred in the earlier window.
    """
    df_short = generate_synthetic_crossover_data(80)
    df_long = generate_synthetic_crossover_data(120)

    # First 80 rows must match exactly
    pd.testing.assert_frame_equal(df_short, df_long.iloc[:80])

    req = BacktestRequest(
        symbol="TCS.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=100000.0,
        brokerage_pct=0.05,
        slippage_pct=0.02,
        end_date=str(df_short.index[-1])[:10],  # test window bounded to short length
    )

    res_short = BacktestEngine(df_short, req).run()
    res_long = BacktestEngine(df_long, req).run()

    # The executed trades up to end_date must be identical
    assert len(res_short.trades) == len(res_long.trades)
    for t_s, t_l in zip(res_short.trades, res_long.trades):
        assert t_s.entry_date == t_l.entry_date
        assert t_s.entry_price == t_l.entry_price
        assert t_s.exit_date == t_l.exit_date
        assert t_s.exit_price == t_l.exit_price
        assert t_s.quantity == t_l.quantity
        assert t_s.net_pnl == t_l.net_pnl


def test_slippage_and_brokerage_cost_deduction():
    """Ensures slippage and brokerage are deducted on both entry and exit legs."""
    df = generate_synthetic_crossover_data(90)
    req = BacktestRequest(
        symbol="INFY.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=50000.0,
        brokerage_pct=0.10,  # 0.1% per leg
        slippage_pct=0.05,   # 0.05% slippage
    )

    res = BacktestEngine(df, req).run()
    assert res.metrics.total_costs > 0

    for trade in res.trades:
        # Net PnL must equal Gross PnL - Total Costs
        calculated_net = round(trade.gross_pnl - trade.costs, 2)
        assert abs(trade.net_pnl - calculated_net) <= 0.05
        assert trade.costs > 0


def test_stop_loss_trigger_and_conservative_conflict_handling():
    """Tests stop-loss exit and conservative resolution when both SL and TP are hit on the same candle."""
    dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(50)]
    records = []

    # First 25 bars: flat around 100.0
    # Bars 25-29: jump to 120.0 causing fast SMA to cross slow SMA without hitting 5% TP
    # Bar 30: extreme volatility candle where Low drops below entry SL AND High jumps above entry TP
    for i in range(50):
        if i < 25:
            p, h, l, o = 100.0, 101.0, 99.0, 100.0
        elif i < 30:
            p, h, l, o = 120.0, 121.0, 119.0, 120.0
        elif i == 30:
            # Conflict bar: open=120, low=100 (breaches 5% SL of ~114), high=135 (breaches 5% TP of ~126)
            p, h, l, o = 120.0, 135.0, 100.0, 120.0
        else:
            p, h, l, o = 120.0, 121.0, 119.0, 120.0

        records.append({
            "Date": dates[i],
            "Open": o,
            "High": h,
            "Low": l,
            "Close": p,
            "Volume": 100000,
        })

    df = pd.DataFrame(records).set_index("Date")

    req = BacktestRequest(
        symbol="CONFLICT.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=100000.0,
        stop_loss_pct=5.0,    # 5% SL
        take_profit_pct=5.0,  # 5% TP
    )

    res = BacktestEngine(df, req).run()

    # Find the trade that was active around bar 30
    conflict_trades = [t for t in res.trades if "Stop-Loss" in t.reason]
    assert len(conflict_trades) >= 1, "Conservative rule must trigger Stop-Loss when both SL and TP are reached."


def test_position_sizing_and_capital_preservation():
    """Ensures quantity purchased is strictly bounded by position_size_pct and available cash."""
    df = generate_synthetic_crossover_data(80)
    req = BacktestRequest(
        symbol="RELIANCE.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=10000.0,
        position_size_pct=50.0,  # Only allocate 50% max per trade
        brokerage_pct=0.05,
        slippage_pct=0.02,
    )

    res = BacktestEngine(df, req).run()
    for trade in res.trades:
        invested = trade.quantity * trade.entry_price
        # Should not exceed ~50% of capital at time of entry (with slight buffer for rounding)
        assert invested <= 5500.0


def test_metrics_integrity():
    """Verifies that mathematical relationships between metrics hold true."""
    df = generate_synthetic_crossover_data(90)
    req = BacktestRequest(
        symbol="RELIANCE.NS",
        strategy=StrategyType.SMA_CROSSOVER,
        fast_period=5,
        slow_period=15,
        initial_capital=100000.0,
        brokerage_pct=0.05,
        slippage_pct=0.02,
    )

    res = BacktestEngine(df, req).run()

    # Net Return = Final Capital - Initial Capital
    expected_net = round(res.final_capital - res.initial_capital, 2)
    assert abs(res.net_return - expected_net) <= 0.05

    # Max Drawdown should be non-negative
    assert res.max_drawdown_pct >= 0.0

    # Win rate sanity
    if res.total_trades > 0:
        assert 0.0 <= res.win_rate_pct <= 100.0
        assert res.winning_trades + res.losing_trades == res.total_trades
    else:
        assert res.win_rate_pct == 0.0


def test_api_run_backtest_success(client: TestClient):
    """Integration test for POST /api/backtests/run."""
    df = generate_synthetic_crossover_data(80)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        payload = {
            "symbol": "TCS.NS",
            "strategy": "SMA_CROSSOVER",
            "fast_period": 5,
            "slow_period": 15,
            "initial_capital": 100000,
            "position_size_pct": 100,
            "brokerage_pct": 0.05,
            "slippage_pct": 0.02,
        }
        response = client.post("/api/backtests/run", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert "backtest_id" in data
        assert data["symbol"] == "TCS.NS"
        assert data["strategy"] == "SMA_CROSSOVER"
        assert "equity_curve" in data
        assert len(data["equity_curve"]) > 0
        assert "metrics" in data
        assert "trades" in data

        # Check retrieval via GET /api/backtests/{backtest_id}
        bt_id = data["backtest_id"]
        get_res = client.get(f"/api/backtests/{bt_id}")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["backtest_id"] == bt_id
        assert get_data["final_capital"] == data["final_capital"]


def test_api_run_backtest_validation_error(client: TestClient):
    """POST /api/backtests/run with fast_period >= slow_period must fail validation."""
    payload = {
        "symbol": "INFY.NS",
        "strategy": "SMA_CROSSOVER",
        "fast_period": 50,
        "slow_period": 20,  # Fast >= Slow is invalid
    }
    response = client.post("/api/backtests/run", json=payload)
    assert response.status_code == 422


def test_api_get_backtest_not_found(client: TestClient):
    """GET /api/backtests/{backtest_id} with nonexistent id returns 404."""
    response = client.get("/api/backtests/bt_nonexistent_12345")
    assert response.status_code == 404
    data = response.json()
    assert data["error_code"] == "BACKTEST_NOT_FOUND"
