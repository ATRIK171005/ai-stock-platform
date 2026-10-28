// TypeScript type definitions for AI Stock Platform (NSE / BSE)

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap?: string;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
  lastUpdated: string;
  dataSource: string;
  isDelayed?: boolean;
}

export interface OHLCVCandle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  ema20: number;
  rsi14: number;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  atr14: number;
  trend: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  trendScore: number; // 0 to 100
}

export interface TradingSignal {
  symbol: string;
  timestamp: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0 to 1
  strategy: string;
  reasons: string[];
  risks: string[];
  supportLevel: number;
  resistanceLevel: number;
  stopLossSuggestion?: number;
  targetPriceSuggestion?: number;
  disclaimer: string;
}

export interface AIAnalysisReport {
  symbol: string;
  timestamp: string;
  model: string;
  observedFacts: {
    price: number;
    changePercent: number;
    indicators: Record<string, string | number>;
    volumeStatus: string;
  };
  interpretation: {
    marketContext: string;
    technicalOutlook: string;
    momentumAnalysis: string;
  };
  catalystsAndNews: Array<{
    headline: string;
    source: string;
    impact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    summary: string;
  }>;
  keyRisks: string[];
  disclaimer: string;
}

export interface StructuredAIAnalysis {
  summary: string;
  observed_facts: Record<string, any>;
  interpretation: string;
  supporting_evidence: string[];
  key_risks: string[];
  uncertainties: string[];
  news_analysis?: Array<{
    headline: string;
    source: string;
    url?: string;
    timestamp?: string;
    impact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    summary: string;
  }>;
  data_timestamp: string;
  disclaimer: string;
}

export interface AIAnalyzeRequest {
  question: string;
  symbol: string;
  backtest_id?: string;
  conversation_history?: Array<{
    sender: 'user' | 'assistant';
    text: string;
    timestamp?: string;
  }>;
}

export interface AIAnalyzeResponse {
  symbol: string;
  question: string;
  model: string;
  analysis: StructuredAIAnalysis;
  backtest_id?: string;
  cached: boolean;
  timestamp: string;
}

export interface AIHealthStatus {
  status: string;
  configured: boolean;
  model: string;
  provider: string;
}

export interface BacktestParams {
  symbol: string;
  strategy: 'SMA_CROSSOVER' | 'RSI_MEAN_REVERSION' | 'MACD_MOMENTUM';
  fastPeriod: number;
  slowPeriod: number;
  startDate: string;
  endDate: string;
  initialCapital: number;
  brokeragePercent: number; // e.g. 0.05%
  slippagePercent: number;  // e.g. 0.02%
}

export interface BacktestTrade {
  id: string;
  entryDate: string;
  exitDate: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  netProfit: number;
  returnPercent: number;
  reason: string;
}

export interface BacktestResult {
  id?: string;
  params: BacktestParams;
  initialCapital: number;
  finalCapital: number;
  netReturn: number;
  netReturnPercent: number;
  benchmarkReturnPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  winRatePercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  equityCurve: Array<{
    date: string;
    portfolioValue: number;
    benchmarkValue: number;
    drawdownPercent: number;
  }>;
  trades: BacktestTrade[];
  disclaimer: string;
}

export interface PaperAccount {
  startingBalance: number;
  cashBalance: number;
  investedValue?: number;
  totalEquity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL?: number;
  totalReturnPercent?: number;
  dailyPnL: number;
  maxPositionSizePercent: number; // risk rule
  dailyLossLimit: number;         // risk rule
  maxOrderValue?: number;
  totalFeesPaid?: number;
  openPositionsCount?: number;
  currency: 'INR';
}

export interface PaperPosition {
  symbol: string;
  name: string;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  isStalePrice?: boolean;
  priceTimestamp?: string;
}

export interface PaperOrder {
  id: string;
  timestamp: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  price: number;
  status: 'EXECUTED' | 'REJECTED' | 'PENDING' | 'CANCELLED';
  totalValue: number;
  fees: number;
  slippage?: number;
  rejectionReason?: string;
  dataSource?: string;
  notes?: string;
}

export interface AppSettings {
  dataProvider: 'YAHOO_FINANCE' | 'SIMULATED_MOCK';
  exchange: 'NSE' | 'BSE';
  geminiModel: string;
  geminiApiKeyConfigured: boolean;
  maxPositionSizePercent: number;
  dailyLossLimit: number;
  defaultBrokeragePercent: number;
  defaultSlippagePercent: number;
}

// --- User Authentication & Account Management ---
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  full_name: string;
  created_at: string;
}

export interface UserAccountItem {
  id: string;
  name: string;
  user_id: string;
  initial_balance?: number;
  cash_balance: number;
  total_equity: number;
  realized_pnl: number;
  open_positions_count?: number;
  currency: string;
  created_at: string;
}

export interface AuthSessionResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
  active_account_id: string;
  accounts: UserAccountItem[];
}

