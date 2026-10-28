import React from 'react';
import { Layers, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import type { L2OrderBookSnapshot } from '../types';

interface HFTOrderBookLadderProps {
  snapshot: L2OrderBookSnapshot;
  imbalanceThreshold?: number;
}

export const HFTOrderBookLadder: React.FC<HFTOrderBookLadderProps> = ({
  snapshot,
  imbalanceThreshold = 0.25,
}) => {
  const maxDepth = Math.max(
    ...snapshot.bids.map((b) => b.quantity),
    ...snapshot.asks.map((a) => a.quantity),
    1000
  );

  const isBidHeavy = snapshot.imbalance >= imbalanceThreshold;
  const isAskHeavy = snapshot.imbalance <= -imbalanceThreshold;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm">Level-2 Order Book Depth</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                10-Level Depth
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Seq #{snapshot.sequenceNumber.toLocaleString()} • Timestamp: {snapshot.timestamp}
            </p>
          </div>
        </div>

        {/* Microprice & Midprice Header Cards */}
        <div className="flex items-center gap-3 text-xs">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] block">Mid Price</span>
            <span className="font-mono font-bold text-slate-200">₹{snapshot.midPrice.toFixed(2)}</span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-indigo-400 text-[10px] block font-medium">L2 Microprice</span>
            <span className="font-mono font-bold text-indigo-300">₹{snapshot.microPrice.toFixed(2)}</span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-amber-400 text-[10px] block font-medium">Spread</span>
            <span className="font-mono font-bold text-amber-300">
              ₹{snapshot.spread.toFixed(2)}{' '}
              <span className="text-[10px] text-slate-500 font-normal">
                ({Math.round(snapshot.spread / 0.05)} ticks)
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Order Book Imbalance Gauge */}
      <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium text-slate-300">Book Imbalance (Top-5 Depth)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono font-bold text-xs ${
                isBidHeavy
                  ? 'text-emerald-400'
                  : isAskHeavy
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {snapshot.imbalance > 0 ? '+' : ''}
              {(snapshot.imbalance * 100).toFixed(1)}%
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isBidHeavy
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : isAskHeavy
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isBidHeavy ? 'BUY PRESSURE' : isAskHeavy ? 'SELL PRESSURE' : 'BALANCED'}
            </span>
          </div>
        </div>

        {/* Visual Dual-Bar Slider */}
        <div className="relative h-2.5 bg-slate-900 rounded-full overflow-hidden flex items-center">
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-700 z-10"></div>
          {/* Threshold markers */}
          <div
            className="absolute top-0 bottom-0 w-px bg-emerald-500/50 z-10"
            style={{ left: `${50 + imbalanceThreshold * 50}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-rose-500/50 z-10"
            style={{ left: `${50 - imbalanceThreshold * 50}%` }}
          />

          {/* Bid bar (right side of center) */}
          {snapshot.imbalance > 0 && (
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-150 rounded-r-full"
              style={{
                marginLeft: '50%',
                width: `${Math.min(snapshot.imbalance * 50, 50)}%`,
              }}
            />
          )}

          {/* Ask bar (left side of center) */}
          {snapshot.imbalance < 0 && (
            <div
              className="h-full bg-gradient-to-l from-rose-600 to-rose-400 transition-all duration-150 rounded-l-full ml-auto"
              style={{
                marginRight: '50%',
                width: `${Math.min(Math.abs(snapshot.imbalance) * 50, 50)}%`,
              }}
            />
          )}
        </div>

        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>-100% (Ask Heavy)</span>
          <span>Neutral (0%)</span>
          <span>+100% (Bid Heavy)</span>
        </div>
      </div>

      {/* Dual Order Book Ladder (Bids vs Asks) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
        {/* Bids Ladder (Buy side) */}
        <div className="bg-slate-950/90 rounded-xl p-3 border border-emerald-900/30 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
            <div className="flex items-center gap-1 text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Bids (Buyers)</span>
            </div>
            <div className="flex gap-4">
              <span>Qty</span>
              <span>Orders</span>
              <span>Price (₹)</span>
            </div>
          </div>

          <div className="space-y-1">
            {snapshot.bids.slice(0, 10).map((level, idx) => {
              const depthPct = Math.min((level.quantity / maxDepth) * 100, 100);
              const isBest = idx === 0;

              return (
                <div
                  key={level.price}
                  className={`relative flex items-center justify-between px-2 py-1 rounded text-xs transition-colors overflow-hidden ${
                    isBest
                      ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-500/30 font-bold'
                      : 'hover:bg-slate-900/60 text-slate-300'
                  }`}
                >
                  {/* Background Depth Bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/15 pointer-events-none transition-all duration-150"
                    style={{ width: `${depthPct}%` }}
                  />

                  <span className="text-[10px] text-slate-500 z-10 w-4">L{idx + 1}</span>

                  <div className="flex items-center justify-between w-full ml-2 z-10">
                    <span className="text-slate-400 font-normal">{level.quantity.toLocaleString()}</span>
                    <span className="text-slate-500 text-[10px]">{level.orderCount || 1}</span>
                    <span className="font-bold text-emerald-400">₹{level.price.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
            <span>Total Bid Depth:</span>
            <span className="font-bold text-emerald-400">{snapshot.totalBidDepth.toLocaleString()} shares</span>
          </div>
        </div>

        {/* Asks Ladder (Sell side) */}
        <div className="bg-slate-950/90 rounded-xl p-3 border border-rose-900/30 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
            <div className="flex items-center gap-1 text-rose-400">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>Asks (Sellers)</span>
            </div>
            <div className="flex gap-4">
              <span>Price (₹)</span>
              <span>Orders</span>
              <span>Qty</span>
            </div>
          </div>

          <div className="space-y-1">
            {snapshot.asks.slice(0, 10).map((level, idx) => {
              const depthPct = Math.min((level.quantity / maxDepth) * 100, 100);
              const isBest = idx === 0;

              return (
                <div
                  key={level.price}
                  className={`relative flex items-center justify-between px-2 py-1 rounded text-xs transition-colors overflow-hidden ${
                    isBest
                      ? 'bg-rose-950/40 text-rose-200 border border-rose-500/30 font-bold'
                      : 'hover:bg-slate-900/60 text-slate-300'
                  }`}
                >
                  {/* Background Depth Bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-rose-500/15 pointer-events-none transition-all duration-150"
                    style={{ width: `${depthPct}%` }}
                  />

                  <div className="flex items-center justify-between w-full mr-2 z-10">
                    <span className="font-bold text-rose-400">₹{level.price.toFixed(2)}</span>
                    <span className="text-slate-500 text-[10px]">{level.orderCount || 1}</span>
                    <span className="text-slate-400 font-normal">{level.quantity.toLocaleString()}</span>
                  </div>

                  <span className="text-[10px] text-slate-500 z-10 w-4 text-right">L{idx + 1}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
            <span>Total Ask Depth:</span>
            <span className="font-bold text-rose-400">{snapshot.totalAskDepth.toLocaleString()} shares</span>
          </div>
        </div>
      </div>
    </div>
  );
};
