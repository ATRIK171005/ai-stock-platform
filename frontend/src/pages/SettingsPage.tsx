import React, { useState } from 'react';
import type { AppSettings } from '../types';
import {
  Database,
  Cpu,
  Shield,
  Activity,
  CheckCircle2,
  Save,
} from 'lucide-react';

interface SettingsPageProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Platform Settings & Configuration
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure Indian market data feeds, Google Gen AI models, and portfolio risk management rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            System Operational
          </span>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Platform settings updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Market Data Feed Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Database className="w-4 h-4 text-blue-400" />
            <span>Market Data Provider Settings</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Provider Interface</label>
              <select
                value={formData.dataProvider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dataProvider: e.target.value as AppSettings['dataProvider'],
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="YAHOO_FINANCE">Yahoo Finance (yfinance NSE/BSE) - Delayed 15m</option>
                <option value="SIMULATED_MOCK">Simulated Mock Engine (Deterministic Sandbox)</option>
              </select>
              <span className="text-[11px] text-slate-400 block">
                Pluggable market provider interface architecture for Indian equities.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Default Exchange</label>
              <select
                value={formData.exchange}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    exchange: e.target.value as AppSettings['exchange'],
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="NSE">NSE (National Stock Exchange - suffix: .NS)</option>
                <option value="BSE">BSE (Bombay Stock Exchange - suffix: .BO)</option>
              </select>
              <span className="text-[11px] text-slate-400 block">
                Symbols are normalized automatically with appropriate exchange suffixes.
              </span>
            </div>
          </div>
        </div>

        {/* AI Model Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>AI Model & Google Gen AI SDK</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Gemini Model ID (GEMINI_MODEL)</label>
              <select
                value={formData.geminiModel}
                onChange={(e) => setFormData({ ...formData, geminiModel: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended Flash Model)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash (Low-cost Flash)</option>
              </select>
              <span className="text-[11px] text-slate-400 block">
                Model configured via GEMINI_MODEL server environment variable.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Backend API Key Security</label>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">GEMINI_API_KEY:</span>
                <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Protected on Backend
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block">
                API keys are never exposed in client bundle or frontend network payloads.
              </span>
            </div>
          </div>
        </div>

        {/* Risk Limits Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Paper Trading Risk Controls</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Max Position Size (% Equity)</label>
              <input
                type="number"
                min="5"
                max="100"
                value={formData.maxPositionSizePercent}
                onChange={(e) =>
                  setFormData({ ...formData, maxPositionSizePercent: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Daily Loss Limit (₹)</label>
              <input
                type="number"
                step="500"
                min="1000"
                value={formData.dailyLossLimit}
                onChange={(e) =>
                  setFormData({ ...formData, dailyLossLimit: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Default Brokerage (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.defaultBrokeragePercent}
                onChange={(e) =>
                  setFormData({ ...formData, defaultBrokeragePercent: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Default Slippage (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.defaultSlippagePercent}
                onChange={(e) =>
                  setFormData({ ...formData, defaultSlippagePercent: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* System Diagnostics & Provider Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Activity className="w-4 h-4 text-purple-400" />
            <span>Service & Diagnostic Health Status</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-400">Market Data Feed</div>
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                yfinance Connected (Delayed 15m)
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-400">AI Analyst Service</div>
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                Google Gen AI SDK Ready
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-400">Database Layer</div>
              <div className="font-bold text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                SQLAlchemy + PostgreSQL / SQLite
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-400">Execution Engine</div>
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Deterministic Sandbox Mode
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