export interface CreateAccountPayload {
  name: string;
  initial_balance: number;
  currency?: string;
}

// --- Strategy Doctor Types ---
export interface StrategyDoctorRequest {
  symbol: string;
  strategy?: string;
  fast_period?: number;
  slow_period?: number;
  start_date?: string;
  end_date?: string;
  initial_capital?: number;
  brokerage_pct?: number;
  slippage_pct?: number;
  train_pct?: number;
  validation_pct?: number;
  test_pct?: number;
  min_test_trades?: number;
  min_test_candles?: number;
}

export interface PeriodMetrics {
  period_name: string;
  start_date: string;
  end_date: string;
  candles_count: number;
  trade_count: number;
  winning_trades: number;
  losing_trades: number;
  net_return: number;
  net_return_pct: number;
  buy_and_hold_return_pct: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  annualized_volatility_pct: number;
  total_costs: number;
}

export interface ParameterSensitivityPoint {
  fast_period: number;
  slow_period: number;
  net_return_pct: number;
  max_drawdown_pct: number;
  trade_count: number;
  win_rate_pct: number;
  is_current_selection: boolean;
  is_profitable: boolean;
}

export interface ParameterSensitivitySummary {
  tested_combinations: number;
  profitable_combinations: number;
  profitable_ratio_pct: number;
  mean_return_pct: number;
  return_std_dev: number;
  min_return_pct: number;
  max_return_pct: number;
  is_fragile: boolean;
  fragility_notes: string;
}

export interface RegimePerformancePoint {
  regime: string;
  description: string;
  candles_count: number;
  trade_count: number;
  win_rate_pct: number;
  net_pnl: number;
  avg_trade_pnl: number;
  sample_status: string;
}

export interface CostStressTestPoint {
  tier: string;
  brokerage_pct: number;
  slippage_pct: number;
  net_return: number;
  net_return_pct: number;
  total_costs: number;
  is_profitable: boolean;
  return_degradation_pct: number;
}

export interface TradeConcentrationMetrics {
  total_trades: number;
  winning_trades: number;
  gross_winning_profit: number;
  top_1_trade_profit: number;
  top_1_share_pct: number;
  top_3_trades_profit: number;
  top_3_share_pct: number;
  is_concentrated: boolean;
  warning?: string | null;
}

export interface RobustnessScoreBreakdown {
  overall_score: number;
  rating: string;
  formula_version: string;
  base_score: number;
  deductions: Record<string, number>;
  deduction_reasons: string[];
  disclaimer: string;
}

export interface StrategyDoctorResponse {
  analysis_id: string;
  symbol: string;
  strategy: string;
  data_source: string;
  initial_capital: number;
  full_period: {
    start_date: string;
    end_date: string;
    total_candles: string;
  };
  train_period: PeriodMetrics;
  validation_period: PeriodMetrics;
  test_period: PeriodMetrics;
  parameter_sensitivity: ParameterSensitivityPoint[];
  sensitivity_summary: ParameterSensitivitySummary;
  regime_analysis: RegimePerformancePoint[];
  cost_stress_test: CostStressTestPoint[];
  trade_concentration: TradeConcentrationMetrics;
  robustness_score: RobustnessScoreBreakdown;
  warnings: string[];
  limitations: string[];
  ai_explanation?: string | null;
  created_at: string;
}

// --- Personal Risk Guardian Types ---
export interface RiskProfile {
  account_id: string;
  max_order_value: number;
  max_position_allocation_pct: number;
  max_open_positions: number;
  max_daily_loss_pct: number;
  max_risk_per_trade_pct: number;
  require_stop_loss: boolean;
  max_portfolio_concentration_pct: number;
  version: number;
  updated_at?: string;
}

export type RiskAssessmentOutcome = 'APPROVED' | 'WARNING' | 'BLOCKED';

export interface PreTradeAssessmentRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  order_type?: 'MARKET' | 'LIMIT';
  limit_price?: number | null;
  stop_loss_price?: number | null;
  account_id?: string;
}

export interface PreTradeAssessmentResponse {
  outcome: RiskAssessmentOutcome;
  summary: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  market_price: number;
  price_timestamp: string;
  is_stale_price: boolean;
  estimated_order_value: number;
  estimated_fees: number;
  estimated_cash_required: number;
  remaining_cash: number;
  current_position_qty: number;
  projected_position_qty: number;
  current_allocation_pct: number;
  projected_allocation_pct: number;
  stop_loss_risk_inr?: number | null;
  stop_loss_risk_pct?: number | null;
  hard_breaches: string[];
  soft_warnings: string[];
  risk_profile_version: number;
  assessment_timestamp: string;
}

// ==========================================
// High-Frequency Trading (HFT) Simulation Types
// ==========================================

export interface L2OrderBookLevel {
  price: number;
  quantity: number;
  orderCount?: number;
  depthTotal?: number;
}

