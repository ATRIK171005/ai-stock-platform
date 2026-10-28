import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  BacktestResult,
  BacktestParams,
} from '../types';
import { runBacktest } from '../services/api';
import { MetricCard } from '../components/MetricCard';
import {
  Play,
  TrendingUp,
  Percent,
  Activity,
  Award,
  AlertCircle,
  Sliders,
  DollarSign,
  RefreshCw,
  Stethoscope,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface BacktestPageProps {
  initialResult: BacktestResult;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  availableSymbols: string[];
  onBacktestSuccess?: (backtestId: string) => void;
  onNavigateToDoctor?: () => void;
}

export const BacktestPage: React.FC<BacktestPageProps> = ({
  initialResult,
  selectedSymbol,
  onSymbolChange,
  availableSymbols,
  onBacktestSuccess,
  onNavigateToDoctor,
}) => {
  const [params, setParams] = useState<BacktestParams>({
    ...initialResult.params,
    symbol: selectedSymbol,
  });
  const [result, setResult] = useState<BacktestResult>(initialResult);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize internal symbol state when selectedSymbol prop changes
  const prevSymbolRef = useRef(selectedSymbol);
  useEffect(() => {
    if (prevSymbolRef.current !== selectedSymbol) {
      prevSymbolRef.current = selectedSymbol;
      setParams((prev) => ({ ...prev, symbol: selectedSymbol }));
    }
  }, [selectedSymbol]);

  // Execute deterministic backtest via FastAPI backend
  const executeBacktest = useCallback(
    async (currentParams: BacktestParams) => {
      setIsRunning(true);
      setError(null);

      try {
        const computedResult = await runBacktest(currentParams);
        setResult(computedResult);
        if (computedResult.id && onBacktestSuccess) {
          onBacktestSuccess(computedResult.id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to execute historical backtest on backend.');
      } finally {
        setIsRunning(false);
      }
    },
    [onBacktestSuccess]
  );

  const initialMountRef = useRef(false);
  useEffect(() => {
    if (!initialMountRef.current) {
      initialMountRef.current = true;
      executeBacktest({ ...initialResult.params, symbol: selectedSymbol });
    }
  }, [executeBacktest, initialResult.params, selectedSymbol]);

  const handleRunBacktest = (e: React.FormEvent) => {
    e.preventDefault();
    executeBacktest(params);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Strategy Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Historical Strategy Backtesting
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Evaluate quantitative trading rules chronologically without look-ahead bias, including realistic slippage & brokerage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Chronological Engine: No Future Leakage
          </span>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 flex items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => executeBacktest(params)}
            className="flex items-center gap-1.5 px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Configuration Form Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <form onSubmit={handleRunBacktest} className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
              <Sliders className="w-4 h-4 text-blue-400" />
              <span>Strategy Configuration</span>
            </div>
            <span className="text-xs text-slate-400">Deterministic Model Parameters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Stock Symbol */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Stock Symbol</label>
              <select
                value={selectedSymbol}
                onChange={(e) => {
                  onSymbolChange(e.target.value);
                  setParams({ ...params, symbol: e.target.value });
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {availableSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            </div>

            {/* Strategy Type */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Strategy</label>
              <select
                value={params.strategy}
                onChange={(e) =>
                  setParams({ ...params, strategy: e.target.value as BacktestParams['strategy'] })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="SMA_CROSSOVER">Dual SMA Crossover</option>
                <option value="RSI_MEAN_REVERSION">RSI Mean Reversion</option>
                <option value="MACD_MOMENTUM">MACD Trend Momentum</option>
              </select>
            </div>

            {/* Fast Period */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Fast Period (Days)</label>
              <input
                type="number"
                min="2"
                max="100"
                value={params.fastPeriod}
                onChange={(e) => setParams({ ...params, fastPeriod: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Slow Period */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Slow Period (Days)</label>
              <input
                type="number"
                min="5"
                max="300"
                value={params.slowPeriod}
                onChange={(e) => setParams({ ...params, slowPeriod: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Initial Virtual Capital */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Initial Capital (₹)</label>
              <input
                type="number"
                step="10000"
                min="1000"
                value={params.initialCapital}
                onChange={(e) => setParams({ ...params, initialCapital: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Date Range Start */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Start Date</label>
              <input
                type="date"
                value={params.startDate}
                onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Date Range End */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">End Date</label>
              <input
                type="date"
                value={params.endDate}
                onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Brokerage & Slippage */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">
                Brokerage ({params.brokeragePercent}%) + Slippage ({params.slippagePercent}%)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="2"
                  value={params.brokeragePercent}
                  onChange={(e) =>
                    setParams({ ...params, brokeragePercent: Number(e.target.value) })
                  }
                  className="w-1/2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                  title="Brokerage %"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="2"
                  value={params.slippagePercent}
                  onChange={(e) =>
                    setParams({ ...params, slippagePercent: Number(e.target.value) })
                  }
                  className="w-1/2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                  title="Slippage %"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {onNavigateToDoctor && (
              <button
                type="button"
                onClick={onNavigateToDoctor}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs px-4 py-2.5 rounded-xl border border-cyan-500/30 transition-all cursor-pointer"
              >
                <Stethoscope className="w-4 h-4" />
                <span>Audit in Strategy Doctor</span>
              </button>
            )}
            <button
              type="submit"
              disabled={isRunning}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Computing Chronological Backtest...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Backtest</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Net Return"
          value={`₹${result.netReturn.toLocaleString('en-IN')}`}
          subValue={`${result.netReturnPercent >= 0 ? '+' : ''}${result.netReturnPercent}%`}
          isPositive={result.netReturn >= 0}
          icon={TrendingUp}
        />
        <MetricCard
          label="Buy & Hold Benchmark"
          value={`${result.benchmarkReturnPercent >= 0 ? '+' : ''}${result.benchmarkReturnPercent}%`}
          subValue={result.netReturnPercent >= result.benchmarkReturnPercent ? 'Outperformed' : 'Underperformed'}
          isPositive={result.netReturnPercent >= result.benchmarkReturnPercent}
          icon={Percent}
        />
        <MetricCard
          label="Max Drawdown"
          value={`${result.maxDrawdownPercent}%`}
          subValue="Peak-to-trough"
          isPositive={false}
          icon={AlertCircle}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={result.sharpeRatio.toFixed(2)}
          subValue="Risk-adjusted return"
          icon={Award}
        />
        <MetricCard
          label="Win Rate"
          value={`${result.winRatePercent}%`}
          subValue={`${result.winningTrades}W / ${result.losingTrades}L`}
          isPositive={result.winRatePercent >= 50}
          icon={Activity}
        />
        <MetricCard
          label="Profit Factor"
          value={result.profitFactor.toFixed(2)}
          subValue={`${result.totalTrades} total trades`}
          icon={DollarSign}
        />
      </div>

      {/* Equity Curve Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white">Equity Curve vs Benchmark</h3>
            <p className="text-xs text-slate-400">
              Simulated portfolio value growth starting at ₹{result.initialCapital.toLocaleString('en-IN')} with transaction fees applied.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-blue-400 font-medium">
              <span className="w-3 h-1 bg-blue-500 rounded-full inline-block"></span>
              Strategy Portfolio
            </span>
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-3 h-1 bg-slate-500 rounded-full inline-block"></span>
              Buy & Hold Benchmark
            </span>
          </div>
        </div>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.equityCurve}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
                tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
              />
              <Area
                type="monotone"
                dataKey="portfolioValue"
                name="Strategy Portfolio"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#equityGrad)"
              />
              <Area
                type="monotone"
                dataKey="benchmarkValue"
                name="Buy & Hold Benchmark"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trade Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-200">Simulated Trade Execution Log</h3>
          <span className="text-xs text-slate-400">{result.trades.length} executed signals</span>
        </div>
        <div className="overflow-x-auto">
          {result.trades.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No trades executed during this time window. Try adjusting moving average periods or selecting a different stock.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Trade ID</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Entry Date</th>
                  <th className="px-4 py-2.5">Exit Date</th>
                  <th className="px-4 py-2.5">Entry (₹)</th>
                  <th className="px-4 py-2.5">Exit (₹)</th>
                  <th className="px-4 py-2.5">Qty</th>
                  <th className="px-4 py-2.5">Net P&L (₹)</th>
                  <th className="px-4 py-2.5">Return</th>
                  <th className="px-4 py-2.5">Trigger Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {result.trades.map((tr) => {
                  const isProfitable = tr.netProfit >= 0;
                  return (
                    <tr key={tr.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-slate-400">{tr.id}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                          {tr.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{tr.entryDate}</td>
                      <td className="px-4 py-2.5 text-slate-300">{tr.exitDate}</td>
                      <td className="px-4 py-2.5">₹{tr.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5">₹{tr.exitPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5">{tr.quantity}</td>
                      <td className={`px-4 py-2.5 font-semibold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}₹{tr.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-2.5 font-medium ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{tr.returnPercent.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-[11px] max-w-xs truncate" title={tr.reason}>
                        {tr.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mandatory Disclaimer */}
      <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl text-xs text-slate-400 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-200">Backtesting Disclaimer:</strong> {result.disclaimer}
        </p>
      </div>
    </div>
  );
};
