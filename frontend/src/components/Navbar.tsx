import React from 'react';
import {
  LayoutDashboard,
  LineChart,
  Bot,
  History,
  Wallet,
  Settings,
  Search,
  IndianRupee,
  Stethoscope,
  Zap,
} from 'lucide-react';
import { SAMPLE_STOCKS } from '../data/sampleData';

export type NavTab = 'overview' | 'analysis' | 'ai' | 'backtest' | 'doctor' | 'paper' | 'hft' | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  cashBalance: number;
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  selectedSymbol,
  onSelectSymbol,
  cashBalance,
  onOpenSearch,
}) => {
  const navItems = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'analysis' as NavTab, label: 'Analysis', icon: LineChart },
    { id: 'ai' as NavTab, label: 'AI Analyst', icon: Bot },
    { id: 'backtest' as NavTab, label: 'Backtest', icon: History },
    { id: 'doctor' as NavTab, label: 'Strategy Doctor', icon: Stethoscope },
    { id: 'paper' as NavTab, label: 'Paper Trading', icon: Wallet },
    { id: 'hft' as NavTab, label: 'HFT Simulation', icon: Zap },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Brand & Market Identifier */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-black text-lg">
            AI
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-100 tracking-tight">
                MarketIQ
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                NSE/BSE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              AI Quantitative Research Platform
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right actions: Symbol Search Button, Quick Selector & Paper Account Equity Pill */}
        <div className="flex items-center gap-2.5">
          {/* Real Backend Search Modal Trigger Button */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              title="Search all supported Indian stocks"
            >
              <Search className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium hidden sm:inline">Search Stocks</span>
              <span className="text-[10px] bg-slate-700/80 text-slate-300 px-1 rounded font-mono hidden md:inline">
                ⌘K
              </span>
            </button>
          )}

          {/* Quick Selector for Active Ticker */}
          <div className="relative flex items-center">
            <select
              value={selectedSymbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              className="bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-semibold appearance-none max-w-[130px] sm:max-w-[160px] truncate"
            >
              <option value={selectedSymbol}>{selectedSymbol}</option>
              {Object.keys(SAMPLE_STOCKS)
                .filter((s) => s !== selectedSymbol)
                .map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
            </select>
          </div>

          {/* Paper Balance Quick Pill */}
          <div
            onClick={() => onSelectTab('paper')}
            className="cursor-pointer hidden sm:flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/80 hover:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs"
            title="Click to manage paper portfolio"
          >
            <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-slate-400 leading-none">Paper Cash</span>
              <span className="font-semibold text-emerald-400 text-xs">
                ₹{cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile navigation tab strip */}
      <div className="md:hidden flex overflow-x-auto border-t border-slate-800/80 px-2 py-1.5 gap-1 bg-slate-900/90 no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
