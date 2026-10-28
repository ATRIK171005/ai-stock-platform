import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  LineChart,
  Bot,
  History,
  Wallet,
  Settings,
  Search,
  Stethoscope,
  Zap,
  ChevronDown,
  PlusCircle,
  Briefcase,
  LogIn,
  LogOut,
  Check,
} from 'lucide-react';
import { SAMPLE_STOCKS } from '../data/sampleData';
import type { UserProfile, UserAccountItem } from '../types';

export type NavTab =
  | 'overview'
  | 'analysis'
  | 'ai'
  | 'backtest'
  | 'doctor'
  | 'paper'
  | 'hft'
  | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  cashBalance: number;
  onOpenSearch?: () => void;
  currentUser?: UserProfile | null;
  accounts?: UserAccountItem[];
  activeAccountId?: string;
  onSelectAccount?: (accountId: string) => void;
  onOpenAddAccount?: () => void;
  onOpenAuth?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  selectedSymbol,
  onSelectSymbol,
  cashBalance,
  onOpenSearch,
  currentUser,
  accounts = [],
  activeAccountId = 'default_account',
  onSelectAccount,
  onOpenAddAccount,
  onOpenAuth,
  onLogout,
}) => {
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const accountMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const currentAccount = accounts.find((a) => a.id === activeAccountId);
  const activeAccountName = currentAccount ? currentAccount.name : 'Primary Portfolio';

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
              <span className="font-bold text-base text-slate-100 tracking-tight">MarketIQ</span>
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

        {/* Right Actions: Stock Search, Account Switcher & Auth */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Real Backend Search Modal Trigger Button */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs rounded-lg px-2.5 sm:px-3 py-1.5 transition-colors cursor-pointer"
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
          <div className="relative hidden lg:flex items-center">
            <select
              value={selectedSymbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              className="bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-semibold appearance-none max-w-[130px] sm:max-w-[150px] truncate"
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

          {/* Multi-Account Selector Dropdown */}
          <div className="relative" ref={accountMenuRef}>
            <button
              onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
              title="Switch Portfolio Account"
            >
              <Briefcase className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="flex flex-col text-left max-w-[90px] sm:max-w-[120px]">
                <span className="text-[10px] text-slate-400 truncate leading-none">
                  {activeAccountName}
                </span>
                <span className="font-mono font-semibold text-emerald-400 text-[11px] leading-tight">
                  ₹{cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {isAccountDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
                  <span>Trading Portfolios</span>
                  <span className="text-slate-500 font-mono">{accounts.length} active</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 py-1">
                  {accounts.map((acc) => {
                    const isSelected = acc.id === activeAccountId;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          if (onSelectAccount) onSelectAccount(acc.id);
                          setIsAccountDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                            : 'hover:bg-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold text-xs truncate">{acc.name}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            Cash: ₹{acc.cash_balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {onOpenAddAccount && (
                  <div className="pt-1 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setIsAccountDropdownOpen(false);
                        onOpenAddAccount();
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-cyan-400 hover:bg-cyan-500/10 font-semibold text-xs transition-colors"
                    >
                      <PlusCircle className="w-4 h-4 text-cyan-400" />
                      <span>Add New Portfolio</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile / Login Session Action */}
          <div className="relative" ref={userMenuRef}>
            {currentUser ? (
              <div>
                <button
                  onClick={() => setIsUserDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 py-1 px-2.5 rounded-lg text-xs font-medium text-slate-200 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold text-[10px] flex items-center justify-center">
                    {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline font-semibold">{currentUser.username}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {isUserDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1.5 border-b border-slate-800">
                      <div className="font-bold text-white text-xs truncate">
                        {currentUser.full_name || currentUser.username}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{currentUser.email}</div>
                    </div>

                    <button
                      onClick={() => {
                        setIsUserDropdownOpen(false);
                        if (onLogout) onLogout();
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
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
