"""Strategy Doctor: Quantitative robustness evaluation, walk-forward validation, and overfitting detection.

Zero Look-Ahead Principles:
1. Chronological splitting into Train, Validation, and Test windows.
2. Parameter sensitivity grid is evaluated strictly on Train data, NEVER on Test data.
3. Indicator warm-up periods are respected without future data leakage.
4. Deterministic scoring formula for heuristic robustness assessment.
"""
from collections import OrderedDict
import math
import threading
from typing import Any, Dict, List, Optional, Tuple
import uuid

import numpy as np
import pandas as pd

from ..core.exceptions import DataUnavailableError, InvalidInputError
from ..schemas.backtest import BacktestRequest, StrategyType
from ..schemas.strategy_doctor import (
    CostStressTestPoint,
    ParameterSensitivityPoint,
    ParameterSensitivitySummary,
    PeriodMetrics,
    RegimePerformancePoint,
    RobustnessScoreBreakdown,
    StrategyDoctorRequest,
    StrategyDoctorResponse,
    TradeConcentrationMetrics,
)
from .backtest_engine import BacktestEngine
from .market_data import default_market_provider


class StrategyDoctorStore:
    """Thread-safe LRU store for Strategy Doctor analysis reports."""

    def __init__(self, max_size: int = 100):
        self._max_size = max_size
        self._cache: OrderedDict[str, StrategyDoctorResponse] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, analysis_id: str, report: StrategyDoctorResponse) -> None:
        with self._lock:
            if analysis_id in self._cache:
                self._cache.move_to_end(analysis_id)
            self._cache[analysis_id] = report
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def get(self, analysis_id: str) -> Optional[StrategyDoctorResponse]:
        with self._lock:
            if analysis_id in self._cache:
                self._cache.move_to_end(analysis_id)
                return self._cache[analysis_id]
            return None


doctor_store = StrategyDoctorStore()


