import React, { useState } from 'react';
import type {
  StockQuote,
  OHLCVCandle,
  TechnicalIndicators,
  TradingSignal,
} from '../types';
import { CandlestickChart } from '../components/CandlestickChart';
import { SignalBadge } from '../components/SignalBadge';
import { MetricCard } from '../components/MetricCard';
import {
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Activity,
  Layers,
  ShieldCheck,
  Compass,
  Sliders,
  RefreshCw,
} from 'lucide-react';

interface AnalysisPageProps {
  quote: StockQuote;
  candles: OHLCVCandle[];
  indicators: TechnicalIndicators;
  signal?: TradingSignal | null;
  isLoading?: boolean;
  isSignalLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const AnalysisPage: React.FC<AnalysisPageProps> = ({
  quote,
  candles,
  indicators,
  signal,
  isLoading = false,
  isSignalLoading = false,
  error = null,
  onRetry,
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1M' | '3M' | '6M' | '1Y'>('3M');

  // Filter candles based on timeframe
  const candleCount = {
    '1M': 22,
    '3M': 65,
    '6M': 130,
    '1Y': 250,
  }[selectedTimeframe];

  const visibleCandles = candles.slice(-candleCount);

  // RSI status
  const getRsiStatus = (rsi: number) => {
    if (rsi >= 70) return { label: 'Overbought (>70)', color: 'rose' as const };
    if (rsi <= 30) return { label: 'Oversold (<30)', color: 'emerald' as const };
    return { label: 'Healthy Neutral', color: 'blue' as const };
  };
  const rsiInfo = getRsiStatus(indicators.rsi14);

  // MACD status
  const isMacdBullish = indicators.macd.histogram > 0;

  return (
    <div className="space-y-6">
      {/* Error Alert Box with Retry */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Indicator / Signal Error</p>
              <p className="text-rose-300/90">{error}</p>
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-xs text-blue-400 font-medium bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 shadow-xl">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Calculating technical indicators...</span>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Technical Analysis & Signals
            </h1>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {quote.symbol}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic quantitative rule evaluation across moving averages, momentum oscillators, and volatility.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Closing Price</div>
            <div className="text-xl font-bold text-white">
              ₹{quote.price > 0 ? quote.price.toFixed(2) : '--'}
            </div>
          </div>
          {isSignalLoading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400">
              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
              <span>Evaluating Signal...</span>
            </div>
          ) : signal ? (
            <SignalBadge signal={signal.signal} confidence={signal.confidence} size="lg" />
          ) : (
            <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              Signal Unavailable
            </span>
          )}
        </div>
      </div>

      {/* Technical Indicators Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="SMA 20"
          value={indicators.sma20 > 0 ? `₹${indicators.sma20.toFixed(2)}` : 'Warm-up'}
          subValue={
            indicators.sma20 > 0
              ? quote.price > indicators.sma20
                ? 'Above SMA 20'
                : 'Below SMA 20'
              : 'Requires 20 bars'
          }
          isPositive={indicators.sma20 > 0 ? quote.price > indicators.sma20 : undefined}
          icon={Activity}
        />
        <MetricCard
          label="SMA 50"
          value={indicators.sma50 > 0 ? `₹${indicators.sma50.toFixed(2)}` : 'Warm-up'}
          subValue={
            indicators.sma50 > 0
              ? indicators.sma20 > indicators.sma50
                ? 'Golden Alignment'
                : 'Bearish Alignment'
              : 'Requires 50 bars'
          }
          isPositive={indicators.sma50 > 0 ? indicators.sma20 > indicators.sma50 : undefined}
          icon={Activity}
        />
        <MetricCard
          label="EMA 20"
          value={indicators.ema20 > 0 ? `₹${indicators.ema20.toFixed(2)}` : 'Warm-up'}
          subValue="Short-term trend"
          icon={TrendingUp}
        />
        <MetricCard
          label="RSI (14)"
          value={indicators.rsi14 > 0 ? indicators.rsi14.toFixed(1) : 'Warm-up'}
          badge={indicators.rsi14 > 0 ? rsiInfo.label : undefined}
          badgeColor={indicators.rsi14 > 0 ? rsiInfo.color : undefined}
          subValue="Momentum (30-70)"
          icon={Sliders}
        />
        <MetricCard
          label="MACD Histogram"
          value={`${indicators.macd.histogram >= 0 ? '+' : ''}${indicators.macd.histogram.toFixed(2)}`}
          subValue={`Line: ${indicators.macd.macdLine.toFixed(1)} | Sig: ${indicators.macd.signalLine.toFixed(1)}`}
          isPositive={isMacdBullish}
          icon={Layers}
        />
        <MetricCard
          label="ATR (14 Volatility)"
          value={indicators.atr14 > 0 ? `₹${indicators.atr14.toFixed(2)}` : 'Warm-up'}
          subValue={
            indicators.atr14 > 0 && quote.price > 0
              ? `${((indicators.atr14 / quote.price) * 100).toFixed(1)}% daily range`
              : 'Volatility range'
          }
          icon={Compass}
        />
      </div>

      {/* Main Signal Assessment Box */}
      {signal ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              <div>
                <h2 className="text-lg font-bold text-white">Rule-Based Signal Rationale</h2>
                <p className="text-xs text-slate-400">
                  Strategy: <strong className="text-slate-200">{signal.strategy}</strong> • Evaluated at {signal.timestamp}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Trend Score:</span>
              <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-full text-xs font-bold text-slate-200 border border-slate-700">
                <span
                  className={`w-2 h-2 rounded-full ${
                    indicators.trendScore >= 60
                      ? 'bg-emerald-400'
                      : indicators.trendScore <= 40
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                  }`}
                />
                {indicators.trend} ({indicators.trendScore}/100)
              </div>
            </div>
          </div>

          {/* Supporting Reasons & Key Risks side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
            {/* Reasons */}
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                <span>Supporting Evidence ({signal.reasons.length} factors)</span>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300">
                {signal.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks & Uncertainties */}
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Uncertainties & Risk Factors ({signal.risks.length} considerations)</span>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300">
                {signal.risks.map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Technical Pivot Levels & Suggestion */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block">Key Support</span>
              <span className="text-sm font-bold text-slate-200">
                {signal.supportLevel > 0 ? `₹${signal.supportLevel.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block">Key Resistance</span>
              <span className="text-sm font-bold text-slate-200">
                {signal.resistanceLevel > 0 ? `₹${signal.resistanceLevel.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block">Stop-Loss Level</span>
              <span className="text-sm font-bold text-rose-400">
                {signal.stopLossSuggestion ? `₹${signal.stopLossSuggestion.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block">Target Projection</span>
              <span className="text-sm font-bold text-emerald-400">
                {signal.targetPriceSuggestion ? `₹${signal.targetPriceSuggestion.toFixed(2)}` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Explicit non-advisory disclaimer */}
          <p className="mt-4 text-[11px] text-slate-500 italic text-center">
            {signal.disclaimer}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
          Signal calculation unavailable for {quote.symbol}. Ensure at least 51 historical candles are available.
        </div>
      )}

      {/* Chart Section with Timeframe Filter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-200 text-sm">Interactive Candlesticks with SMA 20 & 50</h3>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
            {(['1M', '3M', '6M', '1Y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                  selectedTimeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <CandlestickChart
          candles={visibleCandles}
          symbol={quote.symbol}
          showSMA={true}
          showEMA={true}
          height={380}
        />
      </div>

      {/* Recent Historical OHLCV Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-200">Recent Sessions OHLCV Table</h3>
          <span className="text-xs text-slate-400">Past 10 trading sessions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Open (₹)</th>
                <th className="px-4 py-2.5">High (₹)</th>
                <th className="px-4 py-2.5">Low (₹)</th>
                <th className="px-4 py-2.5">Close (₹)</th>
                <th className="px-4 py-2.5">Change</th>
                <th className="px-4 py-2.5">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {candles.slice(-10).reverse().map((candle) => {
                const candleChg = candle.close - candle.open;
                const candlePos = candleChg >= 0;
                return (
                  <tr key={candle.time} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-200">{candle.time}</td>
                    <td className="px-4 py-2.5">₹{candle.open.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-emerald-400">₹{candle.high.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-rose-400">₹{candle.low.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-semibold text-white">₹{candle.close.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 font-medium ${candlePos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {candlePos ? '+' : ''}{candle.open > 0 ? ((candleChg / candle.open) * 100).toFixed(2) : 0}%
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {candle.volume.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
