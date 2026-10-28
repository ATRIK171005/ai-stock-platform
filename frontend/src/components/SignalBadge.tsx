import React from 'react';
import { ArrowUpCircle, ArrowDownCircle, PauseCircle } from 'lucide-react';

interface SignalBadgeProps {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const SignalBadge: React.FC<SignalBadgeProps> = ({
  signal,
  confidence,
  size = 'md',
}) => {
  let colorClasses = '';
  let Icon = PauseCircle;

  switch (signal) {
    case 'BUY':
      colorClasses = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-950/30';
      Icon = ArrowUpCircle;
      break;
    case 'SELL':
      colorClasses = 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-rose-950/30';
      Icon = ArrowDownCircle;
      break;
    case 'HOLD':
      colorClasses = 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-950/30';
      Icon = PauseCircle;
      break;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base font-bold gap-2',
  }[size];

  return (
    <div
      className={`inline-flex items-center font-bold tracking-wide rounded-lg border shadow-sm ${colorClasses} ${sizeClasses}`}
    >
      <Icon className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      <span>{signal}</span>
      {confidence !== undefined && (
        <span className="opacity-80 text-xs font-normal">
          ({Math.round(confidence * 100)}%)
        </span>
      )}
    </div>
  );
};
