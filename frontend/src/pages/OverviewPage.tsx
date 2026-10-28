import React from 'react';
import type {
  StockQuote,
  MarketIndex,
  OHLCVCandle,
  TradingSignal,
} from '../types';
import { CandlestickChart } from '../components/CandlestickChart';
import { MetricCard } from '../components/MetricCard';
import { SignalBadge } from '../components/SignalBadge';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Layers,
  Sparkles,
  Play,
  Shield,
  Star,
  RefreshCw,
  AlertTriangle,
  Search,
} from 'lucide-react';
import type { NavTab } from '../components/Navbar';

interface OverviewPageProps {
  quote: StockQuote;
  candles: OHLCVCandle[];
  signal?: TradingSignal | null;
  indices: MarketIndex[];
  watchlist: string[];
  allStocks: Record<string, StockQuote>;
  onSelectSymbol: (symbol: string) => void;
  onToggleWatchlist: (symbol: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  isLoading?: boolean;
  isSignalLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenSearch?: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  quote,
  candles,
  signal,
  indices,
  watchlist,
  allStocks,
  onSelectSymbol,
  onToggleWatchlist,
  onNavigateTab,
  isLoading = false,
  isSignalLoading = false,
  error = null,
  onRetry,
  onOpenSearch,
}) => {
  const isPositive = quote.change >= 0;
  const isWatched = watchlist.includes(quote.symbol);

  return (
    <div className="space-y-6">
      {/* Disclaimer / Data Transparency Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-slate-300">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong className="text-slate-100 font-semibold">Data Source:</strong>{' '}
            <span className="text-blue-300 font-medium">{quote.dataSource}</span>. Interval:{' '}
            <span className="text-slate-200 font-medium">1d Daily</span>. Last updated:{' '}
            <span className="text-slate-200 font-medium">{quote.lastUpdated}</span>.
            Prices represent historical closes or delayed quotes (15m delay).
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium">
            <Shield className="w-3.5 h-3.5" />
            Research & Simulation
          </span>
        </div>
      </div>

      {/* Error Alert Box with Retry */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Market Data Error</p>
              <p className="text-rose-300/90">{error}</p>
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md transition-colors cursor-pointer"
            >
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Selected Stock Hero Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-xs text-blue-400 font-medium bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 shadow-xl">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading market data from FastAPI backend...</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {quote.name}
              </h1>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {quote.symbol}
              </span>
              <button
                onClick={() => onToggleWatchlist(quote.symbol)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  isWatched
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Star className="w-4 h-4 fill-current" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{quote.exchange}</span>
              <span>•</span>
              <span>{quote.sector}</span>
              <span>•</span>
              <span className="text-slate-500">Daily Candlestick Feed</span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition-all cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-blue-400" />
                <span>Search Stocks</span>
              </button>
            )}
            <button
              onClick={() => onNavigateTab('ai')}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI Analyst</span>
            </button>
            <button
              onClick={() => onNavigateTab('analysis')}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition-all cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Technical Indicators</span>
            </button>
            <button
              onClick={() => onNavigateTab('paper')}
              className="flex items-center gap-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Paper Trade</span>
            </button>
          </div>
        </div>

        {/* Price & Signal Row */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-[11px] text-slate-400 font-medium block">
              Latest Closing Price (Delayed / EOD)
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                ₹{quote.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <div
                className={`flex items-center gap-1 font-semibold text-sm ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>
                  {isPositive ? '+' : ''}
                  {quote.change.toFixed(2)} ({isPositive ? '+' : ''}
                  {quote.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Algorithmic Signal:</span>
            {isSignalLoading ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400">
                <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                <span>Evaluating...</span>
              </div>
            ) : signal ? (
              <SignalBadge signal={signal.signal} confidence={signal.confidence} size="md" />
            ) : (
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                Signal Unavailable
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Chart & Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Interactive Candlestick Chart (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <CandlestickChart candles={candles} symbol={quote.symbol} height={440} />

          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <MetricCard label="Open" value={`₹${quote.open.toFixed(2)}`} />
            <MetricCard label="High" value={`₹${quote.high.toFixed(2)}`} />
            <MetricCard label="Low" value={`₹${quote.low.toFixed(2)}`} />
            <MetricCard label="Prev Close" value={`₹${quote.previousClose.toFixed(2)}`} />
            <MetricCard
              label="Volume"
              value={quote.volume > 0 ? (quote.volume / 1000000).toFixed(2) + 'M' : 'N/A'}
            />
            <MetricCard label="P/E Ratio" value={quote.peRatio ? quote.peRatio.toString() : 'N/A'} />
          </div>
        </div>

        {/* Right: Watchlist & Market Summary (1 col) */}
        <div className="space-y-4">
          {/* Watchlist Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">Watchlist</h3>
              </div>
              <span className="text-xs text-slate-400">{watchlist.length} stocks</span>
            </div>

            <div className="divide-y divide-slate-800/60 mt-2 max-h-[320px] overflow-y-auto">
              {watchlist.map((sym) => {
                const stock = allStocks[sym];
                if (!stock) return null;
                const pos = stock.change >= 0;
                const isSelected = stock.symbol === quote.symbol;

                return (
                  <div
                    key={sym}
                    onClick={() => onSelectSymbol(sym)}
                    className={`flex items-center justify-between py-2.5 px-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-600/15 border border-blue-500/30'
                        : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-200">
                        {stock.symbol.replace('.NS', '').replace('.BO', '')}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[110px]">
                        {stock.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-xs text-slate-100">
                        ₹{stock.price > 0 ? stock.price.toFixed(2) : '--'}
                      </div>
                      <div
                        className={`text-[10px] font-medium ${
                          pos ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {stock.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 52-Week Range Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md text-xs space-y-3">
            <span className="font-bold text-slate-200 text-xs block">52-Week Valuation</span>
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-400">
                <span>52W Low: ₹{quote.week52Low ?? 'N/A'}</span>
                <span>52W High: ₹{quote.week52High ?? 'N/A'}</span>
              </div>
              {quote.week52Low && quote.week52High && (
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((quote.price - quote.week52Low) /
                            (quote.week52High - quote.week52Low)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between text-slate-300">
              <span className="text-slate-400">Market Cap:</span>
              <span className="font-semibold">{quote.marketCap ?? 'N/A'}</span>
            </div>
            <div className="pt-1 text-[11px] text-slate-500">
              Benchmark: {indices[0]?.name} (₹{indices[0]?.price.toFixed(0)})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
