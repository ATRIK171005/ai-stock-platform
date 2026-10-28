"""Deterministic historical backtesting engine with zero look-ahead bias.

Key Principles:
1. Chronological order processing.
2. Signal generated at candle t (at close) is executed strictly at candle t+1 OPEN price.
3. Slippage and brokerage deducted on both entry and exit.
4. Stop-loss and take-profit intra-candle conflict resolves conservatively in favor of stop-loss.
5. Warm-up periods respected before crossover evaluation.
6. Daily equity curve and standard quantitative metrics (Sharpe ratio, Max Drawdown, Win Rate, Profit Factor).
"""
from collections import OrderedDict
from datetime import datetime, timezone
import math
import threading
from typing import Dict, List, Optional, Tuple
import uuid

import numpy as np
import pandas as pd

from ..schemas.backtest import (
    BacktestMetrics,
    BacktestRequest,
    BacktestResponse,
    BacktestTrade,
    EquityPoint,
    StrategyType,
)
from .indicators import calculate_all_indicators


class BacktestStore:
    """Thread-safe in-memory LRU cache for backtest results."""

    def __init__(self, max_size: int = 100):
        self._max_size = max_size
        self._cache: OrderedDict[str, BacktestResponse] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, backtest_id: str, result: BacktestResponse) -> None:
        with self._lock:
            if backtest_id in self._cache:
                self._cache.move_to_end(backtest_id)
            self._cache[backtest_id] = result
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def get(self, backtest_id: str) -> Optional[BacktestResponse]:
        with self._lock:
            if backtest_id in self._cache:
                self._cache.move_to_end(backtest_id)
                return self._cache[backtest_id]
            return None


# Global store instance
backtest_store = BacktestStore()


