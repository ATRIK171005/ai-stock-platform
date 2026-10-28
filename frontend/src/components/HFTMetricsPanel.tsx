import React from 'react';
import {
  Cpu,
  TrendingUp,
  Percent,
  AlertOctagon,
  Timer,
} from 'lucide-react';
import type { HFTSimulationMetrics } from '../types';

interface HFTMetricsPanelProps {
  metrics: HFTSimulationMetrics;
  throughputEps: number;
  eventsProcessed: number;
  totalEvents: number;
}

export const HFTMetricsPanel: React.FC<HFTMetricsPanelProps> = ({
  metrics,
  throughputEps,
  eventsProcessed,
  totalEvents,
}) => {
  const isPnlPositive = metrics.netPnl >= 0;
  const inventoryUsagePct = Math.min(
    Math.round((Math.abs(metrics.inventory) / metrics.maxInventory) * 100),
    100
  );

  return (
    <div className="space-y-4">
      {/* Top 4 Primary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Real-time Net P&L */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Simulated Net P&L</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div
            className={`font-mono text-lg sm:text-xl font-bold tracking-tight ${
              isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPnlPositive ? '+' : ''}₹{metrics.netPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 flex justify-between">
            <span>Gross: ₹{metrics.grossPnl.toFixed(2)}</span>
            <span className="text-amber-500/80">Fees: -₹{metrics.totalFees.toFixed(2)}</span>
          </div>
        </div>

        {/* Engine Throughput */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Local Throughput</span>
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
            {throughputEps.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-normal">evt/s</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {eventsProcessed.toLocaleString()} / {totalEvents.toLocaleString()} events processed
          </div>
        </div>

        {/* Inventory Exposure */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Inventory Exposure</span>
            <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
            {metrics.inventory > 0 ? `+${metrics.inventory}` : metrics.inventory}{' '}
            <span className="text-xs text-slate-500 font-normal">/ {metrics.maxInventory}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                inventoryUsagePct > 75
                  ? 'bg-rose-500'
                  : inventoryUsagePct > 40
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${inventoryUsagePct}%` }}
            />
          </div>
        </div>

        {/* Fill Rate */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Order Fill Rate</span>
            <Percent className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
            {metrics.fillRatePct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500">
            {metrics.ordersFilled} filled / {metrics.ordersSubmitted} submitted
          </div>
        </div>
      </div>

      {/* Monotonic Processing Latency Distribution (Measured via time.perf_counter_ns) */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs">
            <Timer className="w-4 h-4 text-cyan-400" />
            <span>Local Engine Latency Distribution</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Monotonic Clock (time.perf_counter_ns)
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-sans">Median (P50)</span>
            <span className="font-bold text-slate-200">{metrics.medianLatencyUs.toFixed(1)} µs</span>
          </div>
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-sans">95th Percentile</span>
            <span className="font-bold text-indigo-300">{metrics.p95LatencyUs.toFixed(1)} µs</span>
          </div>
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-sans">99th Percentile</span>
            <span className="font-bold text-amber-300">{metrics.p99LatencyUs.toFixed(1)} µs</span>
          </div>
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-sans">Maximum (Tail)</span>
            <span className="font-bold text-rose-300">{metrics.maxLatencyUs.toFixed(1)} µs</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 leading-normal">
          *Note: Measures internal Python event loop duration per tick. Exchange wire transit time
          and kernel network stack latency are excluded and modeled as simulated parameters.
        </p>
      </div>
    </div>
  );
};
