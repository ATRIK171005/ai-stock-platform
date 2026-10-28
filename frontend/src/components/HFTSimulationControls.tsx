import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Database,
  Sliders,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import type {
  HFTStrategyType,
  HFTSimulationStatus,
  HFTDatasetInfo,
  HFTStrategyConfig,
} from '../types';

interface HFTSimulationControlsProps {
  status: HFTSimulationStatus;
  datasets: HFTDatasetInfo[];
  selectedDatasetId: string;
  onSelectDataset: (id: string) => void;
  config: HFTStrategyConfig;
  onUpdateConfig: (newConfig: HFTStrategyConfig) => void;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  speedMultiplier: number;
  onSelectSpeed: (speed: number) => void;
  isConfigOpen: boolean;
  onToggleConfig: () => void;
}

export const HFTSimulationControls: React.FC<HFTSimulationControlsProps> = ({
  status,
  datasets,
  selectedDatasetId,
  onSelectDataset,
  config,
  onUpdateConfig,
  onStart,
  onPause,
  onStep,
  onReset,
  speedMultiplier,
  onSelectSpeed,
  isConfigOpen,
  onToggleConfig,
}) => {
  const currentDataset = datasets.find((d) => d.id === selectedDatasetId) || datasets[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Dataset Selector & Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-300">Dataset:</span>
          </div>

          <select
            value={selectedDatasetId}
            onChange={(e) => onSelectDataset(e.target.value)}
            disabled={status === 'RUNNING'}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Dataset Type Badge */}
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
              currentDataset?.type === 'REAL_RECORDED'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
            }`}
          >
            {currentDataset?.type === 'REAL_RECORDED' ? 'RECORDED L2 REPLAY' : 'SYNTHETIC STRESS'}
          </span>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2">
          {status === 'RUNNING' ? (
            <button
              onClick={onPause}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/25 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{status === 'PAUSED' ? 'Resume' : 'Start Simulation'}</span>
            </button>
          )}

          <button
            onClick={onStep}
            disabled={status === 'RUNNING'}
            title="Single-step 1 event forward"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Step</span>
          </button>

          <button
            onClick={onReset}
            title="Reset simulation back to event #0"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {/* Right: Speed & Settings Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px] font-mono">
            {[0.5, 1, 5, 20].map((s) => (
              <button
                key={s}
                onClick={() => onSelectSpeed(s)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  speedMultiplier === s
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={onToggleConfig}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              isConfigOpen
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>Config</span>
          </button>
        </div>
      </div>

      {/* Strategy Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium text-[11px]">Active Strategy:</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ORDER_BOOK_IMBALANCE', label: 'Book Imbalance Alpha (OBI)' },
              { id: 'AVALLANEDA_STOIKOV', label: 'Adaptive Market Making' },
              { id: 'EXECUTION_COST', label: 'Execution Cost Profiler' },
            ].map((strat) => (
              <button
                key={strat.id}
                onClick={() =>
                  onUpdateConfig({
                    ...config,
                    strategyType: strat.id as HFTStrategyType,
                  })
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  config.strategyType === strat.id
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/40 font-semibold'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-slate-200'
                }`}
              >
                {strat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hard Risk Limit Notice */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>Max Inventory: {config.maxInventory} shares • Daily Loss Limit: ₹5,000</span>
        </div>
      </div>

      {/* Collapsible Strategy Config Drawer */}
      {isConfigOpen && (
        <div className="p-4 bg-slate-950/80 rounded-xl border border-indigo-900/40 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-indigo-300 font-bold pb-2 border-b border-slate-800">
            <Settings2 className="w-4 h-4" />
            <span>Strategy & Execution Engine Parameters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Book Depth Levels</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.depthLevels}
                onChange={(e) =>
                  onUpdateConfig({ ...config, depthLevels: parseInt(e.target.value) || 5 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">OBI Trigger Threshold</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="0.80"
                value={config.imbalanceThreshold}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    imbalanceThreshold: parseFloat(e.target.value) || 0.25,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Simulated Wire Delay (ms)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="50"
                value={config.simulatedWireLatencyMs}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    simulatedWireLatencyMs: parseFloat(e.target.value) || 0.5,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Order Lot Size (Shares)</label>
              <input
                type="number"
                min="1"
                max="500"
                value={config.orderQuantity}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    orderQuantity: parseInt(e.target.value) || 25,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
