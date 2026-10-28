import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import type { NavTab } from './components/Navbar';
import { MarketTicker } from './components/MarketTicker';
import { StockSearchModal } from './components/StockSearchModal';
import { AuthModal } from './components/AuthModal';
import { AddAccountModal } from './components/AddAccountModal';
import { OverviewPage } from './pages/OverviewPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { AIAnalystPage } from './pages/AIAnalystPage';
import { BacktestPage } from './pages/BacktestPage';
import { StrategyDoctorPage } from './pages/StrategyDoctorPage';
import { PaperTradingPage } from './pages/PaperTradingPage';
import { HFTResearchPage } from './pages/HFTResearchPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  SAMPLE_INDICES,
  SAMPLE_STOCKS,
  SAMPLE_INDICATORS,
  SAMPLE_SIGNALS,
  SAMPLE_AI_REPORT,
  SAMPLE_BACKTEST_RESULT,
  INITIAL_PAPER_ACCOUNT,
  INITIAL_PAPER_POSITIONS,
  INITIAL_PAPER_ORDERS,
  DEFAULT_APP_SETTINGS,
  generateSampleCandles,
} from './data/sampleData';
import type {
  PaperAccount,
  PaperPosition,
  PaperOrder,
  AppSettings,
  TradingSignal,
  TechnicalIndicators,
  StockQuote,
  OHLCVCandle,
  UserProfile,
  UserAccountItem,
  AuthSessionResponse,
} from './types';
import {
  fetchStockHistory,
  fetchStockIndicators,
  fetchStockSignal,
  mapBackendIndicatorsToFrontend,
  mapBackendSignalToFrontend,
  buildQuoteFromCandles,
  checkBackendHealth,
  fetchPaperAccount,
  fetchPaperPositions,
  fetchPaperOrders,
  submitPaperOrder,
  resetPaperAccount,
  fetchCurrentUser,
  fetchUserAccounts,
  logoutUserSession,
  getStoredAccountId,
  setStoredAccountId,
} from './services/api';
import { ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE.NS');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [allStocksRegistry, setAllStocksRegistry] = useState<Record<string, StockQuote>>(SAMPLE_STOCKS);
  const allStocksRegistryRef = useRef(allStocksRegistry);
  useEffect(() => {
    allStocksRegistryRef.current = allStocksRegistry;
  }, [allStocksRegistry]);

  const [watchlist, setWatchlist] = useState<string[]>([
    'RELIANCE.NS',
    'TCS.NS',
    'INFY.NS',
    'HDFCBANK.NS',
  ]);
  const [activeBacktestId, setActiveBacktestId] = useState<string | undefined>(undefined);
  const [paperAccount, setPaperAccount] = useState<PaperAccount>(INITIAL_PAPER_ACCOUNT);
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>(INITIAL_PAPER_POSITIONS);
  const [paperOrders, setPaperOrders] = useState<PaperOrder[]>(INITIAL_PAPER_ORDERS);
  const [isPaperLoading, setIsPaperLoading] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  // User Authentication & Multi-Account States
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState<boolean>(false);
  const [activeAccountId, setActiveAccountId] = useState<string>(() => getStoredAccountId());
  const [userAccounts, setUserAccounts] = useState<UserAccountItem[]>([
    {
      id: 'default_account',
      name: 'Primary Portfolio',
      user_id: 'default_user',
      initial_balance: INITIAL_PAPER_ACCOUNT.startingBalance,
      cash_balance: INITIAL_PAPER_ACCOUNT.cashBalance,
      total_equity: INITIAL_PAPER_ACCOUNT.totalEquity,
      realized_pnl: INITIAL_PAPER_ACCOUNT.realizedPnL,
      open_positions_count: INITIAL_PAPER_POSITIONS.length,
      currency: 'INR',
      created_at: new Date().toISOString(),
    },
  ]);

  // Session and account initialization
  useEffect(() => {
    let isMounted = true;
    async function initSessionAndAccounts() {
      try {
        const session = await fetchCurrentUser();
        if (isMounted && session) {
          setCurrentUser(session.user);
          if (session.accounts && session.accounts.length > 0) {
            setUserAccounts(session.accounts);
            if (session.active_account_id) {
              setActiveAccountId(session.active_account_id);
              setStoredAccountId(session.active_account_id);
            }
          }
        } else {
          const accs = await fetchUserAccounts();
          if (isMounted && accs && accs.length > 0) {
            setUserAccounts(accs);
          }
        }
      } catch {
        // Fallback gracefully
      }
    }
    initSessionAndAccounts();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectAccount = useCallback((accId: string) => {
    setActiveAccountId(accId);
    setStoredAccountId(accId);
  }, []);

  const handleAuthSuccess = (authData: AuthSessionResponse) => {
    setCurrentUser(authData.user);
    if (authData.accounts && authData.accounts.length > 0) {
      setUserAccounts(authData.accounts);
      if (authData.active_account_id) {
        setActiveAccountId(authData.active_account_id);
        setStoredAccountId(authData.active_account_id);
      }
    }
  };

  const handleLogout = () => {
    logoutUserSession();
    setCurrentUser(null);
    setActiveAccountId('default_account');
    setStoredAccountId('default_account');
  };

  const handleAddAccountSuccess = (newAcc: UserAccountItem) => {
    setUserAccounts((prev) => [...prev, newAcc]);
    setActiveAccountId(newAcc.id);
    setStoredAccountId(newAcc.id);
  };

  // Sync Paper Trading Data from FastAPI Backend
  const refreshPaperData = useCallback(async () => {
    setIsPaperLoading(true);
    try {
      const [acc, pos, ords] = await Promise.all([
        fetchPaperAccount(),
        fetchPaperPositions(),
        fetchPaperOrders(),
      ]);
      setPaperAccount(acc);
      setPaperPositions(pos);
      setPaperOrders(ords);
    } catch (err) {
      console.warn('Backend paper trading fetch failed, maintaining existing state:', err);
    } finally {
      setIsPaperLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPaperData();
  }, [activeAccountId, refreshPaperData]);

  // Live Data States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSignalLoading, setIsSignalLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [liveCandles, setLiveCandles] = useState<OHLCVCandle[] | null>(null);
  const [liveQuote, setLiveQuote] = useState<StockQuote | null>(null);
  const [liveIndicators, setLiveIndicators] = useState<TechnicalIndicators | null>(null);
  const [liveSignal, setLiveSignal] = useState<TradingSignal | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  // Global Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check backend health on mount and sync initial paper trading data
  useEffect(() => {
    checkBackendHealth().then((status) => {
      if (status && status.status === 'ok') {
        setIsLiveConnected(true);
        refreshPaperData();
      } else {
        setIsLiveConnected(false);
      }
    });
  }, [refreshPaperData]);

  // Sync paper data whenever switching to paper trading tab
  useEffect(() => {
    if (activeTab === 'paper') {
      refreshPaperData();
    }
  }, [activeTab, refreshPaperData]);

  // Fetch real market data when selectedSymbol or retryNonce changes
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function loadData() {
      setIsLoading(true);
      setIsSignalLoading(true);
      setApiError(null);

      try {
        // Fetch history and indicators concurrently from FastAPI backend
        const [historyRes, indicatorsRes] = await Promise.all([
          fetchStockHistory(selectedSymbol, '1y', '1d', signal),
          fetchStockIndicators(selectedSymbol, '1y', '1d', signal).catch((indErr) => {
            console.warn('Indicators retrieval notice:', indErr);
            return null;
          }),
        ]);

        if (signal.aborted) return;

        // Use enriched candles from indicators endpoint if present, else history candles
        const candlesToUse = indicatorsRes?.candles || historyRes.candles;

        if (candlesToUse && candlesToUse.length > 0) {
          const baseQuote = allStocksRegistryRef.current[selectedSymbol];
          const newQuote = buildQuoteFromCandles(
            selectedSymbol,
            candlesToUse,
            baseQuote,
            `Live FastAPI Feed • ${historyRes.source} (Delayed 15m)`
          );

          setLiveCandles(candlesToUse);
          setLiveQuote(newQuote);
          if (indicatorsRes) {
            setLiveIndicators(mapBackendIndicatorsToFrontend(indicatorsRes));
          }
          setIsLiveConnected(true);

          // Update registry with latest price
          setAllStocksRegistry((prev) => ({
            ...prev,
            [selectedSymbol]: newQuote,
          }));
        }

        // Fetch signal separately so failure in signal doesn't break chart rendering
        try {
          const signalRes = await fetchStockSignal(selectedSymbol, '1y', '1d', signal);
          if (!signal.aborted) {
            setLiveSignal(mapBackendSignalToFrontend(signalRes));
          }
        } catch (sigErr: any) {
          console.warn('Signal retrieval notice:', sigErr);
          setLiveSignal(null);
        } finally {
          setIsSignalLoading(false);
        }
      } catch (err: any) {
        if (signal.aborted || err?.errorCode === 'CLIENT_ABORTED' || err?.status === 499) return;
        console.warn('Backend fetch failed, using explicitly labeled DEMO mode:', err);
        setApiError(
          `Unable to retrieve market data for ${selectedSymbol} from backend (${err.detail || err.message || 'Server Offline'}). Switched to labeled DEMO mode.`
        );
        setIsLiveConnected(false);
        setLiveCandles(null);
        setLiveQuote(null);
        setLiveIndicators(null);
        setLiveSignal(null);
        setIsSignalLoading(false);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      controller.abort();
    };
  }, [selectedSymbol, retryNonce]);

  const handleRetry = useCallback(() => {
    setRetryNonce((prev) => prev + 1);
  }, []);

  const handleSelectSymbol = useCallback((symbol: string, name?: string) => {
    setSelectedSymbol(symbol);
    if (name) {
      setAllStocksRegistry((prev) => {
        if (prev[symbol]) return prev;
        return {
          ...prev,
          [symbol]: {
            symbol,
            name,
            exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE',
            sector: 'Equities',
            price: 0,
            change: 0,
            changePercent: 0,
            open: 0,
            high: 0,
            low: 0,
            previousClose: 0,
            volume: 0,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Yahoo Finance (Delayed 15m)',
            isDelayed: true,
          },
        };
      });
    }
  }, []);

  // Fallback sample quote if live not loaded
  const fallbackQuote = allStocksRegistry[selectedSymbol] || SAMPLE_STOCKS['RELIANCE.NS'];

  // Effective active stock quote with explicit DEMO label if offline
  const currentQuote: StockQuote = useMemo(() => {
    if (liveQuote) return liveQuote;
    return {
      ...fallbackQuote,
      dataSource: 'DEMO MODE: Simulated Historical Baseline (Backend Offline / Fallback)',
    };
  }, [liveQuote, fallbackQuote]);

  // Effective candles
  const currentCandles: OHLCVCandle[] = useMemo(() => {
    if (liveCandles && liveCandles.length > 0) return liveCandles;
    return generateSampleCandles(fallbackQuote.price, 90);
  }, [liveCandles, fallbackQuote.price]);

  // Effective indicators
  const currentIndicators: TechnicalIndicators = useMemo(() => {
    if (liveIndicators) return liveIndicators;
    return SAMPLE_INDICATORS[selectedSymbol] || SAMPLE_INDICATORS['RELIANCE.NS'];
  }, [liveIndicators, selectedSymbol]);

  // Effective signal
  const currentSignal: TradingSignal | null = useMemo(() => {
    if (liveSignal) return liveSignal;
    if (isLiveConnected) return null; // If live connected and signal is null, don't show mock signal
    return SAMPLE_SIGNALS[selectedSymbol] || null;
  }, [liveSignal, isLiveConnected, selectedSymbol]);

  // Active AI report
  const currentAIReport = useMemo(() => {
    return {
      ...SAMPLE_AI_REPORT,
      symbol: selectedSymbol,
      observedFacts: {
        ...SAMPLE_AI_REPORT.observedFacts,
        price: currentQuote.price,
        changePercent: currentQuote.changePercent,
        indicators: {
          'SMA 20': currentIndicators.sma20,
          'SMA 50': currentIndicators.sma50,
          'EMA 20': currentIndicators.ema20,
          'RSI (14)': currentIndicators.rsi14,
          'MACD Line': currentIndicators.macd.macdLine,
          'Signal Line': currentIndicators.macd.signalLine,
          'ATR (14)': currentIndicators.atr14,
        },
      },
    };
  }, [selectedSymbol, currentQuote, currentIndicators]);

  // Toggle watchlist
  const handleToggleWatchlist = (symbol: string) => {
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  // Place paper order handler via FastAPI backend
  const handlePlaceOrder = async (orderData: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    quantity: number;
    limitPrice?: number;
    stopLossPrice?: number;
    notes?: string;
  }): Promise<{ success: boolean; message: string; order?: PaperOrder }> => {
    try {
      const executedOrder = await submitPaperOrder({
        symbol: orderData.symbol,
        side: orderData.side,
        orderType: orderData.orderType,
        quantity: orderData.quantity,
        limitPrice: orderData.limitPrice,
        stopLossPrice: orderData.stopLossPrice,
        notes: orderData.notes,
        idempotencyKey: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      await refreshPaperData();
      return {
        success: true,
        message: `Simulated ${executedOrder.type} order of ${executedOrder.quantity} shares of ${executedOrder.symbol.replace('.NS', '')} executed at ₹${executedOrder.price.toFixed(2)}. Status: ${executedOrder.status}.`,
        order: executedOrder,
      };
    } catch (err: any) {
      console.error('Paper order execution error:', err);
      const errorMsg =
        err?.detail ||
        err?.message ||
        'Order submission failed due to server or risk limit error.';
      return {
        success: false,
        message: errorMsg,
      };
    }
  };

  const handleResetAccount = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const updatedAccount = await resetPaperAccount(true, 100000.0);
      setPaperAccount(updatedAccount);
      setPaperPositions([]);
      setPaperOrders([]);
      await refreshPaperData();
      return {
        success: true,
        message: 'Paper trading account successfully reset to ₹100,000 INR.',
      };
    } catch (err: any) {
      console.error('Paper account reset error:', err);
      return {
        success: false,
        message: err?.detail || err?.message || 'Failed to reset account on backend.',
      };
    }
  };

  const tickerNotice = isLiveConnected
    ? 'FastAPI Backend Connected • Live Yahoo Finance Data (NSE/BSE, 15m Delayed)'
    : 'DEMO MODE: Simulated Sandbox Baseline (Backend Disconnected or Fallback)';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navbar with Real Search Modal Trigger */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={(sym) => handleSelectSymbol(sym)}
        cashBalance={paperAccount.cashBalance}
        onOpenSearch={() => setIsSearchOpen(true)}
        currentUser={currentUser}
        accounts={userAccounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenAddAccount={() => setIsAddAccountModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Real-time Market Indices Ticker Bar */}
      <MarketTicker indices={SAMPLE_INDICES} dataSourceNotice={tickerNotice} />

      {/* Error / Offline Mode Notification Banner if applicable */}
      {apiError && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-300 flex items-center justify-between">
          <div className="max-w-7xl mx-auto flex items-center gap-2 w-full">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="truncate">{apiError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRetry}
              className="text-amber-300 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => setApiError(null)}
              className="text-amber-400 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay Bar when switching symbols */}
      {isLoading && (
        <div className="bg-blue-600/15 border-b border-blue-500/30 px-4 py-1 text-xs text-blue-300 flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Fetching latest quantitative market data for {selectedSymbol}...</span>
        </div>
      )}

      {/* Main Page Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'overview' && (
          <OverviewPage
            quote={currentQuote}
            candles={currentCandles}
            signal={currentSignal}
            indices={SAMPLE_INDICES}
            watchlist={watchlist}
            allStocks={allStocksRegistry}
            onSelectSymbol={(sym) => handleSelectSymbol(sym)}
            onToggleWatchlist={handleToggleWatchlist}
            onNavigateTab={setActiveTab}
            isLoading={isLoading}
            isSignalLoading={isSignalLoading}
            error={apiError}
            onRetry={handleRetry}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
        )}

        {activeTab === 'analysis' && (
          <AnalysisPage
            quote={currentQuote}
            candles={currentCandles}
            indicators={currentIndicators}
            signal={currentSignal}
            isLoading={isLoading}
            isSignalLoading={isSignalLoading}
            error={apiError}
            onRetry={handleRetry}
          />
        )}

        {activeTab === 'ai' && (
          <AIAnalystPage
            quote={currentQuote}
            indicators={currentIndicators}
            report={currentAIReport}
            geminiModel={settings.geminiModel}
            isApiKeySet={settings.geminiApiKeyConfigured}
            activeBacktestId={activeBacktestId}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestPage
            initialResult={SAMPLE_BACKTEST_RESULT}
            selectedSymbol={selectedSymbol}
            onSymbolChange={(sym) => handleSelectSymbol(sym)}
            availableSymbols={Object.keys(allStocksRegistry)}
            onBacktestSuccess={(id) => setActiveBacktestId(id)}
            onNavigateToDoctor={() => setActiveTab('doctor')}
          />
        )}

        {activeTab === 'doctor' && (
          <StrategyDoctorPage
            quote={currentQuote}
            onSelectSymbol={(sym) => handleSelectSymbol(sym)}
          />
        )}

        {activeTab === 'paper' && (
          <PaperTradingPage
            account={paperAccount}
            positions={paperPositions}
            orders={paperOrders}
            allStocks={allStocksRegistry}
            selectedSymbol={selectedSymbol}
            currentSignal={currentSignal}
            isLoading={isPaperLoading}
            onSymbolChange={(sym) => handleSelectSymbol(sym)}
            onPlaceOrder={handlePlaceOrder}
            onResetAccount={handleResetAccount}
            onRefresh={refreshPaperData}
          />
        )}

        {activeTab === 'hft' && <HFTResearchPage />}

        {activeTab === 'settings' && (
          <SettingsPage settings={settings} onSaveSettings={setSettings} />
        )}
      </main>

      {/* Interactive Stock Search Modal */}
      <StockSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSymbol={(sym, name) => handleSelectSymbol(sym, name)}
        currentSymbol={selectedSymbol}
      />

      {/* User Login & Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Add New Trading Portfolio Modal */}
      <AddAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        onSuccess={handleAddAccountSuccess}
      />

      {/* Mandatory Statutory Risk Footer */}
      <footer className="mt-12 border-t border-slate-900 bg-slate-950 py-6 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500/80 shrink-0" />
            <p className="leading-tight">
              <strong>Statutory Disclosure:</strong> For simulated educational and quantitative research purposes only. Not registered with SEBI as an investment advisor. Real-money trading is strictly disabled.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] shrink-0">
            <span>MarketIQ v1.0.0 (Stage 3 Live Connected)</span>
            <span>•</span>
            <span className="text-slate-400">
              {isLiveConnected ? 'Live NSE / BSE Feed' : 'DEMO MODE Active'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
