import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  isPositive?: boolean;
  icon?: LucideIcon;
  badge?: string;
  badgeColor?: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  isPositive,
  icon: Icon,
  badge,
  badgeColor = 'blue',
}) => {
  const badgeStyles = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  }[badgeColor];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span className="font-medium">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
          {value}
        </span>
        {badge && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeStyles}`}>
            {badge}
          </span>
        )}
      </div>
      {subValue && (
        <div className="mt-1 text-xs">
          <span
            className={
              isPositive === true
                ? 'text-emerald-400 font-medium'
                : isPositive === false
                ? 'text-rose-400 font-medium'
                : 'text-slate-400'
            }
          >
            {subValue}
          </span>
        </div>
      )}
    </div>
  );
};
