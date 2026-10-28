import React, { useState, useEffect, useCallback } from 'react';
import type {
  StockQuote,
  StrategyDoctorRequest,
  StrategyDoctorResponse,
} from '../types';
import {
  runStrategyDoctorAnalysis,
  explainStrategyDoctorReport,
} from '../services/api';
import {
  Stethoscope,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Sparkles,
  RefreshCw,
  Layers,
  Scale,
  ShieldAlert,
  Percent,
  Calendar,
} from 'lucide-react';

interface StrategyDoctorPageProps {
  quote: StockQuote;
  onSelectSymbol?: (symbol: string) => void;
  initialFastPeriod?: number;
  initialSlowPeriod?: number;
}

export const StrategyDoctorPage: React.FC<StrategyDoctorPageProps> = ({
  quote,
  initialFastPeriod = 20,
  initialSlowPeriod = 50,
}) => {
  const [fastPeriod, setFastPeriod] = useState<number>(initialFastPeriod);
  const [slowPeriod, setSlowPeriod] = useState<number>(initialSlowPeriod);
  const [initialCapital, setInitialCapital] = useState<number>(100000);
  const [splitPreset, setSplitPreset] = useState<'50-25-25' | '60-20-20'>('50-25-25');
  const [brokeragePct, setBrokeragePct] = useState<number>(0.05);
  const [slippagePct, setSlippagePct] = useState<number>(0.02);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StrategyDoctorResponse | null>(null);

  // Auto-run analysis on stock selection or parameter change
  const executeDoctorAnalysis = useCallback(async () => {
    if (slowPeriod <= fastPeriod) {
      setError(`Slow period (${slowPeriod}) must be strictly greater than fast period (${fastPeriod}).`);
      return;
    }

    setIsLoading(true);
    setError(null);

    const [trainPct, valPct, testPct] =
      splitPreset === '50-25-25' ? [50.0, 25.0, 25.0] : [60.0, 20.0, 20.0];

    const req: StrategyDoctorRequest = {
      symbol: quote.symbol,
      strategy: 'SMA Crossover (20/50)',
      fast_period: fastPeriod,
      slow_period: slowPeriod,
      initial_capital: initialCapital,
      brokerage_pct: brokeragePct,
      slippage_pct: slippagePct,
      train_pct: trainPct,
      validation_pct: valPct,
      test_pct: testPct,
      min_test_trades: 5,
      min_test_candles: 60,
    };

    try {
      const res = await runStrategyDoctorAnalysis(req);
      setReport(res);
    } catch (err: any) {
      console.error('Strategy Doctor analysis failed:', err);
      setError(err?.message || 'Failed to complete strategy robustness analysis.');
    } finally {
      setIsLoading(false);
    }
  }, [slowPeriod, fastPeriod, splitPreset, quote.symbol, initialCapital, brokeragePct, slippagePct]);

  useEffect(() => {
    executeDoctorAnalysis();
  }, [executeDoctorAnalysis]);

  const handleRequestAIExplanation = async () => {
    if (!report) return;
    setIsExplaining(true);
    try {
      const updated = await explainStrategyDoctorReport(report.analysis_id);
      setReport(updated);
    } catch (err: any) {
      console.error('Failed to generate AI explanation:', err);
      setError(err?.message || 'Failed to generate AI explanation.');
    } finally {
      setIsExplaining(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500 text-slate-950' };
    if (score >= 60) return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500 text-slate-950' };
    if (score >= 40) return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500 text-slate-950' };
    return { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-500 text-white' };
  };

  const scoreTheme = report ? getScoreColor(report.robustness_score.overall_score) : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Strategy Doctor</h1>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Robustness & Overfitting Audit
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Zero look-ahead chronological walk-forward evaluation, parameter sensitivity grids, and cost stress testing for Indian equities.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Target Asset</div>
            <div className="text-lg font-bold text-white">{quote.symbol}</div>
          </div>
          <button
            onClick={executeDoctorAnalysis}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-cyan-600/25 transition-all cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            <span>{isLoading ? 'Diagnosing...' : 'Run Robustness Audit'}</span>
          </button>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Fast Period (SMA)</label>
            <input
              type="number"
              value={fastPeriod}
              min={2}
              max={100}
              onChange={(e) => setFastPeriod(parseInt(e.target.value) || 2)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Slow Period (SMA)</label>
            <input
              type="number"
              value={slowPeriod}
              min={5}
              max={300}
              onChange={(e) => setSlowPeriod(parseInt(e.target.value) || 5)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Walk-Forward Split</label>
            <select
              value={splitPreset}
              onChange={(e) => setSplitPreset(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="50-25-25">50% Train / 25% Val / 25% Test</option>
              <option value="60-20-20">60% Train / 20% Val / 20% Test</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Initial Capital (₹)</label>
            <input
              type="number"
              value={initialCapital}
              step={10000}
              min={10000}
              onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 100000)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Brokerage Fee (%)</label>
            <input
              type="number"
              step={0.01}
              value={brokeragePct}
              onChange={(e) => setBrokeragePct(parseFloat(e.target.value) || 0.05)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1.5 font-medium">Slippage (%)</label>
            <input
              type="number"
              step={0.01}
              value={slippagePct}
              onChange={(e) => setSlippagePct(parseFloat(e.target.value) || 0.02)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={executeDoctorAnalysis}
            className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Results Display */}
      {report && scoreTheme && (
        <div className="space-y-6">
          {/* Robustness Score Hero Card */}
          <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden ${scoreTheme.bg} ${scoreTheme.border}`}>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  <span>Heuristic Robustness Score</span>
                  <span className="text-[10px] text-slate-400 font-normal">({report.robustness_score.formula_version})</span>
                </div>
                <h2 className={`text-3xl font-extrabold tracking-tight ${scoreTheme.text}`}>
                  {report.robustness_score.overall_score} / 100
                </h2>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold shadow-md">
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${scoreTheme.badge}`}>
                    {report.robustness_score.rating}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed pt-2">
                  {report.robustness_score.disclaimer}
                </p>
              </div>

              {/* Deductions Breakdown */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 min-w-[280px] max-w-md space-y-2 text-xs">
                <span className="font-semibold text-slate-300 block pb-1 border-b border-slate-800">
                  Deductions Applied (Base: 100 pts)
                </span>
                {report.robustness_score.deduction_reasons.length > 0 ? (
                  <ul className="space-y-1.5 text-slate-400 text-[11px]">
                    {report.robustness_score.deduction_reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs py-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Zero penalty deductions: Strategy passed all stability and sample tests!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chronological Walk-Forward Split Performance Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                Chronological Walk-Forward Performance (Untouched Test Window)
              </h3>
              <span className="text-[11px] text-slate-400">
                Total History: {report.full_period.total_candles} sessions ({report.full_period.start_date} → {report.full_period.end_date})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Train Period */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    1. In-Sample Training
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {report.train_period.start_date} → {report.train_period.end_date}
                  </span>
                </div>
                <div className="text-xl font-bold text-white font-mono">
                  {report.train_period.net_return_pct >= 0 ? '+' : ''}{report.train_period.net_return_pct.toFixed(2)}%
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Trades: <span className="text-white font-medium">{report.train_period.trade_count}</span></div>
                  <div>Win Rate: <span className="text-white font-medium">{report.train_period.win_rate_pct.toFixed(1)}%</span></div>
                  <div>Max DD: <span className="text-rose-400 font-medium">-{report.train_period.max_drawdown_pct.toFixed(1)}%</span></div>
                  <div>Sharpe: <span className="text-white font-medium">{report.train_period.sharpe_ratio.toFixed(2)}</span></div>
                  <div>Candles: <span className="text-white font-medium">{report.train_period.candles_count}</span></div>
                  <div>B&H Ret: <span className="text-slate-300 font-medium">{report.train_period.buy_and_hold_return_pct.toFixed(1)}%</span></div>
                </div>
              </div>

              {/* Validation Period */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    2. Validation Window
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {report.validation_period.start_date} → {report.validation_period.end_date}
                  </span>
                </div>
                <div className="text-xl font-bold text-white font-mono">
                  {report.validation_period.net_return_pct >= 0 ? '+' : ''}{report.validation_period.net_return_pct.toFixed(2)}%
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Trades: <span className="text-white font-medium">{report.validation_period.trade_count}</span></div>
                  <div>Win Rate: <span className="text-white font-medium">{report.validation_period.win_rate_pct.toFixed(1)}%</span></div>
                  <div>Max DD: <span className="text-rose-400 font-medium">-{report.validation_period.max_drawdown_pct.toFixed(1)}%</span></div>
                  <div>Sharpe: <span className="text-white font-medium">{report.validation_period.sharpe_ratio.toFixed(2)}</span></div>
                  <div>Candles: <span className="text-white font-medium">{report.validation_period.candles_count}</span></div>
                  <div>B&H Ret: <span className="text-slate-300 font-medium">{report.validation_period.buy_and_hold_return_pct.toFixed(1)}%</span></div>
                </div>
              </div>

              {/* Out-of-Sample Test Period */}
              <div className={`bg-slate-900 border rounded-xl p-5 space-y-3 ${
                report.test_period.net_return_pct > 0 ? 'border-emerald-500/40' : 'border-rose-500/40'
              }`}>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    3. Unseen Test Window
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {report.test_period.start_date} → {report.test_period.end_date}
                  </span>
                </div>
                <div className={`text-xl font-bold font-mono ${
                  report.test_period.net_return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {report.test_period.net_return_pct >= 0 ? '+' : ''}{report.test_period.net_return_pct.toFixed(2)}%
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Trades: <span className="text-white font-medium">{report.test_period.trade_count}</span></div>
                  <div>Win Rate: <span className="text-white font-medium">{report.test_period.win_rate_pct.toFixed(1)}%</span></div>
                  <div>Max DD: <span className="text-rose-400 font-medium">-{report.test_period.max_drawdown_pct.toFixed(1)}%</span></div>
                  <div>Sharpe: <span className="text-white font-medium">{report.test_period.sharpe_ratio.toFixed(2)}</span></div>
                  <div>Candles: <span className="text-white font-medium">{report.test_period.candles_count}</span></div>
                  <div>B&H Ret: <span className="text-slate-300 font-medium">{report.test_period.buy_and_hold_return_pct.toFixed(1)}%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Parameter Sensitivity Heatmap Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Parameter Sensitivity & Plateau Stability (Evaluated on Training Data)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Evaluates neighbouring MA pairs around ({fastPeriod}/{slowPeriod}). Strategies that collapse upon small parameter shifts indicate curve-fitting.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  report.sensitivity_summary.is_fragile
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {report.sensitivity_summary.profitable_ratio_pct.toFixed(1)}% Profitable Neighbors
                </span>
                <span className="text-xs text-slate-400">
                  Std Dev: <strong className="text-slate-200">{report.sensitivity_summary.return_std_dev.toFixed(1)}%</strong>
                </span>
              </div>
            </div>

            {/* Grid display */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3">Fast SMA</th>
                    <th className="py-2.5 px-3">Slow SMA</th>
                    <th className="py-2.5 px-3">Net Return</th>
                    <th className="py-2.5 px-3">Max DD</th>
                    <th className="py-2.5 px-3">Win Rate</th>
                    <th className="py-2.5 px-3">Trades</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {report.parameter_sensitivity.map((pt, idx) => (
                    <tr
                      key={idx}
                      className={`${
                        pt.is_current_selection
                          ? 'bg-cyan-500/10 font-bold border-l-4 border-cyan-400'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2 px-3 text-slate-200">{pt.fast_period}</td>
                      <td className="py-2 px-3 text-slate-200">{pt.slow_period}</td>
                      <td className={`py-2 px-3 font-semibold ${pt.net_return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pt.net_return_pct >= 0 ? '+' : ''}{pt.net_return_pct.toFixed(2)}%
                      </td>
                      <td className="py-2 px-3 text-rose-300">-{pt.max_drawdown_pct.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-slate-300">{pt.win_rate_pct.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-slate-400">{pt.trade_count}</td>
                      <td className="py-2 px-3 font-sans">
                        {pt.is_current_selection ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500 text-slate-950 font-bold">
                            Selected
                          </span>
                        ) : pt.is_profitable ? (
                          <span className="text-emerald-400 text-[11px]">Profitable</span>
                        ) : (
                          <span className="text-rose-400 text-[11px]">Loss</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Market Regime Analysis & Transaction Cost Stress Testing side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Market Regimes */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Market Regime Performance Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Segmented by 50-day moving average trend and momentum at trade entry date.
              </p>

              <div className="space-y-3">
                {report.regime_analysis.map((reg, idx) => (
                  <div key={idx} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-200">{reg.regime}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        reg.sample_status === 'Adequate'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {reg.sample_status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{reg.description}</p>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                      <div>Trades: <span className="text-white">{reg.trade_count}</span></div>
                      <div>Win Rate: <span className="text-white">{reg.win_rate_pct.toFixed(1)}%</span></div>
                      <div className={reg.net_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        Net: ₹{reg.net_pnl.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost Stress Testing & Trade Concentration */}
            <div className="space-y-6">
              {/* Cost Stress */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-cyan-400" />
                  Transaction Cost Stress Testing (Out-of-Sample)
                </h3>
                <p className="text-xs text-slate-400">
                  Simulates out-of-sample returns under increasing Indian brokerage and execution slippage friction.
                </p>

                <div className="space-y-2.5">
                  {report.cost_stress_test.map((pt, idx) => (
                    <div key={idx} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200 block">{pt.tier}</span>
                        <span className="text-[10px] text-slate-400">
                          Brokerage: {pt.brokerage_pct}% | Slippage: {pt.slippage_pct}%
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <div className={`font-bold ${pt.net_return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pt.net_return_pct >= 0 ? '+' : ''}{pt.net_return_pct.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Fees: ₹{pt.total_costs.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trade Concentration */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Percent className="w-4 h-4 text-cyan-400" />
                  Trade Outlier Concentration
                </h3>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Top 1 Trade Profit Share:</span>
                    <strong className="font-mono text-cyan-400">{report.trade_concentration.top_1_share_pct.toFixed(1)}%</strong>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, report.trade_concentration.top_1_share_pct)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-slate-300 pt-1">
                    <span>Top 3 Trades Profit Share:</span>
                    <strong className="font-mono text-cyan-400">{report.trade_concentration.top_3_share_pct.toFixed(1)}%</strong>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${
                        report.trade_concentration.is_concentrated ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, report.trade_concentration.top_3_share_pct)}%` }}
                    />
                  </div>

                  {report.trade_concentration.warning && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                      {report.trade_concentration.warning}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Active Warnings & Limitations Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Diagnostic Warnings & Methodological Limitations
            </h3>

            {report.warnings.length > 0 ? (
              <div className="space-y-2">
                {report.warnings.map((w, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>No severe overfitting or fragility warnings triggered for this configuration.</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1.5">Known Limitations:</span>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {report.limitations.map((lim, idx) => (
                  <li key={idx}>• {lim}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Gemini AI Grounded Qualitative Explanation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Gemini AI Strategy Diagnosis</h3>
              </div>
              <button
                onClick={handleRequestAIExplanation}
                disabled={isExplaining}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs transition-colors cursor-pointer shadow-md"
              >
                {isExplaining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{report.ai_explanation ? 'Regenerate AI Analysis' : 'Explain Weaknesses with Gemini'}</span>
              </button>
            </div>

            {report.ai_explanation ? (
              <div className="p-5 rounded-xl bg-slate-950/70 border border-indigo-500/30 text-xs text-slate-300 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
                {report.ai_explanation}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Click "Explain Weaknesses with Gemini" to get grounded AI commentary on out-of-sample degradation, cost sensitivity, and statistical risks based strictly on the verified numbers above.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
