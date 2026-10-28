import React, { useState, useEffect } from 'react';
import type {
  PaperAccount,
  PaperPosition,
  PaperOrder,
  StockQuote,
  TradingSignal,
  RiskProfile,
  PreTradeAssessmentResponse,
} from '../types';
import {
  fetchRiskProfile,
  updateRiskProfile,
  assessPreTradeRisk,
} from '../services/api';
import { MetricCard } from '../components/MetricCard';
import {
  Wallet,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Shield,
  IndianRupee,
  PieChart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  HelpCircle,
  Sliders,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

export interface PaperTradingPageProps {
  account: PaperAccount;
  positions: PaperPosition[];
  orders: PaperOrder[];
  allStocks: Record<string, StockQuote>;
  selectedSymbol: string;
  currentSignal?: TradingSignal | null;
  isLoading?: boolean;
  onSymbolChange: (symbol: string) => void;
  onPlaceOrder: (order: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    quantity: number;
    limitPrice?: number;
    stopLossPrice?: number;
    notes?: string;
  }) => Promise<{ success: boolean; message: string; order?: PaperOrder }>;
  onResetAccount: () => Promise<{ success: boolean; message: string }>;
  onRefresh?: () => void;
}

export const PaperTradingPage: React.FC<PaperTradingPageProps> = ({
  account,
  positions,
  orders,
  allStocks,
  selectedSymbol,
  currentSignal,
  isLoading = false,
  onSymbolChange,
  onPlaceOrder,
  onResetAccount,
  onRefresh,
}) => {
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [execType, setExecType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState<number>(10);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'risk_warning';
    title: string;
    message: string;
  } | null>(null);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  // Personal Risk Guardian States
  const [stopLossPrice, setStopLossPrice] = useState<number | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<PreTradeAssessmentResponse | null>(null);
  const [isAssessingRisk, setIsAssessingRisk] = useState<boolean>(false);
  const [showRiskSettingsModal, setShowRiskSettingsModal] = useState<boolean>(false);
  const [profileFormData, setProfileFormData] = useState<RiskProfile>({
    account_id: 'default_account',
    max_order_value: 50000,
    max_position_allocation_pct: 25,
    max_open_positions: 5,
    max_daily_loss_pct: 5,
    max_risk_per_trade_pct: 2,
    require_stop_loss: false,
    max_portfolio_concentration_pct: 50,
    version: 1,
  });

  // Load user risk profile on mount
  useEffect(() => {
    fetchRiskProfile('default_account')
      .then((p) => {
        setRiskProfile(p);
        setProfileFormData(p);
      })
      .catch((err) => console.warn('Could not fetch risk profile:', err));
  }, []);

  // Evaluate pre-trade risk whenever order parameters change
  useEffect(() => {
    let isCancelled = false;
    const evaluateRisk = async () => {
      setIsAssessingRisk(true);
      try {
        const assessment = await assessPreTradeRisk({
          symbol: selectedSymbol,
          side: orderSide,
          quantity: Math.max(1, quantity),
          order_type: execType,
          limit_price: execType === 'LIMIT' && limitPrice > 0 ? limitPrice : undefined,
          stop_loss_price: stopLossPrice && stopLossPrice > 0 ? stopLossPrice : undefined,
          account_id: 'default_account',
        });
        if (!isCancelled) {
          setRiskAssessment(assessment);
        }
      } catch (err) {
        console.warn('Risk assessment error:', err);
      } finally {
        if (!isCancelled) setIsAssessingRisk(false);
      }
    };
    evaluateRisk();
    return () => {
      isCancelled = true;
    };
  }, [selectedSymbol, orderSide, execType, quantity, limitPrice, stopLossPrice, riskProfile?.version]);

  const handleSaveRiskProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateRiskProfile(profileFormData, 'default_account');
      setRiskProfile(updated);
      setShowRiskSettingsModal(false);
      setFeedback({
        type: 'success',
        title: 'Risk Profile Updated',
        message: `Updated risk guardrails (Profile v${updated.version}) applied immediately.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Risk Profile Update Failed',
        message: err?.message || 'Could not save risk profile updates.',
      });
    }
  };

  // Active stock price and valuation
  const currentStock = allStocks[selectedSymbol] || Object.values(allStocks)[0] || {
    symbol: selectedSymbol,
    name: selectedSymbol,
    price: 1000,
    change: 0,
    changePercent: 0,
  };

  const activePrice = execType === 'MARKET' ? currentStock.price : limitPrice || currentStock.price;
  const baseOrderValue = activePrice * quantity;
  const simulatedBrokerage = baseOrderValue * 0.0005; // 0.05%
  const simulatedSlippage = execType === 'MARKET' ? baseOrderValue * 0.0002 : 0; // 0.02% slippage on market orders
  const estimatedTotalCashRequired =
    orderSide === 'BUY' ? baseOrderValue + simulatedBrokerage + simulatedSlippage : 0;
  const estimatedNetProceeds =
    orderSide === 'SELL' ? baseOrderValue - simulatedBrokerage - simulatedSlippage : 0;

  // Max affordable quantity given current cash and max single order value limit (₹50k)
  const maxOrderValueLimit = account.maxOrderValue || 50000;
  const maxAffordableByCash = currentStock.price > 0 ? Math.floor(account.cashBalance / currentStock.price) : 0;
  const maxAffordableByOrderLimit = currentStock.price > 0 ? Math.floor(maxOrderValueLimit / currentStock.price) : 0;
  const maxAffordableQty = Math.max(0, Math.min(maxAffordableByCash, maxAffordableByOrderLimit));

  // Find owned quantity for selected symbol
  const ownedPosition = positions.find((p) => p.symbol === selectedSymbol);
  const ownedQty = ownedPosition ? ownedPosition.quantity : 0;

  // Position size % calculation for preview
  const positionEquityPercent =
    account.totalEquity > 0
      ? Math.round((baseOrderValue / account.totalEquity) * 10000) / 100
      : 0;

  // Risk metrics calculations
  const dailyLossLimit = account.dailyLossLimit || 5000;
  const todayLossUsed = Math.max(0, -account.dailyPnL);
  const dailyLossRemaining = Math.max(0, dailyLossLimit - todayLossUsed);
  const isDailyLossLimitReached = todayLossUsed >= dailyLossLimit;
  const maxPositionAllocation = (account.totalEquity * (account.maxPositionSizePercent || 25)) / 100;
  const openPositionsCount = positions.length;
  const maxPositionsLimit = 5;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (quantity <= 0) {
      setFeedback({
        type: 'error',
        title: 'Invalid Order Quantity',
        message: 'Order quantity must be an integer strictly greater than zero.',
      });
      return;
    }

    if (execType === 'LIMIT' && (!limitPrice || limitPrice <= 0)) {
      setFeedback({
        type: 'error',
        title: 'Missing Limit Price',
        message: 'Please specify a valid limit price strictly greater than ₹0.00.',
      });
      return;
    }

    // Frontend sanity checks prior to backend submission
    if (orderSide === 'BUY') {
      if (baseOrderValue > account.cashBalance) {
        setFeedback({
          type: 'error',
          title: 'Insufficient Virtual Cash',
          message: `Required: ₹${estimatedTotalCashRequired.toFixed(2)} | Available: ₹${account.cashBalance.toFixed(2)}.`,
        });
        return;
      }
      if (isDailyLossLimitReached) {
        setFeedback({
          type: 'error',
          title: 'Daily Loss Limit Breached',
          message: `Today's realized loss (₹${todayLossUsed.toFixed(2)}) has reached the maximum daily limit (₹${dailyLossLimit.toFixed(2)}). New BUY orders are blocked until midnight UTC.`,
        });
        return;
      }
      if (baseOrderValue > maxOrderValueLimit) {
        setFeedback({
          type: 'error',
          title: 'Max Order Value Exceeded',
          message: `Single order value (₹${baseOrderValue.toFixed(2)}) exceeds risk threshold of ₹${maxOrderValueLimit.toLocaleString('en-IN')}.`,
        });
        return;
      }
    } else {
      if (quantity > ownedQty) {
        setFeedback({
          type: 'error',
          title: 'Insufficient Holdings',
          message: `Cannot sell ${quantity} shares. You currently own ${ownedQty} shares of ${selectedSymbol}.`,
        });
        return;
      }
    }

    if (riskAssessment?.outcome === 'BLOCKED') {
      setFeedback({
        type: 'error',
        title: 'Order Blocked by Personal Risk Guardian',
        message: riskAssessment.hard_breaches.join('; '),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onPlaceOrder({
        symbol: selectedSymbol,
        side: orderSide,
        orderType: execType,
        quantity,
        limitPrice: execType === 'LIMIT' ? limitPrice : undefined,
        stopLossPrice: stopLossPrice && stopLossPrice > 0 ? stopLossPrice : undefined,
        notes: notes || `Manual paper trade (${execType})`,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          title: `${orderSide} Order Executed Successfully`,
          message: res.message,
        });
        setNotes('');
      } else {
        setFeedback({
          type: 'error',
          title: 'Order Rejected by Backend',
          message: res.message,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Execution Error',
        message: err?.detail || err?.message || 'Failed to communicate with paper trading backend.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickClose = async (pos: PaperPosition) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await onPlaceOrder({
        symbol: pos.symbol,
        side: 'SELL',
        orderType: 'MARKET',
        quantity: pos.quantity,
        notes: `Quick liquidation of full position`,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'Position Liquidated',
          message: `Successfully liquidated ${pos.quantity} shares of ${pos.symbol}.`,
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Close Position Failed',
          message: res.message,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Liquidation Error',
        message: err?.detail || err?.message || 'Failed to liquidate position.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    setFeedback(null);
    try {
      const res = await onResetAccount();
      setShowResetModal(false);
      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'Account Reset Completed',
          message: 'Virtual portfolio reset to starting balance of ₹100,000 INR. All positions and trade history wiped.',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Reset Failed',
          message: res.message,
        });
      }
    } catch (err: any) {
      setShowResetModal(false);
      setFeedback({
        type: 'error',
        title: 'Reset Error',
        message: err?.detail || err?.message || 'Failed to reset paper account.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Virtual Paper Trading & Risk Simulator
            </h1>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ₹100,000 Sandbox Capital
            </span>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Strictly Simulated • Zero Real Money
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic order execution with realistic slippage (0.02%), brokerage (0.05%), mark-to-market valuation, and strict backend risk guardrails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
              title="Refresh live account & position prices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          )}

          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-100 border border-rose-500/30 text-xs font-medium transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Account</span>
          </button>
        </div>
      </div>

      {/* Account Performance Metrics (6 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Equity"
          value={`₹${account.totalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={
            account.totalEquity >= account.startingBalance
              ? `+₹${(account.totalEquity - account.startingBalance).toFixed(2)} (${(((account.totalEquity - account.startingBalance) / account.startingBalance) * 100).toFixed(2)}%)`
              : `-₹${(account.startingBalance - account.totalEquity).toFixed(2)} (${(((account.startingBalance - account.totalEquity) / account.startingBalance) * 100).toFixed(2)}%)`
          }
          isPositive={account.totalEquity >= account.startingBalance}
          icon={Wallet}
        />
        <MetricCard
          label="Available Cash"
          value={`₹${account.cashBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`${account.totalEquity > 0 ? ((account.cashBalance / account.totalEquity) * 100).toFixed(1) : 100}% of portfolio`}
          icon={IndianRupee}
        />
        <MetricCard
          label="Invested Value"
          value={`₹${(account.investedValue ?? (account.totalEquity - account.cashBalance)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`${openPositionsCount} active positions`}
          icon={PieChart}
        />
        <MetricCard
          label="Unrealized P&L"
          value={`${account.unrealizedPnL >= 0 ? '+' : ''}₹${account.unrealizedPnL.toFixed(2)}`}
          subValue="Mark-to-market"
          isPositive={account.unrealizedPnL >= 0}
          icon={TrendingUp}
        />
        <MetricCard
          label="Realized P&L"
          value={`${account.realizedPnL >= 0 ? '+' : ''}₹${account.realizedPnL.toFixed(2)}`}
          subValue="Booked gains/losses"
          isPositive={account.realizedPnL >= 0}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Today's Realized Loss"
          value={`₹${todayLossUsed.toFixed(2)}`}
          subValue={`Limit: ₹${dailyLossLimit.toLocaleString('en-IN')}`}
          isPositive={!isDailyLossLimitReached}
          icon={Shield}
        />
      </div>

      {/* Risk Limits Status Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white">Active Risk Guardrails:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-slate-400">Max Order Value:</span>
            <strong className="text-slate-200">₹{maxOrderValueLimit.toLocaleString('en-IN')}</strong>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-slate-400">Max Single Position:</span>
            <strong className="text-slate-200">{account.maxPositionSizePercent || 25}% (₹{maxPositionAllocation.toFixed(0)})</strong>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
            isDailyLossLimitReached
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-slate-800/80 border-slate-700'
          }`}>
            <span className="text-slate-400">Daily Loss Remaining:</span>
            <strong className={isDailyLossLimitReached ? 'text-rose-400' : 'text-emerald-400'}>
              ₹{dailyLossRemaining.toFixed(2)}
            </strong>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-slate-400">Open Positions:</span>
            <strong className={openPositionsCount >= (riskProfile?.max_open_positions || maxPositionsLimit) ? 'text-amber-400' : 'text-slate-200'}>
              {openPositionsCount} / {riskProfile?.max_open_positions || maxPositionsLimit}
            </strong>
          </div>
          {riskProfile?.require_stop_loss && (
            <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30 text-amber-300">
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              <span>Mandatory Stop-Loss ON</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (riskProfile) setProfileFormData(riskProfile);
              setShowRiskSettingsModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer text-xs font-semibold ml-auto"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Risk Limits</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Order Placement & Signal Context (Left 2 cols) + Holdings Overview (Right col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Order Form & Rule-Based Signal Context */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Placement Form Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-base text-white">Place Simulated Order</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submits virtual orders to backend simulator with slippage and brokerage modeling.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">Market Price ({selectedSymbol.replace('.NS', '')})</span>
                <span className="font-bold text-sm text-slate-100">₹{currentStock.price.toFixed(2)}</span>
                <span className={`text-[10px] ml-1.5 font-semibold ${currentStock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {currentStock.change >= 0 ? '+' : ''}{currentStock.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* User Feedback Alert */}
            {feedback && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-in fade-in duration-200 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <strong className="block font-semibold text-white">{feedback.title}</strong>
                  <p className="leading-relaxed text-slate-300">{feedback.message}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitOrder} className="space-y-4">
              {/* Order Side Selector: BUY vs SELL */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrderSide('BUY')}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    orderSide === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>BUY (GO LONG)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderSide('SELL')}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    orderSide === 'SELL'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>SELL (EXIT HOLDING)</span>
                </button>
              </div>

              {/* Stock Selector, Order Mode & Quantity Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Stock Selector */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Select Stock</label>
                  <select
                    value={selectedSymbol}
                    onChange={(e) => {
                      onSymbolChange(e.target.value);
                      if (execType === 'LIMIT') {
                        setLimitPrice(allStocks[e.target.value]?.price || 0);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.keys(allStocks).map((sym) => (
                      <option key={sym} value={sym}>
                        {sym.replace('.NS', '')} (₹{allStocks[sym]?.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Execution Type: Market vs Limit */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Order Type</label>
                  <select
                    value={execType}
                    onChange={(e) => {
                      const val = e.target.value as 'MARKET' | 'LIMIT';
                      setExecType(val);
                      if (val === 'LIMIT' && limitPrice === 0) {
                        setLimitPrice(currentStock.price);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="MARKET">Market Order (Immediate)</option>
                    <option value="LIMIT">Limit Order (Conditional)</option>
                  </select>
                </div>

                {/* Quantity */}
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-300 font-medium">
                    <span>Shares Qty</span>
                    <span className="text-slate-400 text-[11px]">
                      {orderSide === 'BUY' ? `Affordable: ${maxAffordableQty}` : `Owned: ${ownedQty}`}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={orderSide === 'SELL' ? ownedQty || 1 : undefined}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Quick Qty Helper Buttons */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 text-[11px]">Quick Quantity:</span>
                {[5, 10, 25, 50].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(q)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
                  >
                    +{q}
                  </button>
                ))}
                {orderSide === 'BUY' && maxAffordableQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(maxAffordableQty)}
                    className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/30 transition-colors cursor-pointer ml-auto"
                  >
                    Max Buyable ({maxAffordableQty})
                  </button>
                )}
                {orderSide === 'SELL' && ownedQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(ownedQty)}
                    className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium border border-rose-500/30 transition-colors cursor-pointer ml-auto"
                  >
                    Sell All ({ownedQty})
                  </button>
                )}
              </div>

              {/* Conditional Limit Price Field */}
              {execType === 'LIMIT' && (
                <div className="text-xs space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Trigger Limit Price (₹)</label>
                    <span className="text-[11px] text-slate-400">
                      Executes when candle range touches or crosses this price
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    value={limitPrice || currentStock.price}
                    onChange={(e) => setLimitPrice(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Stop-Loss Protection Field */}
              <div className="text-xs space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-slate-300">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Stop-Loss Price Protection (₹)</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    riskProfile?.require_stop_loss
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'text-slate-400'
                  }`}>
                    {riskProfile?.require_stop_loss ? 'MANDATORY (Risk Profile)' : 'Optional'}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  placeholder={orderSide === 'BUY' ? `e.g. ₹${(currentStock.price * 0.95).toFixed(2)}` : 'Optional'}
                  value={stopLossPrice ?? ''}
                  onChange={(e) => setStopLossPrice(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Personal Risk Guardian Pre-Trade Decision Preview */}
              {riskAssessment && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                    riskAssessment.outcome === 'BLOCKED'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : riskAssessment.outcome === 'WARNING'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      {riskAssessment.outcome === 'BLOCKED' ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                      ) : riskAssessment.outcome === 'WARNING' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      <div>
                        <span className="font-bold text-sm tracking-tight text-white block">
                          Personal Risk Guardian: {riskAssessment.outcome}
                        </span>
                        <span className="text-[11px] text-slate-300">{riskAssessment.summary}</span>
                      </div>
                    </div>
                    {isAssessingRisk && <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                  </div>

                  {/* Pre-Trade Metrics Tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Est. Order Value</span>
                      <strong className="text-white font-mono">₹{riskAssessment.estimated_order_value.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Brokerage + Slippage</span>
                      <strong className="text-white font-mono">₹{riskAssessment.estimated_fees.toFixed(2)}</strong>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Post-Order Alloc.</span>
                      <strong className="text-white font-mono">{riskAssessment.projected_allocation_pct.toFixed(1)}% of Equity</strong>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Stop-Loss Risk</span>
                      <strong className="text-white font-mono">
                        {riskAssessment.stop_loss_risk_inr
                          ? `₹${riskAssessment.stop_loss_risk_inr.toFixed(0)} (${riskAssessment.stop_loss_risk_pct?.toFixed(1)}%)`
                          : 'Unprotected'}
                      </strong>
                    </div>
                  </div>

                  {/* Hard Violations */}
                  {riskAssessment.hard_breaches.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-rose-500/20">
                      <span className="text-rose-400 font-bold block text-[11px]">Hard Violations (Blocks Execution):</span>
                      <ul className="space-y-1 text-[11px] text-rose-300">
                        {riskAssessment.hard_breaches.map((b, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Soft Warnings */}
                  {riskAssessment.soft_warnings.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-amber-500/20">
                      <span className="text-amber-400 font-semibold block text-[11px]">Caution Warnings:</span>
                      <ul className="space-y-1 text-[11px] text-amber-300">
                        {riskAssessment.soft_warnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Financial Calculation Breakdown Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Execution Price:</span>
                  <span className="font-semibold text-slate-200">₹{activePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Order Value (Gross):</span>
                  <span className="font-medium text-slate-200">
                    ₹{baseOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Simulated Slippage (0.02%):</span>
                  <span>₹{simulatedSlippage.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Simulated Brokerage (0.05%):</span>
                  <span>₹{simulatedBrokerage.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Portfolio Equity Allocation:</span>
                  <span className={positionEquityPercent > 25 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                    {positionEquityPercent.toFixed(1)}% {positionEquityPercent > 25 ? '(Exceeds 25% max)' : ''}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-slate-100">
                  <span>{orderSide === 'BUY' ? 'Total Cash Required:' : 'Estimated Net Proceeds:'}</span>
                  <span className={orderSide === 'BUY' ? 'text-emerald-400' : 'text-blue-400'}>
                    ₹{orderSide === 'BUY'
                      ? estimatedTotalCashRequired.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                      : estimatedNetProceeds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Optional Notes */}
              <div className="text-xs space-y-1">
                <label className="text-slate-400">Trade Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Dual SMA golden cross trigger, testing mean-reversion"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={128}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || (orderSide === 'BUY' && isDailyLossLimitReached) || riskAssessment?.outcome === 'BLOCKED'}
                className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
                  riskAssessment?.outcome === 'BLOCKED'
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                    : orderSide === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 cursor-pointer'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 cursor-pointer'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Simulated Order...</span>
                  </span>
                ) : riskAssessment?.outcome === 'BLOCKED' ? (
                  <span className="flex items-center justify-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Order Blocked: Correct Risk Violations Above</span>
                  </span>
                ) : (
                  <span>
                    Submit Simulated {orderSide} Order for {quantity} Shares of {selectedSymbol.replace('.NS', '')}
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Rule-Based Signal Context Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                  Rule-Based Signal for {selectedSymbol.replace('.NS', '')}
                </h4>
              </div>
              {currentSignal && (
                <span
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                    currentSignal.signal === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : currentSignal.signal === 'SELL'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {currentSignal.signal} ({(currentSignal.confidence * 100).toFixed(0)}% Confidence)
                </span>
              )}
            </div>

            {currentSignal ? (
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Strategy: <strong className="text-slate-200">{currentSignal.strategy}</strong></span>
                  <span>Timestamp: <strong className="text-slate-300">{currentSignal.timestamp}</strong></span>
                </div>

                {currentSignal.reasons && currentSignal.reasons.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold">Signal Rationales:</span>
                    <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                      {currentSignal.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Support:</span>
                    <strong className="text-emerald-400">₹{currentSignal.supportLevel?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Resistance:</span>
                    <strong className="text-rose-400">₹{currentSignal.resistanceLevel?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Suggested Stop:</span>
                    <strong className="text-slate-200">₹{currentSignal.stopLossSuggestion?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Target Price:</span>
                    <strong className="text-blue-400">₹{currentSignal.targetPriceSuggestion?.toFixed(2) || 'N/A'}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                Analyzing technical indicators to generate rule-based trading signals...
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Risk Safeguards & Execution Model */}
        <div className="space-y-6">
          {/* Risk Management Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 text-xs">
            <div className="flex items-center gap-2 text-white font-bold pb-2 border-b border-slate-800">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Risk Management Guardrails</span>
            </div>

            <div className="space-y-3 text-slate-300 text-[11px]">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Max Single Order:</span>
                <strong className="text-white">₹{maxOrderValueLimit.toLocaleString('en-IN')}</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Max Position Equity:</span>
                <strong className="text-white">{account.maxPositionSizePercent || 25}% (₹{maxPositionAllocation.toFixed(0)})</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Max Daily Loss:</span>
                <strong className="text-rose-400">₹{dailyLossLimit.toLocaleString('en-IN')}</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Max Open Stocks:</span>
                <strong className="text-white">{maxPositionsLimit} concurrent holdings</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Simulated Brokerage:</span>
                <strong className="text-slate-300">0.05% of trade value</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Simulated Slippage:</span>
                <strong className="text-slate-300">0.02% (Market orders)</strong>
              </div>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>Backend Validation</span>
              </div>
              <p className="leading-relaxed">
                Risk rules are verified on the FastAPI server before execution. Orders exceeding parameters are rejected with explicit audit trails.
              </p>
            </div>
          </div>

          {/* Educational Sandbox Transparency */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3 text-xs">
            <div className="flex items-center gap-2 text-white font-bold">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Simulation Specifications</span>
            </div>
            <ul className="space-y-2 text-slate-400 text-[11px] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span><strong>No Real Money:</strong> All capital, balances, and P&L represent virtual educational simulations.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span><strong>Long-Only Model:</strong> Short selling is disabled. Sales require prior ownership of shares.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span><strong>Decimal Arithmetic:</strong> Accurate financial arithmetic prevents floating point drift across accounts.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Open Positions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-white">Active Open Positions</h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {positions.length} holdings
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Mark-to-market prices updated from Yahoo Finance
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No active positions currently held</p>
            <p className="text-slate-500">
              Place a simulated BUY order above to start testing strategies with virtual capital.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Stock Symbol</th>
                  <th className="px-4 py-3">Shares</th>
                  <th className="px-4 py-3">Avg Cost (₹)</th>
                  <th className="px-4 py-3">Current Price (₹)</th>
                  <th className="px-4 py-3">Market Value (₹)</th>
                  <th className="px-4 py-3">Unrealized P&L</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {positions.map((pos) => {
                  const isProfitable = pos.unrealizedPnL >= 0;
                  return (
                    <tr key={pos.symbol} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{pos.symbol.replace('.NS', '')}</span>
                          {pos.isStalePrice && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Delayed/Stale
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] font-normal text-slate-400">{pos.name}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{pos.quantity}</td>
                      <td className="px-4 py-3">₹{pos.averageEntryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 font-semibold text-white">₹{pos.currentPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-200">
                        ₹{pos.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}₹{pos.unrealizedPnL.toFixed(2)} ({isProfitable ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%)
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleQuickClose(pos)}
                          disabled={isSubmitting}
                          className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Close / Liquidate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Simulated Orders History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-white">Simulated Orders Audit Log</h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {orders.length} orders
            </span>
          </div>
          <span className="text-xs text-slate-400">Complete execution & risk audit trail</span>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No simulated orders placed yet. Orders will appear here with slippage, brokerage, and risk checks.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Fill Price</th>
                  <th className="px-4 py-3">Order Value</th>
                  <th className="px-4 py-3">Fees & Slippage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{ord.id}</td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {ord.timestamp?.includes('T') ? ord.timestamp.replace('T', ' ').slice(0, 19) : ord.timestamp}
                    </td>
                    <td className="px-4 py-3 font-bold text-white">{ord.symbol.replace('.NS', '')}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.type === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {ord.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{ord.orderType}</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{ord.quantity}</td>
                    <td className="px-4 py-3">₹{ord.price.toFixed(2)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      ₹{ord.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      ₹{ord.fees.toFixed(2)} {ord.slippage ? `(+₹${ord.slippage.toFixed(2)} slip)` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          ord.status === 'EXECUTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : ord.status === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : ord.status === 'PENDING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[200px] truncate" title={ord.rejectionReason || ord.notes || ''}>
                      {ord.rejectionReason ? (
                        <span className="text-rose-400">{ord.rejectionReason}</span>
                      ) : (
                        ord.notes || '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Reset Account */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Reset Paper Trading Account?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will reset your simulated account balance to the initial <strong>₹100,000 INR</strong> virtual capital. All active holdings will be liquidated, open orders cancelled, and realized profit/loss metrics wiped clean.
            </p>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-[11px] text-rose-300">
              <strong>Warning:</strong> This cannot be undone. All simulated performance history will be reset.
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Confirm Full Reset</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Personal Risk Profile Modal */}
      {showRiskSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-cyan-400">
                <Sliders className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-white">Configure Personal Risk Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskSettingsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRiskProfile} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Max Order Value (₹)</label>
                <input
                  type="number"
                  step="1000"
                  min="1000"
                  value={profileFormData.max_order_value}
                  onChange={(e) =>
                    setProfileFormData({ ...profileFormData, max_order_value: parseFloat(e.target.value) || 1000 })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Max Single Position Allocation (% of Equity)</label>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="100"
                  value={profileFormData.max_position_allocation_pct}
                  onChange={(e) =>
                    setProfileFormData({ ...profileFormData, max_position_allocation_pct: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Max Open Positions</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={profileFormData.max_open_positions}
                    onChange={(e) =>
                      setProfileFormData({ ...profileFormData, max_open_positions: parseInt(e.target.value, 10) || 5 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Max Daily Loss (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={profileFormData.max_daily_loss_pct}
                    onChange={(e) =>
                      setProfileFormData({ ...profileFormData, max_daily_loss_pct: parseFloat(e.target.value) || 5 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Max Stop-Loss Risk Per Trade (% of Equity)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  value={profileFormData.max_risk_per_trade_pct}
                  onChange={(e) =>
                    setProfileFormData({ ...profileFormData, max_risk_per_trade_pct: parseFloat(e.target.value) || 2 })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 block">Require Mandatory Stop-Loss</span>
                  <span className="text-[11px] text-slate-400">Blocks BUY orders submitted without an explicit stop-loss price</span>
                </div>
                <input
                  type="checkbox"
                  checked={profileFormData.require_stop_loss}
                  onChange={(e) => setProfileFormData({ ...profileFormData, require_stop_loss: e.target.checked })}
                  className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed italic">
                Note: These limits are software guardrails enforced atomically on the FastAPI backend. They do not constitute financial advice.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRiskSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 cursor-pointer"
                >
                  Save & Apply Rules
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