export interface L2OrderBookSnapshot {
  symbol: string;
  timestamp: string;
  sequenceNumber: number;
  exchangeTimestampNs?: number;
  localReceiveTimestampNs?: number;
  bids: L2OrderBookLevel[];
  asks: L2OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadTicks?: number;
  midPrice: number;
  microPrice: number;
  imbalance: number; // -1.0 (heavy ask) to +1.0 (heavy bid)
  totalBidDepth: number;
  totalAskDepth: number;
}

export type HFTMarketEventType = 'SNAPSHOT' | 'BOOK_UPDATE' | 'TRADE';

export interface HFTMarketEvent {
  eventId: string;
  sequenceNumber: number;
  timestamp: string;
  type: HFTMarketEventType;
  symbol: string;
  price?: number;
  quantity?: number;
  side?: 'BUY' | 'SELL';
  bookSnapshot?: L2OrderBookSnapshot;
}

export type HFTStrategyType = 'ORDER_BOOK_IMBALANCE' | 'AVALLANEDA_STOIKOV' | 'EXECUTION_COST';

export interface HFTStrategyConfig {
  strategyType: HFTStrategyType;
  symbol: string;
  depthLevels: number; // Levels of book considered (e.g. 5 or 10)
  imbalanceThreshold: number; // e.g. 0.25 (-1 to +1)
  orderQuantity: number; // Lot size per passive/aggressive order
  maxInventory: number; // Max position cap (e.g. 100 shares)
  targetSpreadTicks: number; // Quoting spread in ticks (e.g. 2 ticks = ₹0.10)
  simulatedWireLatencyMs: number; // Network wire delay assumption (e.g. 0.5 ms)
  enableAdverseSelection: boolean; // Simulate unfavorable fills when book moves
  brokerageFeeBps: number; // Exchange & broker cost (e.g. 0.03%)
  slippageModel: 'ZERO' | 'LINEAR' | 'QUEUE_DEPENDENT';
}

export type HFTSimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

export interface HFTSimulationState {
  status: HFTSimulationStatus;
  eventsProcessed: number;
  currentEventIndex: number;
  totalEvents: number;
  throughputEps: number; // Real local Python events processed per second
  speedMultiplier: number; // 0.5x, 1x, 5x, 10x, 'MAX'
  datasetId: string;
  elapsedMs: number;
}

export interface HFTSimulationMetrics {
  grossPnl: number;
  netPnl: number;
  totalFees: number;
  totalSlippage: number;
  inventory: number;
  maxInventory: number;
  inventoryTurnover: number;
  ordersSubmitted: number;
  ordersFilled: number;
  ordersCancelled: number;
  fillRatePct: number;
  medianLatencyUs: number; // Local engine processing latency
  p95LatencyUs: number;
  p99LatencyUs: number;
  maxLatencyUs: number;
  maxDrawdownPct: number;
  winRatePct: number;
  sharpeRatioEstimate: number;
}

export interface HFTOrderRecord {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price: number;
  quantity: number;
  filledQuantity: number;
  averageFillPrice: number;
  status: 'PENDING' | 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  submissionTimestamp: string;
  executionTimestamp?: string;
  slippageBps: number;
  fee: number;
  reason?: string;
}

export interface HFTAuditLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'EXEC' | 'RISK' | 'ORDER';
  message: string;
  details?: string;
}

export interface HFTDatasetInfo {
  id: string;
  name: string;
  symbol: string;
  description: string;
  type: 'REAL_RECORDED' | 'SYNTHETIC_L2' | 'STRESS_TEST';
  totalEvents: number;
  duration: string;
  source: string;
  tickSize: number;
  disclaimer: string;
}

export interface HFTDatasetMetadataResponse {
  id: string;
  name: string;
  symbol: string;
  description: string;
  source_type: string;
  source_label: string;
  total_events: number;
  duration_str: string;
  tick_size: number;
  start_timestamp_ns: number;
  end_timestamp_ns: number;
  disclaimer: string;
}

export interface HFTValidationResponse {
  dataset_id: string;
  is_valid: boolean;
  total_events_checked: number;
  sequence_gaps_count: number;
  out_of_order_timestamps_count: number;
  duplicate_events_count: number;
  crossed_books_count: number;
  min_timestamp_ns: number;
  max_timestamp_ns: number;
  integrity_summary: string;
  anomalies: string[];
}

export interface HFTBenchmarkResponse {
  dataset_id: string;
  events_processed: number;
  duration_seconds: number;
  throughput_events_per_sec: number;
  median_latency_us: number;
  p95_latency_us: number;
  p99_latency_us: number;
  max_latency_us: number;
  clock_type: string;
}

export interface HFTHealthResponse {
  status: string;
  engine: string;
  replay_mode: string;
  datasets_available: number;
  timer_resolution: string;
  disclaimer: string;
}