class BacktestEngine:
    """Deterministic, bias-free quantitative backtesting engine."""

    def __init__(self, df: pd.DataFrame, request: BacktestRequest):
        """Initializes backtest engine with historical OHLCV data."""
        if df.empty or len(df) < 5:
            raise ValueError("Insufficient historical data to conduct backtest.")

        # Ensure sorted chronologically
        self.raw_df = df.sort_index(ascending=True).copy()
        self.req = request
        self.symbol = request.symbol
        self.initial_capital = float(request.initial_capital)
        self.position_size_pct = float(request.position_size_pct)
        self.brokerage_rate = float(request.brokerage_pct) / 100.0
        self.slippage_rate = float(request.slippage_pct) / 100.0
        self.stop_loss_pct = float(request.stop_loss_pct) / 100.0 if request.stop_loss_pct is not None else None
        self.take_profit_pct = float(request.take_profit_pct) / 100.0 if request.take_profit_pct is not None else None
        self.daily_loss_limit = float(request.daily_loss_limit) if request.daily_loss_limit is not None else None

    def _prepare_indicators(self) -> pd.DataFrame:
        """Precomputes indicators without future data leakage."""
        df = self.raw_df.copy()

        # Compute Fast and Slow SMAs
        df["SMA_fast"] = df["Close"].rolling(window=self.req.fast_period).mean()
        df["SMA_slow"] = df["Close"].rolling(window=self.req.slow_period).mean()

        # Precompute RSI and MACD for multi-strategy support
        enriched = calculate_all_indicators(df)
        df["RSI14"] = enriched["RSI14"]
        df["MACD_Line"] = enriched["MACD_Line"]
        df["MACD_Signal"] = enriched["MACD_Signal"]
        return df

    def _generate_signal_at_bar(self, df: pd.DataFrame, idx: int) -> str:
        """Generates BUY/SELL/HOLD signal evaluated at bar idx close.

        Strictly evaluates data up to idx. Never accesses idx + 1.
        """
        if self.req.strategy == StrategyType.SMA_CROSSOVER:
            if idx < 1:
                return "HOLD"
            fast_curr = df["SMA_fast"].iloc[idx]
            slow_curr = df["SMA_slow"].iloc[idx]
            fast_prev = df["SMA_fast"].iloc[idx - 1]
            slow_prev = df["SMA_slow"].iloc[idx - 1]

            if pd.isna(fast_curr) or pd.isna(slow_curr) or pd.isna(fast_prev) or pd.isna(slow_prev):
                return "HOLD"

            # Golden cross (Bullish crossover)
            if fast_prev <= slow_prev and fast_curr > slow_curr:
                return "BUY"
            # Death cross (Bearish crossover)
            if fast_prev >= slow_prev and fast_curr < slow_curr:
                return "SELL"
            return "HOLD"

        elif self.req.strategy == StrategyType.RSI_MEAN_REVERSION:
            if idx < 1:
                return "HOLD"
            rsi_curr = df["RSI14"].iloc[idx]
            rsi_prev = df["RSI14"].iloc[idx - 1]
            if pd.isna(rsi_curr) or pd.isna(rsi_prev):
                return "HOLD"
            # Crosses above 30 from below (oversold bounce)
            if rsi_prev <= 30.0 and rsi_curr > 30.0:
                return "BUY"
            # Crosses below 70 from above (overbought exit)
            if rsi_prev >= 70.0 and rsi_curr < 70.0:
                return "SELL"
            return "HOLD"

        elif self.req.strategy == StrategyType.MACD_MOMENTUM:
            if idx < 1:
                return "HOLD"
            m_curr = df["MACD_Line"].iloc[idx]
            s_curr = df["MACD_Signal"].iloc[idx]
            m_prev = df["MACD_Line"].iloc[idx - 1]
            s_prev = df["MACD_Signal"].iloc[idx - 1]
            if pd.isna(m_curr) or pd.isna(s_curr) or pd.isna(m_prev) or pd.isna(s_prev):
                return "HOLD"
            if m_prev <= s_prev and m_curr > s_curr:
                return "BUY"
            if m_prev >= s_prev and m_curr < s_curr:
                return "SELL"
            return "HOLD"

        return "HOLD"

    def run(self) -> BacktestResponse:
        """Executes the simulation chronologically bar-by-bar."""
        df = self._prepare_indicators()

        # Extract dates list
        date_strs = [str(d)[:10] for d in df.index]

        # Determine start/end filter bounds
        start_idx = 0
        if self.req.start_date:
            for i, d in enumerate(date_strs):
                if d >= self.req.start_date:
                    start_idx = i
                    break

        end_idx = len(df) - 1
        if self.req.end_date:
            for i in range(len(date_strs) - 1, -1, -1):
                if date_strs[i] <= self.req.end_date:
                    end_idx = i
                    break

        # Ensure start_idx <= end_idx
        if start_idx > end_idx:
            start_idx = 0
            end_idx = len(df) - 1

        cash = self.initial_capital
        holdings_qty = 0
        position_entry_price = 0.0
        position_entry_date = ""
        position_entry_cost = 0.0
        position_entry_reason = ""

        trades: List[BacktestTrade] = []
        equity_curve: List[EquityPoint] = []
        peak_equity = self.initial_capital
        max_drawdown_pct = 0.0

        trade_counter = 1
        daily_loss_tracker: Dict[str, float] = {}

        # Buy & Hold Benchmark initialization
        first_bar_close = float(df["Close"].iloc[start_idx])
        benchmark_shares = self.initial_capital / first_bar_close if first_bar_close > 0 else 1.0

        pending_signal: Optional[Tuple[str, str]] = None  # (signal, reason) generated at bar t to execute at bar t+1

        for i in range(start_idx, end_idx + 1):
            curr_date = date_strs[i]
            open_price = float(df["Open"].iloc[i])
            high_price = float(df["High"].iloc[i])
            low_price = float(df["Low"].iloc[i])
            close_price = float(df["Close"].iloc[i])

            # ----------------------------------------------------
            # Step 1: Execute pending signal at today's OPEN price
            # ----------------------------------------------------
            if pending_signal is not None:
                p_signal, p_reason = pending_signal
                pending_signal = None

                # Process Pending BUY
                if p_signal == "BUY" and holdings_qty == 0:
                    # Check daily loss limit if configured
                    daily_loss = daily_loss_tracker.get(curr_date, 0.0)
                    if self.daily_loss_limit is None or daily_loss < self.daily_loss_limit:
                        # Slippage increases buy execution price
                        exec_price = open_price * (1.0 + self.slippage_rate)
                        # Max capital allocated for this trade
                        available_for_trade = cash * (self.position_size_pct / 100.0)
                        cost_per_share = exec_price * (1.0 + self.brokerage_rate)

                        qty = int(available_for_trade // cost_per_share)
                        if qty > 0:
                            trade_val = qty * exec_price
                            entry_fee = trade_val * self.brokerage_rate
                            total_spent = trade_val + entry_fee

                            if total_spent <= cash:
                                cash -= total_spent
                                holdings_qty = qty
                                position_entry_price = exec_price
                                position_entry_date = curr_date
                                position_entry_cost = entry_fee
                                position_entry_reason = p_reason

                # Process Pending SELL
                elif p_signal == "SELL" and holdings_qty > 0:
                    # Slippage reduces sell execution price
                    exec_price = open_price * (1.0 - self.slippage_rate)
                    trade_val = holdings_qty * exec_price
                    exit_fee = trade_val * self.brokerage_rate
                    net_received = trade_val - exit_fee
                    cash += net_received

                    gross_pnl = (exec_price - position_entry_price) * holdings_qty
                    total_costs = position_entry_cost + exit_fee
                    net_pnl = gross_pnl - total_costs
                    ret_pct = (net_pnl / (position_entry_price * holdings_qty + position_entry_cost)) * 100.0

                    trade_obj = BacktestTrade(
                        id=f"BT-{trade_counter:03d}",
                        entry_date=position_entry_date,
                        exit_date=curr_date,
                        type="BUY",
                        entry_price=round(position_entry_price, 2),
                        exit_price=round(exec_price, 2),
                        quantity=holdings_qty,
                        gross_pnl=round(gross_pnl, 2),
                        net_pnl=round(net_pnl, 2),
                        costs=round(total_costs, 2),
                        return_pct=round(ret_pct, 2),
                        reason=f"Entry: {position_entry_reason} | Exit: {p_reason}",
                    )
                    trades.append(trade_obj)
                    trade_counter += 1

                    # Track realized daily loss
                    if net_pnl < 0:
                        daily_loss_tracker[curr_date] = daily_loss_tracker.get(curr_date, 0.0) + abs(net_pnl)

                    # Reset position
                    holdings_qty = 0
                    position_entry_price = 0.0
                    position_entry_cost = 0.0

            # ----------------------------------------------------
            # Step 2: Intra-candle Stop-Loss & Take-Profit check
            # ----------------------------------------------------
            if holdings_qty > 0 and (self.stop_loss_pct is not None or self.take_profit_pct is not None):
                sl_price = position_entry_price * (1.0 - self.stop_loss_pct) if self.stop_loss_pct else None
                tp_price = position_entry_price * (1.0 + self.take_profit_pct) if self.take_profit_pct else None

                sl_hit = sl_price is not None and low_price <= sl_price
                tp_hit = tp_price is not None and high_price >= tp_price

                # Conservative rule: If BOTH SL and TP are hit on the same candle, assume SL executed first
                if sl_hit:
                    # Gapped below or hit intra-day
                    base_exit = open_price if open_price < sl_price else sl_price
                    exec_price = base_exit * (1.0 - self.slippage_rate)
                    trade_val = holdings_qty * exec_price
                    exit_fee = trade_val * self.brokerage_rate
                    net_received = trade_val - exit_fee
                    cash += net_received

                    gross_pnl = (exec_price - position_entry_price) * holdings_qty
                    total_costs = position_entry_cost + exit_fee
                    net_pnl = gross_pnl - total_costs
                    ret_pct = (net_pnl / (position_entry_price * holdings_qty + position_entry_cost)) * 100.0

                    trade_obj = BacktestTrade(
                        id=f"BT-{trade_counter:03d}",
                        entry_date=position_entry_date,
                        exit_date=curr_date,
                        type="BUY",
                        entry_price=round(position_entry_price, 2),
                        exit_price=round(exec_price, 2),
                        quantity=holdings_qty,
                        gross_pnl=round(gross_pnl, 2),
                        net_pnl=round(net_pnl, 2),
                        costs=round(total_costs, 2),
                        return_pct=round(ret_pct, 2),
                        reason=f"Entry: {position_entry_reason} | Exit: Stop-Loss Triggered at ₹{sl_price:.2f}",
                    )
                    trades.append(trade_obj)
                    trade_counter += 1

                    if net_pnl < 0:
                        daily_loss_tracker[curr_date] = daily_loss_tracker.get(curr_date, 0.0) + abs(net_pnl)

                    holdings_qty = 0
                    position_entry_price = 0.0
                    position_entry_cost = 0.0

                elif tp_hit:
                    base_exit = open_price if open_price > tp_price else tp_price
                    exec_price = base_exit * (1.0 - self.slippage_rate)
                    trade_val = holdings_qty * exec_price
                    exit_fee = trade_val * self.brokerage_rate
                    net_received = trade_val - exit_fee
                    cash += net_received

                    gross_pnl = (exec_price - position_entry_price) * holdings_qty
                    total_costs = position_entry_cost + exit_fee
                    net_pnl = gross_pnl - total_costs
                    ret_pct = (net_pnl / (position_entry_price * holdings_qty + position_entry_cost)) * 100.0

                    trade_obj = BacktestTrade(
                        id=f"BT-{trade_counter:03d}",
                        entry_date=position_entry_date,
                        exit_date=curr_date,
                        type="BUY",
                        entry_price=round(position_entry_price, 2),
                        exit_price=round(exec_price, 2),
                        quantity=holdings_qty,
                        gross_pnl=round(gross_pnl, 2),
                        net_pnl=round(net_pnl, 2),
                        costs=round(total_costs, 2),
                        return_pct=round(ret_pct, 2),
                        reason=f"Entry: {position_entry_reason} | Exit: Take-Profit Hit at ₹{tp_price:.2f}",
                    )
                    trades.append(trade_obj)
                    trade_counter += 1

                    holdings_qty = 0
                    position_entry_price = 0.0
                    position_entry_cost = 0.0

            # ----------------------------------------------------
            # Step 3: Record end-of-day equity point
            # ----------------------------------------------------
            holdings_value = holdings_qty * close_price
            portfolio_equity = cash + holdings_value
            benchmark_val = benchmark_shares * close_price

            if portfolio_equity > peak_equity:
                peak_equity = portfolio_equity

            drawdown_pct = ((peak_equity - portfolio_equity) / peak_equity) * 100.0 if peak_equity > 0 else 0.0
            if drawdown_pct > max_drawdown_pct:
                max_drawdown_pct = drawdown_pct

            equity_curve.append(
                EquityPoint(
                    date=curr_date,
                    portfolio_value=round(portfolio_equity, 2),
                    cash=round(cash, 2),
                    holdings_value=round(holdings_value, 2),
                    benchmark_value=round(benchmark_val, 2),
                    drawdown_pct=round(drawdown_pct, 2),
                )
            )

            # ----------------------------------------------------
            # Step 4: Evaluate strategy signal at close of bar i
            # (To be executed at candle i+1 Open)
            # ----------------------------------------------------
            if i < end_idx:  # No new signals on the last bar
                sig = self._generate_signal_at_bar(df, i)
                if sig == "BUY" and holdings_qty == 0:
                    pending_signal = ("BUY", f"{self.req.strategy.value} Bullish Crossover")
                elif sig == "SELL" and holdings_qty > 0:
                    pending_signal = ("SELL", f"{self.req.strategy.value} Bearish Exit")

        # ----------------------------------------------------
        # Step 5: Mark-to-market liquidation of any open position on final day
        # ----------------------------------------------------
        if holdings_qty > 0:
            final_close = float(df["Close"].iloc[end_idx])
            final_date = date_strs[end_idx]
            exec_price = final_close * (1.0 - self.slippage_rate)
            trade_val = holdings_qty * exec_price
            exit_fee = trade_val * self.brokerage_rate
            net_received = trade_val - exit_fee
            cash += net_received

            gross_pnl = (exec_price - position_entry_price) * holdings_qty
            total_costs = position_entry_cost + exit_fee
            net_pnl = gross_pnl - total_costs
            ret_pct = (net_pnl / (position_entry_price * holdings_qty + position_entry_cost)) * 100.0

            trade_obj = BacktestTrade(
                id=f"BT-{trade_counter:03d}",
                entry_date=position_entry_date,
                exit_date=final_date,
                type="BUY",
                entry_price=round(position_entry_price, 2),
                exit_price=round(exec_price, 2),
                quantity=holdings_qty,
                gross_pnl=round(gross_pnl, 2),
                net_pnl=round(net_pnl, 2),
                costs=round(total_costs, 2),
                return_pct=round(ret_pct, 2),
                reason=f"Entry: {position_entry_reason} | Exit: Period-End Liquidation (MTM)",
            )
            trades.append(trade_obj)
            holdings_qty = 0

            # Update final equity curve point to reflect net liquidation cash
            if equity_curve:
                equity_curve[-1].cash = round(cash, 2)
                equity_curve[-1].holdings_value = 0.0
                equity_curve[-1].portfolio_value = round(cash, 2)

        final_capital = cash
        net_return = final_capital - self.initial_capital
        net_return_pct = (net_return / self.initial_capital) * 100.0

        total_costs = sum(t.costs for t in trades)
        gross_return = net_return + total_costs
        gross_return_pct = (gross_return / self.initial_capital) * 100.0

        last_close = float(df["Close"].iloc[end_idx])
        benchmark_return_pct = ((last_close - first_bar_close) / first_bar_close) * 100.0 if first_bar_close > 0 else 0.0

        # Trade metrics
        total_trades = len(trades)
        winning_trades = len([t for t in trades if t.net_pnl > 0])
        losing_trades = len([t for t in trades if t.net_pnl <= 0])
        win_rate_pct = (winning_trades / total_trades * 100.0) if total_trades > 0 else 0.0

        gross_profit = sum(t.net_pnl for t in trades if t.net_pnl > 0)
        gross_loss = abs(sum(t.net_pnl for t in trades if t.net_pnl < 0))

        if gross_loss > 0:
            profit_factor = round(gross_profit / gross_loss, 2)
        elif gross_profit > 0:
            profit_factor = 99.99
        else:
            profit_factor = 0.0

        avg_winning = (gross_profit / winning_trades) if winning_trades > 0 else 0.0
        avg_losing = (gross_loss / losing_trades) if losing_trades > 0 else 0.0

        # Sharpe ratio & volatility from daily equity curve
        sharpe_ratio, ann_vol_pct = self._calculate_risk_metrics(equity_curve)

        metrics = BacktestMetrics(
            net_return=round(net_return, 2),
            net_return_pct=round(net_return_pct, 2),
            gross_return=round(gross_return, 2),
            gross_return_pct=round(gross_return_pct, 2),
            total_costs=round(total_costs, 2),
            buy_and_hold_return_pct=round(benchmark_return_pct, 2),
            max_drawdown_pct=round(max_drawdown_pct, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            annualized_volatility_pct=round(ann_vol_pct, 2),
            win_rate_pct=round(win_rate_pct, 2),
            profit_factor=profit_factor,
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            avg_winning_trade=round(avg_winning, 2),
            avg_losing_trade=round(avg_losing, 2),
        )

        backtest_id = f"bt_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        response = BacktestResponse(
            backtest_id=backtest_id,
            symbol=self.symbol,
            strategy=self.req.strategy.value,
            initial_capital=round(self.initial_capital, 2),
            final_capital=round(final_capital, 2),
            net_return=round(net_return, 2),
            net_return_pct=round(net_return_pct, 2),
            benchmark_return_pct=round(benchmark_return_pct, 2),
            max_drawdown_pct=round(max_drawdown_pct, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            win_rate_pct=round(win_rate_pct, 2),
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            profit_factor=profit_factor,
            metrics=metrics,
            equity_curve=equity_curve,
            trades=trades,
            params={
                "symbol": self.symbol,
                "strategy": self.req.strategy.value,
                "fast_period": self.req.fast_period,
                "slow_period": self.req.slow_period,
                "initial_capital": self.req.initial_capital,
                "start_date": date_strs[start_idx],
                "end_date": date_strs[end_idx],
                "brokerage_pct": self.req.brokerage_pct,
                "slippage_pct": self.req.slippage_pct,
                "stop_loss_pct": self.req.stop_loss_pct,
                "take_profit_pct": self.req.take_profit_pct,
            },
            data_source="Yahoo Finance (NSE/BSE)",
            data_timestamp=date_strs[end_idx],
        )

        # Store in LRU cache
        backtest_store.put(backtest_id, response)
        return response

    def _calculate_risk_metrics(self, curve: List[EquityPoint]) -> Tuple[float, float]:
        """Calculates annualized volatility and Sharpe ratio using daily portfolio returns."""
        if len(curve) < 2:
            return 0.0, 0.0

        daily_vals = [p.portfolio_value for p in curve]
        returns = []
        for i in range(1, len(daily_vals)):
            prev = daily_vals[i - 1]
            if prev > 0:
                returns.append((daily_vals[i] - prev) / prev)

        if not returns:
            return 0.0, 0.0

        returns_arr = np.array(returns)
        std = float(np.std(returns_arr, ddof=1)) if len(returns_arr) > 1 else 0.0
        mean = float(np.mean(returns_arr))

        ann_vol_pct = std * math.sqrt(252) * 100.0

        # Indian risk-free rate assumption ~ 6.0% p.a.
        rf_daily = 0.06 / 252.0
        if std > 1e-8:
            sharpe = ((mean - rf_daily) * math.sqrt(252)) / std
        else:
            sharpe = 0.0

        return sharpe, ann_vol_pct