class StrategyDoctorService:
    """Core domain service for strategy health, robustness, and overfitting diagnostics."""

    def analyze_strategy(self, req: StrategyDoctorRequest) -> StrategyDoctorResponse:
        """Executes full diagnostic suite on the requested strategy and historical data."""
        # 1. Fetch historical candle data
        clean_symbol, _ = default_market_provider.normalize_symbol(req.symbol)
        df = default_market_provider.fetch_history(
            raw_symbol=clean_symbol,
            period="2y" if not req.start_date else "5y",
            interval="1d",
        )

        if df is None or df.empty or len(df) < 60:
            raise DataUnavailableError(
                f"Insufficient historical candle data for {clean_symbol} (found {len(df) if df is not None else 0} candles, minimum 60 required)."
            )

        df = df.sort_index(ascending=True)

        # Filter by custom start/end date if supplied
        date_strs = [str(d)[:10] for d in df.index]
        start_idx = 0
        if req.start_date:
            for i, d in enumerate(date_strs):
                if d >= req.start_date:
                    start_idx = i
                    break

        end_idx = len(df) - 1
        if req.end_date:
            for i in range(len(date_strs) - 1, -1, -1):
                if date_strs[i] <= req.end_date:
                    end_idx = i
                    break

        filtered_df = df.iloc[start_idx : end_idx + 1].copy()
        if len(filtered_df) < 60:
            raise InvalidInputError(
                f"Filtered date range yields {len(filtered_df)} candles. At least 60 trading sessions are required for chronological validation."
            )

        total_candles = len(filtered_df)
        filtered_date_strs = [str(d)[:10] for d in filtered_df.index]

        # 2. Chronological Walk-Forward Split
        train_count = int(math.floor(total_candles * (req.train_pct / 100.0)))
        val_count = int(math.floor(total_candles * (req.validation_pct / 100.0)))
        test_count = total_candles - train_count - val_count

        if train_count < 30 or val_count < 10 or test_count < 10:
            raise InvalidInputError(
                f"Dataset of {total_candles} bars cannot be split into requested proportions. "
                f"Train: {train_count}, Val: {val_count}, Test: {test_count}. Insufficient candles per split."
            )

        train_start_d = filtered_date_strs[0]
        train_end_d = filtered_date_strs[train_count - 1]

        val_start_d = filtered_date_strs[train_count]
        val_end_d = filtered_date_strs[train_count + val_count - 1]

        test_start_d = filtered_date_strs[train_count + val_count]
        test_end_d = filtered_date_strs[-1]

        # 3. Execute Out-of-Sample Performance on each chronological split
        # We pass the full history up to each period's end for accurate indicator warm-up,
        # but trade execution is strictly bounded to that period's start and end dates.
        train_metrics = self._run_subperiod_backtest(
            df=filtered_df,
            req=req,
            period_name="Train",
            start_date=train_start_d,
            end_date=train_end_d,
            candle_count=train_count,
        )

        val_metrics = self._run_subperiod_backtest(
            df=filtered_df,
            req=req,
            period_name="Validation",
            start_date=val_start_d,
            end_date=val_end_d,
            candle_count=val_count,
        )

        test_metrics = self._run_subperiod_backtest(
            df=filtered_df,
            req=req,
            period_name="Test (Out-of-Sample)",
            start_date=test_start_d,
            end_date=test_end_d,
            candle_count=test_count,
        )

        # 4. Parameter Sensitivity Analysis (Evaluated strictly on Train, NEVER Test)
        sensitivity_points, sensitivity_summary = self._evaluate_parameter_sensitivity(
            df=filtered_df,
            req=req,
            train_start_d=train_start_d,
            train_end_d=train_end_d,
        )

        # 5. Market-Regime Analysis (On the full filtered dataset)
        full_backtest_req = BacktestRequest(
            symbol=clean_symbol,
            strategy=StrategyType.SMA_CROSSOVER,
            fast_period=req.fast_period,
            slow_period=req.slow_period,
            start_date=train_start_d,
            end_date=test_end_d,
            initial_capital=req.initial_capital,
            brokerage_pct=req.brokerage_pct,
            slippage_pct=req.slippage_pct,
        )
        full_bt = BacktestEngine(filtered_df, full_backtest_req).run()

        regime_points = self._evaluate_market_regimes(
            df=filtered_df,
            trades=full_bt.trades,
        )

        # 6. Transaction-Cost Stress Testing (On Test period)
        stress_test_points = self._evaluate_cost_stress(
            df=filtered_df,
            req=req,
            test_start_d=test_start_d,
            test_end_d=test_end_d,
            baseline_return_pct=test_metrics.net_return_pct,
        )

        # 7. Trade Concentration Analysis (On full strategy execution)
        trade_concentration = self._evaluate_trade_concentration(full_bt.trades)

        # 8. Overfitting Warnings & Diagnostic Limiting Factors
        warnings: List[str] = []
        limitations: List[str] = [
            "Walk-forward splits test chronological robustness but cannot account for future black-swan events.",
            "Historical slippage and market impact assume average liquidity in Indian equities.",
            "Market regime boundaries are based on moving average trends and do not reflect unannounced fundamental shifts.",
        ]

        # Check sample adequacy
        if test_metrics.trade_count < req.min_test_trades:
            warnings.append(
                f"Small Sample Warning: Out-of-sample test completed only {test_metrics.trade_count} trades (minimum threshold: {req.min_test_trades}). Statistical significance is limited."
            )
        if test_metrics.candles_count < req.min_test_candles:
            warnings.append(
                f"Short Test Window: Test period contains {test_metrics.candles_count} trading sessions (recommended minimum: {req.min_test_candles})."
            )

        # Check train vs test degradation
        if train_metrics.net_return_pct > 0 and test_metrics.net_return_pct < 0:
            warnings.append(
                f"Out-of-Sample Performance Collapse: Strategy achieved +{train_metrics.net_return_pct:.1f}% in Training, but degraded to {test_metrics.net_return_pct:.1f}% in unseen Test data. High risk of overfitting."
            )
        elif train_metrics.net_return_pct > 15.0 and test_metrics.net_return_pct < (train_metrics.net_return_pct * 0.4):
            warnings.append(
                f"Severe Return Degradation: Test return ({test_metrics.net_return_pct:.1f}%) is less than 40% of Training return ({train_metrics.net_return_pct:.1f}%)."
            )

        # Check parameter fragility
        if sensitivity_summary.is_fragile:
            warnings.append(
                f"Parameter Fragility Detected: {sensitivity_summary.fragility_notes}"
            )

        # Check trade concentration
        if trade_concentration.is_concentrated and trade_concentration.warning:
            warnings.append(trade_concentration.warning)

        # Check cost resilience
        severe_stress = next((p for p in stress_test_points if "Severe" in p.tier), None)
        if severe_stress and not severe_stress.is_profitable:
            warnings.append(
                f"Cost Vulnerability: Under severe transaction costs (4x friction), strategy return turns negative ({severe_stress.net_return_pct:.1f}%)."
            )

        # 9. Compute Heuristic Robustness Score (0–100)
        robustness_score = self._compute_robustness_score(
            train_metrics=train_metrics,
            test_metrics=test_metrics,
            sensitivity_summary=sensitivity_summary,
            trade_concentration=trade_concentration,
            stress_points=stress_test_points,
            min_test_trades=req.min_test_trades,
        )

        analysis_id = f"doc_{uuid.uuid4().hex[:12]}"
        response = StrategyDoctorResponse(
            analysis_id=analysis_id,
            symbol=clean_symbol,
            strategy=req.strategy,
            data_source="Yahoo Finance (NSE/BSE)",
            initial_capital=req.initial_capital,
            full_period={
                "start_date": filtered_date_strs[0],
                "end_date": filtered_date_strs[-1],
                "total_candles": str(total_candles),
            },
            train_period=train_metrics,
            validation_period=val_metrics,
            test_period=test_metrics,
            parameter_sensitivity=sensitivity_points,
            sensitivity_summary=sensitivity_summary,
            regime_analysis=regime_points,
            cost_stress_test=stress_test_points,
            trade_concentration=trade_concentration,
            robustness_score=robustness_score,
            warnings=warnings,
            limitations=limitations,
        )

        # Persist report to store
        doctor_store.put(analysis_id, response)
        return response

    def _run_subperiod_backtest(
        self,
        df: pd.DataFrame,
        req: StrategyDoctorRequest,
        period_name: str,
        start_date: str,
        end_date: str,
        candle_count: int,
    ) -> PeriodMetrics:
        """Executes BacktestEngine on a designated chronological slice."""
        bt_req = BacktestRequest(
            symbol=req.symbol,
            strategy=StrategyType.SMA_CROSSOVER,
            fast_period=req.fast_period,
            slow_period=req.slow_period,
            start_date=start_date,
            end_date=end_date,
            initial_capital=req.initial_capital,
            brokerage_pct=req.brokerage_pct,
            slippage_pct=req.slippage_pct,
        )
        res = BacktestEngine(df, bt_req).run()

        return PeriodMetrics(
            period_name=period_name,
            start_date=start_date,
            end_date=end_date,
            candles_count=candle_count,
            trade_count=res.total_trades,
            winning_trades=res.winning_trades,
            losing_trades=res.losing_trades,
            net_return=res.net_return,
            net_return_pct=res.net_return_pct,
            buy_and_hold_return_pct=res.benchmark_return_pct,
            max_drawdown_pct=res.max_drawdown_pct,
            win_rate_pct=res.win_rate_pct,
            profit_factor=res.profit_factor,
            sharpe_ratio=res.sharpe_ratio,
            annualized_volatility_pct=res.metrics.annualized_volatility_pct,
            total_costs=res.metrics.total_costs,
        )

    def _evaluate_parameter_sensitivity(
        self,
        df: pd.DataFrame,
        req: StrategyDoctorRequest,
        train_start_d: str,
        train_end_d: str,
    ) -> Tuple[List[ParameterSensitivityPoint], ParameterSensitivitySummary]:
        """Runs parameter sensitivity grid strictly on training data."""
        base_fast = req.fast_period
        base_slow = req.slow_period

        # Generate neighbor variations around base fast and slow periods
        fast_variations = sorted(list(set([
            max(2, base_fast - 6),
            max(2, base_fast - 3),
            base_fast,
            base_fast + 3,
            base_fast + 6,
        ])))

        slow_variations = sorted(list(set([
            max(base_slow - 10, 10),
            max(base_slow - 5, 10),
            base_slow,
            base_slow + 5,
            base_slow + 10,
        ])))

        points: List[ParameterSensitivityPoint] = []
        returns: List[float] = []

        for f_val in fast_variations:
            for s_val in slow_variations:
                # Reject invalid combinations
                if f_val >= s_val:
                    continue

                is_selected = (f_val == base_fast and s_val == base_slow)
                bt_req = BacktestRequest(
                    symbol=req.symbol,
                    strategy=StrategyType.SMA_CROSSOVER,
                    fast_period=f_val,
                    slow_period=s_val,
                    start_date=train_start_d,
                    end_date=train_end_d,
                    initial_capital=req.initial_capital,
                    brokerage_pct=req.brokerage_pct,
                    slippage_pct=req.slippage_pct,
                )
                res = BacktestEngine(df, bt_req).run()

                points.append(
                    ParameterSensitivityPoint(
                        fast_period=f_val,
                        slow_period=s_val,
                        net_return_pct=res.net_return_pct,
                        max_drawdown_pct=res.max_drawdown_pct,
                        trade_count=res.total_trades,
                        win_rate_pct=res.win_rate_pct,
                        is_current_selection=is_selected,
                        is_profitable=res.net_return_pct > 0,
                    )
                )
                returns.append(res.net_return_pct)

        tested_count = len(points)
        profitable_count = sum(1 for p in points if p.is_profitable)
        prof_ratio = (profitable_count / tested_count * 100.0) if tested_count > 0 else 0.0

        mean_ret = float(np.mean(returns)) if returns else 0.0
        ret_std = float(np.std(returns)) if len(returns) > 1 else 0.0
        min_ret = float(np.min(returns)) if returns else 0.0
        max_ret = float(np.max(returns)) if returns else 0.0

        # Fragility: if fewer than 50% of neighbor parameter sets are profitable, or std dev is high
        is_fragile = prof_ratio < 50.0 or (ret_std > 18.0 and prof_ratio < 70.0)
        fragility_notes = (
            f"Only {profitable_count}/{tested_count} ({prof_ratio:.1f}%) of neighboring parameter pairs generated positive returns. "
            if is_fragile
            else f"Stable parameter plateau: {prof_ratio:.1f}% of neighboring combinations remain profitable."
        )

        summary = ParameterSensitivitySummary(
            tested_combinations=tested_count,
            profitable_combinations=profitable_count,
            profitable_ratio_pct=round(prof_ratio, 2),
            mean_return_pct=round(mean_ret, 2),
            return_std_dev=round(ret_std, 2),
            min_return_pct=round(min_ret, 2),
            max_return_pct=round(max_ret, 2),
            is_fragile=is_fragile,
            fragility_notes=fragility_notes,
        )

        return points, summary

    def _evaluate_market_regimes(
        self,
        df: pd.DataFrame,
        trades: List[Any],
    ) -> List[RegimePerformancePoint]:
        """Segments performance across market regimes (Bull Trend, Bear Trend, Sideways)."""
        # Calculate 50 SMA and 5-day slope to transparently label regimes
        sma50 = df["Close"].rolling(window=50).mean()
        regime_map: Dict[str, str] = {}

        for i in range(len(df)):
            d_str = str(df.index[i])[:10]
            if i < 55 or pd.isna(sma50.iloc[i]):
                regime_map[d_str] = "Sideways / Consolidation"
                continue

            curr_close = df["Close"].iloc[i]
            curr_sma = sma50.iloc[i]
            prev_sma = sma50.iloc[i - 5]
            slope = (curr_sma - prev_sma) / prev_sma if prev_sma > 0 else 0.0

            if curr_close > curr_sma and slope > 0.005:
                regime_map[d_str] = "Bull Trend"
            elif curr_close < curr_sma and slope < -0.005:
                regime_map[d_str] = "Bear Trend"
            else:
                regime_map[d_str] = "Sideways / Consolidation"

        # Count regime occurrences in candles
        regime_counts = {"Bull Trend": 0, "Bear Trend": 0, "Sideways / Consolidation": 0}
        for d_str, reg in regime_map.items():
            if reg in regime_counts:
                regime_counts[reg] += 1

        # Aggregate trades by regime at entry date
        regime_trades: Dict[str, List[Any]] = {
            "Bull Trend": [],
            "Bear Trend": [],
            "Sideways / Consolidation": [],
        }

        for t in trades:
            entry_reg = regime_map.get(t.entry_date, "Sideways / Consolidation")
            regime_trades[entry_reg].append(t)

        descriptions = {
            "Bull Trend": "Price trading firmly above rising 50-day SMA baseline.",
            "Bear Trend": "Price trading beneath falling 50-day SMA baseline.",
            "Sideways / Consolidation": "Price oscillating around flat 50-day SMA with neutral momentum.",
        }

        points: List[RegimePerformancePoint] = []
        for reg, t_list in regime_trades.items():
            t_count = len(t_list)
            wins = len([t for t in t_list if t.net_pnl > 0])
            win_rate = (wins / t_count * 100.0) if t_count > 0 else 0.0
            net_pnl = sum(t.net_pnl for t in t_list)
            avg_pnl = (net_pnl / t_count) if t_count > 0 else 0.0
            sample_status = "Adequate" if t_count >= 3 else f"Insufficient Sample ({t_count} trades)"

            points.append(
                RegimePerformancePoint(
                    regime=reg,
                    description=descriptions[reg],
                    candles_count=regime_counts[reg],
                    trade_count=t_count,
                    win_rate_pct=round(win_rate, 2),
                    net_pnl=round(net_pnl, 2),
                    avg_trade_pnl=round(avg_pnl, 2),
                    sample_status=sample_status,
                )
            )

        return points

    def _evaluate_cost_stress(
        self,
        df: pd.DataFrame,
        req: StrategyDoctorRequest,
        test_start_d: str,
        test_end_d: str,
        baseline_return_pct: float,
    ) -> List[CostStressTestPoint]:
        """Evaluates out-of-sample performance under escalating transaction cost stress."""
        base_brokerage = req.brokerage_pct
        base_slippage = req.slippage_pct

        scenarios = [
            ("Baseline (1x)", base_brokerage, base_slippage),
            ("Elevated (2x)", base_brokerage * 2.0, base_slippage * 2.0),
            ("Severe (4x)", base_brokerage * 4.0, base_slippage * 4.0),
        ]

        points: List[CostStressTestPoint] = []
        for tier, broker, slip in scenarios:
            bt_req = BacktestRequest(
                symbol=req.symbol,
                strategy=StrategyType.SMA_CROSSOVER,
                fast_period=req.fast_period,
                slow_period=req.slow_period,
                start_date=test_start_d,
                end_date=test_end_d,
                initial_capital=req.initial_capital,
                brokerage_pct=broker,
                slippage_pct=slip,
            )
            res = BacktestEngine(df, bt_req).run()
            drop = baseline_return_pct - res.net_return_pct

            points.append(
                CostStressTestPoint(
                    tier=tier,
                    brokerage_pct=round(broker, 3),
                    slippage_pct=round(slip, 3),
                    net_return=res.net_return,
                    net_return_pct=res.net_return_pct,
                    total_costs=res.metrics.total_costs,
                    is_profitable=res.net_return > 0,
                    return_degradation_pct=round(drop, 2),
                )
            )

        return points

    def _evaluate_trade_concentration(self, trades: List[Any]) -> TradeConcentrationMetrics:
        """Calculates proportion of positive profits attributable to top outlier trades."""
        total_trades = len(trades)
        winning_trades = [t for t in trades if t.net_pnl > 0]
        winning_trades_count = len(winning_trades)

        if winning_trades_count == 0:
            return TradeConcentrationMetrics(
                total_trades=total_trades,
                winning_trades=0,
                gross_winning_profit=0.0,
                top_1_trade_profit=0.0,
                top_1_share_pct=0.0,
                top_3_trades_profit=0.0,
                top_3_share_pct=0.0,
                is_concentrated=False,
                warning="Strategy produced zero winning trades. Trade concentration is not applicable.",
            )

        # Sort winning trades descending by net profit
        winning_trades.sort(key=lambda t: t.net_pnl, reverse=True)
        gross_win_profit = sum(t.net_pnl for t in winning_trades)

        top_1_profit = winning_trades[0].net_pnl
        top_1_pct = (top_1_profit / gross_win_profit * 100.0) if gross_win_profit > 0 else 0.0

        top_3_profit = sum(t.net_pnl for t in winning_trades[:3])
        top_3_pct = (top_3_profit / gross_win_profit * 100.0) if gross_win_profit > 0 else 0.0

        is_concentrated = top_1_pct > 40.0 or top_3_pct > 70.0
        warning = None
        if is_concentrated:
            warning = (
                f"Outlier Trade Dependence: Top {min(3, winning_trades_count)} winning trade(s) account for "
                f"{top_3_pct:.1f}% of all gross profits. Strategy profitability is fragile and dependent on few windfall trades."
            )

        return TradeConcentrationMetrics(
            total_trades=total_trades,
            winning_trades=winning_trades_count,
            gross_winning_profit=round(gross_win_profit, 2),
            top_1_trade_profit=round(top_1_profit, 2),
            top_1_share_pct=round(top_1_pct, 2),
            top_3_trades_profit=round(top_3_profit, 2),
            top_3_share_pct=round(top_3_pct, 2),
            is_concentrated=is_concentrated,
            warning=warning,
        )

    def _compute_robustness_score(
        self,
        train_metrics: PeriodMetrics,
        test_metrics: PeriodMetrics,
        sensitivity_summary: ParameterSensitivitySummary,
        trade_concentration: TradeConcentrationMetrics,
        stress_points: List[CostStressTestPoint],
        min_test_trades: int,
    ) -> RobustnessScoreBreakdown:
        """Deterministic heuristic robustness scoring formula (0-100)."""
        base_score = 100.0
        deductions: Dict[str, float] = {}
        reasons: List[str] = []

        # 1. Out-of-sample performance collapse
        if train_metrics.net_return_pct > 0 and test_metrics.net_return_pct < 0:
            ded = 30.0
            deductions["out_of_sample_collapse"] = ded
            reasons.append(f"Training was profitable (+{train_metrics.net_return_pct:.1f}%) but Test period suffered net loss ({test_metrics.net_return_pct:.1f}%) (-{ded:.0f} pts).")
        elif train_metrics.net_return_pct > 10.0 and test_metrics.net_return_pct < (train_metrics.net_return_pct * 0.5):
            ded = 15.0
            deductions["out_of_sample_degradation"] = ded
            reasons.append(f"Test return ({test_metrics.net_return_pct:.1f}%) degraded by over 50% vs Training (+{train_metrics.net_return_pct:.1f}%) (-{ded:.0f} pts).")

        # 2. Parameter fragility
        if sensitivity_summary.profitable_ratio_pct < 50.0:
            ded = 20.0
            deductions["parameter_fragility"] = ded
            reasons.append(f"Over 50% of neighboring parameter combinations resulted in net losses ({sensitivity_summary.profitable_ratio_pct:.1f}% profitable) (-{ded:.0f} pts).")
        elif sensitivity_summary.profitable_ratio_pct < 70.0:
            ded = 10.0
            deductions["parameter_fragility"] = ded
            reasons.append(f"Parameter plateau is narrow: only {sensitivity_summary.profitable_ratio_pct:.1f}% of neighboring combinations are profitable (-{ded:.0f} pts).")

        # 3. Trade concentration
        if trade_concentration.is_concentrated:
            ded = 15.0 if trade_concentration.top_3_share_pct > 80.0 else 8.0
            deductions["trade_concentration"] = ded
            reasons.append(f"High profit concentration: Top 3 trades contribute {trade_concentration.top_3_share_pct:.1f}% of total positive profit (-{ded:.0f} pts).")

        # 4. Cost stress resilience
        severe_tier = next((p for p in stress_points if "Severe" in p.tier), None)
        elevated_tier = next((p for p in stress_points if "Elevated" in p.tier), None)
        if elevated_tier and not elevated_tier.is_profitable:
            ded = 15.0
            deductions["cost_vulnerability"] = ded
            reasons.append(f"Strategy becomes unprofitable under 2x elevated transaction costs (-{ded:.0f} pts).")
        elif severe_tier and not severe_tier.is_profitable:
            ded = 8.0
            deductions["cost_vulnerability"] = ded
            reasons.append(f"Strategy becomes unprofitable under 4x severe transaction costs (-{ded:.0f} pts).")

        # 5. Sample size inadequacy
        if test_metrics.trade_count < min_test_trades:
            ded = 12.0
            deductions["insufficient_sample"] = ded
            reasons.append(f"Low test sample size: Only {test_metrics.trade_count} trades in out-of-sample period (min: {min_test_trades}) (-{ded:.0f} pts).")

        total_deductions = sum(deductions.values())
        final_score = max(0.0, min(100.0, round(base_score - total_deductions, 1)))

        if final_score >= 80.0:
            rating = "High Robustness (Low Overfitting Risk)"
        elif final_score >= 60.0:
            rating = "Moderate Robustness (Acceptable Stability)"
        elif final_score >= 40.0:
            rating = "Questionable Robustness (Moderate Overfitting Detected)"
        else:
            rating = "Fragile / Overfitted (High Degradation Risk)"

        return RobustnessScoreBreakdown(
            overall_score=final_score,
            rating=rating,
            formula_version="v1.0-heuristic",
            base_score=base_score,
            deductions=deductions,
            deduction_reasons=reasons,
        )


strategy_doctor_service = StrategyDoctorService()
