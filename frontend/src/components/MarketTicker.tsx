import React from 'react';
import type { MarketIndex } from '../types';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface MarketTickerProps {
  indices: MarketIndex[];
  dataSourceNotice?: string;
}

export const MarketTicker: React.FC<MarketTickerProps> = ({
  indices,
  dataSourceNotice = 'Simulated / Delayed 15m (NSE/BSE)',
}) => {
  return (
    <div className="w-full bg-slate-950/80 border-b border-slate-800/80 px-4 py-2 text-xs backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6 overflow-x-auto py-0.5 no-scrollbar">
          {indices.map((idx) => {
            const isPos = idx.change >= 0;
            return (
              <div key={idx.symbol} className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-medium text-slate-300">{idx.name}</span>
                <span className="font-semibold text-slate-100">
                  ₹{idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span
                  className={`flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded ${
                    isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {isPos ? (
                    <TrendingUp className="w-3 h-3 mr-0.5 inline" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-0.5 inline" />
                  )}
                  {isPos ? '+' : ''}
                  {idx.change.toFixed(2)} ({isPos ? '+' : ''}
                  {idx.changePercent.toFixed(2)}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px] shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-amber-300/90 font-medium">Notice:</span>
          <span>{dataSourceNotice}</span>
        </div>
      </div>
    </div>
  );
};
