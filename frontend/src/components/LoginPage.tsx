import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  LogIn,
  UserPlus,
  Zap,
  AlertCircle,
  Loader2,
  ShieldCheck,
  IndianRupee,
  LineChart,
  BrainCircuit,
  Layers,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { loginUser, registerUser, loginDemoUser } from '../services/api';
import type { AuthSessionResponse } from '../types';

interface LoginPageProps {
  onLoginSuccess: (authData: AuthSessionResponse) => void;
  onExploreGuest: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onExploreGuest }) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [loginIdent, setLoginIdent] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Status & loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdent.trim() || !loginPassword) {
      setError('Please provide your username/email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const auth = await loginUser({
        username_or_email: loginIdent.trim(),
        password: loginPassword,
      });
      onLoginSuccess(auth);
    } catch (err: any) {
      setError(err.detail || err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regUsername.trim() || !regPassword) {
      setError('Please fill out all required fields.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const auth = await registerUser({
        email: regEmail.trim().toLowerCase(),
        username: regUsername.trim(),
        password: regPassword,
        full_name: regFullName.trim() || 'Trader',
      });
      onLoginSuccess(auth);
    } catch (err: any) {
      setError(err.detail || err.message || 'Registration failed. Username or email may already be registered.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setError(null);
    try {
      const auth = await loginDemoUser();
      onLoginSuccess(auth);
    } catch (err: any) {
      setError(err.detail || err.message || 'Instant demo login failed. Connecting fallback demo profile.');
      // Local fallback profile with ₹1 Lakh demo funds
      onLoginSuccess({
        access_token: 'demo_offline_token',
        token_type: 'bearer',
        user: {
          id: 'usr_guest_demo',
          email: 'demo@marketiq.in',
          username: 'demotrader',
          full_name: 'Demo Quant Trader',
          created_at: new Date().toISOString(),
        },
        active_account_id: 'default_account',
        accounts: [
          {
            id: 'default_account',
            name: 'Primary Portfolio',
            user_id: 'usr_guest_demo',
            initial_balance: 100000.0,
            cash_balance: 100000.0,
            total_equity: 100000.0,
            realized_pnl: 0.0,
            open_positions_count: 0,
            currency: 'INR',
            created_at: new Date().toISOString(),
          },
        ],
      });
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Minimal Brand Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/80 text-blue-400 shadow-sm">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 20V10" />
              <path d="M3 14h4" />
              <path d="M7 20V4" />
              <path d="M12 20v-8" />
              <path d="M12 8h4" />
              <path d="M16 20V6" />
              <path d="M21 20v-5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg text-slate-100 tracking-tight font-mono">
                MARKET<span className="text-blue-400">IQ</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                PRO
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                NSE/BSE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">INSTITUTIONAL QUANTITATIVE TERMINAL</p>
          </div>
        </div>

        <button
          onClick={onExploreGuest}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/80 cursor-pointer"
        >
          <span>Explore as Guest</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </header>

      {/* Main Split Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 flex items-center justify-center w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 w-full items-center">
          {/* Left Column: Platform Showcase & Free ₹1 Lakh Currency Promotion */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulated Margin Sandbox • Zero Capital Risk</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100 tracking-tight leading-tight">
                Quantitative Research &{' '}
                <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                  Execution Terminal
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                Institutional-grade order book simulation, deep technical indicator pipelines, and algorithmic equity research calibrated for Indian equities (NSE/BSE).
              </p>
            </div>

            {/* Special Highlight Card: 1 Lakh Free Capital */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-900/25 via-slate-900/80 to-emerald-950/20 border border-emerald-500/30 shadow-xl shadow-emerald-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-xl shadow-md shadow-emerald-500/20">
                  <IndianRupee className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">₹1,00,000 Virtual Capital</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                      Instant Credit
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Every new trader gets <strong className="text-emerald-400">₹1 Lakh (₹1,00,000 INR)</strong> in simulated capital automatically credited to their primary portfolio upon signing up. Practice limit orders, risk controls, and automated strategies with real exchange prices without risking real funds.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
                <LineChart className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Real NSE/BSE Exchange Quotes</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
                <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>HFT Microsecond Order Replay</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
                <BrainCircuit className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Algorithmic Equity Research Notes</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Multi-Portfolio Isolation</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dedicated Login & Register Card */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
              {/* Tab Selector */}
              <div className="flex items-center p-1 rounded-xl bg-slate-950/80 border border-slate-800 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('LOGIN');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'LOGIN'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('REGISTER');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'REGISTER'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account (₹1L)</span>
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Sign In Form */}
              {activeTab === 'LOGIN' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Username or Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={loginIdent}
                        onChange={(e) => setLoginIdent(e.target.value)}
                        placeholder="trader@domain.com or trader"
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Sign In to Terminal</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Registration Form with Explicit 1 Lakh Capital Callout */
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder="Atrik Samanta"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Address <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="trader@domain.com"
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Choose Username <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="quant_trader"
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Create Password <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showRegPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Guaranteed Virtual Capital Badge */}
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Includes <strong>₹1,00,000 (1 Lakh)</strong> starting virtual balance in your Primary Portfolio.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Claim ₹1 Lakh & Create Account</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Instant 1-Click Access Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-slate-900 px-2 text-slate-500 font-semibold">Or Instant 1-Click Access</span>
                </div>
              </div>

              {/* 1-Click Instant Demo Login */}
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={isDemoLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.99] border border-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isDemoLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Launching Demo Profile...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>1-Click Demo Login (Pre-funded ₹1 Lakh)</span>
                  </>
                )}
              </button>

              {/* Guest Explore Link */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onExploreGuest}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
                >
                  Continue as Guest without saving progress
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>NIST PBKDF2 Password Hashing • HMAC-SHA256 Token Auth</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 px-6 py-3 text-center text-xs text-slate-500">
        <p>MarketIQ Quantitative Research Platform • Simulated Risk-Free Paper Trading Environment</p>
      </footer>
    </div>
  );
};
