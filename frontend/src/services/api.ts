import type {
  OHLCVCandle,
  TechnicalIndicators,
  TradingSignal,
  StockQuote,
  BacktestResult,
  BacktestParams,
  BacktestTrade,
  AIAnalyzeRequest,
  AIAnalyzeResponse,
  AIHealthStatus,
  PaperAccount,
  PaperPosition,
  PaperOrder,
  StrategyDoctorRequest,
  StrategyDoctorResponse,
  RiskProfile,
  PreTradeAssessmentRequest,
  PreTradeAssessmentResponse,
  UserAccountItem,
  AuthSessionResponse,
  CreateAccountPayload,
} from '../types';

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('marketiq_auth_token');
};

export const setStoredAuthToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('marketiq_auth_token', token);
  } else {
    localStorage.removeItem('marketiq_auth_token');
  }
};

export const getStoredAccountId = (): string => {
  if (typeof window === 'undefined') return 'default_account';
  return localStorage.getItem('marketiq_active_account_id') || 'default_account';
};

export const setStoredAccountId = (accountId: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('marketiq_active_account_id', accountId);
};

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // In any browser context, use relative '' so all requests are same-origin /api/...
    // - On Vite dev server: Vite's proxy forwards /api to http://127.0.0.1:8000
    // - On Cloudflare tunnel: tunnel routes /api through Vite proxy to backend
    // - In production/Docker: Nginx routes /api to backend:8000
    // This completely eliminates CORS preflight errors, Private Network Access blocks,
    // and HTTPS mixed content failures.
    const configuredUrl = import.meta.env.VITE_API_BASE_URL;
    if (configuredUrl && configuredUrl.startsWith('https://')) {
      return configuredUrl;
    }
    return '';
  }

  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredUrl) {
    return configuredUrl;
  }
  return 'http://127.0.0.1:8000';
};

export const API_BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  status: number;
  errorCode?: string;
  detail: string;

  constructor(status: number, detail: string, errorCode?: string) {
    super(`API Error ${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.errorCode = errorCode;
  }
}

export interface BackendHistoryResponse {
  symbol: string;
  exchange: string;
  source: string;
  interval: string;
  period: string;
  last_updated: string;
  is_delayed: boolean;
  total_candles: number;
  candles: OHLCVCandle[];
}

export interface IndicatorValuesPayload {
  sma20: number | null;
  sma50: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd_line: number | null;
  signal_line: number | null;
  macd_histogram: number | null;
  atr14: number | null;
}

export interface BackendIndicatorsResponse {
  symbol: string;
  source: string;
  interval: string;
  period: string;
  last_updated: string;
  is_delayed: boolean;
  total_candles: number;
  latest_indicators: IndicatorValuesPayload;
  trend_summary: string;
  trend_score: number;
  candles: Array<
    OHLCVCandle & {
      indicators: IndicatorValuesPayload;
    }
  >;
}

export interface BackendSignalResponse {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  strategy: string;
  signal_timestamp: string;
  data_source: string;
  data_timestamp: string;
  indicator_values: Record<string, number | null>;
  reasons: string[];
  risks: string[];
  support_level: number | null;
  resistance_level: number | null;
  disclaimer: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
}

export interface BackendSearchResponse {
  query: string;
  total: number;
  results: StockSearchResult[];
}

export interface HealthStatus {
  status: string;
  version: string;
  environment: string;
  data_provider: string;
  provider_status: string;
  timestamp: string;
}

// In-flight request deduplication map
const inFlightRequests = new Map<string, Promise<any>>();

async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 20000
): Promise<T> {
  const controller = new AbortController();
  const callerSignal = options.signal;

  // Listen to caller abort if provided
  if (callerSignal) {
    if (callerSignal.aborted) {
      throw new ApiError(499, 'Request aborted by caller', 'CLIENT_ABORTED');
    }
    callerSignal.addEventListener('abort', () => controller.abort());
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const token = getStoredAuthToken();
  const accountId = getStoredAccountId();
  const defaultHeaders: Record<string, string> = {};
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }
  if (accountId) {
    defaultHeaders['X-Account-ID'] = accountId;
  }

  const mergedHeaders = {
    ...defaultHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: mergedHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = `Request failed with status ${response.status}`;
      let errorCode: string | undefined;

      try {
        const errJson = await response.json();
        if (errJson.detail) detail = errJson.detail;
        if (errJson.error_code) errorCode = errJson.error_code;
      } catch {
        // Fallback to text or status text
        const text = await response.text().catch(() => '');
        if (text) detail = text.slice(0, 200);
      }

      throw new ApiError(response.status, detail, errorCode);
    }

    return (await response.json()) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      if (callerSignal?.aborted) {
        throw new ApiError(499, 'Request aborted by caller', 'CLIENT_ABORTED');
      }
      throw new ApiError(408, 'Request timed out after 20s', 'REQUEST_TIMEOUT');
    }
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(503, err.message || 'Network connection failed', 'NETWORK_ERROR');
  }
}

export async function checkBackendHealth(signal?: AbortSignal): Promise<HealthStatus | null> {
  try {
    return await fetchWithTimeout<HealthStatus>(`${API_BASE_URL}/api/health`, { method: 'GET', signal }, 4000);
  } catch {
    return null;
  }
}

export async function searchStocks(
  query: string,
  signal?: AbortSignal
): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  const cacheKey = `search:${trimmed}`;

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const data = await fetchWithTimeout<BackendSearchResponse>(
        `${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(trimmed)}`,
        { method: 'GET', signal },
        8000
      );
      return data.results || [];
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export async function fetchStockHistory(
  symbol: string,
  period = '1y',
  interval = '1d',
  signal?: AbortSignal
): Promise<BackendHistoryResponse> {
  const cacheKey = `history:${symbol}:${period}:${interval}`;
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      return await fetchWithTimeout<BackendHistoryResponse>(
        `${API_BASE_URL}/api/stocks/${encodeURIComponent(symbol)}/history?period=${period}&interval=${interval}`,
        { method: 'GET', signal }
      );
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export async function fetchStockIndicators(
  symbol: string,
  period = '1y',
  interval = '1d',
  signal?: AbortSignal
): Promise<BackendIndicatorsResponse> {
  const cacheKey = `indicators:${symbol}:${period}:${interval}`;
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      return await fetchWithTimeout<BackendIndicatorsResponse>(
        `${API_BASE_URL}/api/stocks/${encodeURIComponent(symbol)}/indicators?period=${period}&interval=${interval}`,
        { method: 'GET', signal }
      );
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export async function fetchStockSignal(
  symbol: string,
  period = '1y',
  interval = '1d',
  signal?: AbortSignal
): Promise<BackendSignalResponse> {
  const cacheKey = `signal:${symbol}:${period}:${interval}`;
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      return await fetchWithTimeout<BackendSignalResponse>(
        `${API_BASE_URL}/api/stocks/${encodeURIComponent(symbol)}/signal?period=${period}&interval=${interval}`,
        { method: 'GET', signal }
      );
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export function mapBackendIndicatorsToFrontend(
  backend: BackendIndicatorsResponse
): TechnicalIndicators {
  const latest = backend.latest_indicators;
  let trend: TechnicalIndicators['trend'] = 'NEUTRAL';
  if (backend.trend_summary === 'BULLISH') trend = 'BULLISH';
  else if (backend.trend_summary === 'BEARISH') trend = 'BEARISH';
  else if (backend.trend_summary === 'STRONG_BULLISH') trend = 'STRONG_BULLISH';
  else if (backend.trend_summary === 'STRONG_BEARISH') trend = 'STRONG_BEARISH';

  return {
    sma20: latest.sma20 ?? 0,
    sma50: latest.sma50 ?? 0,
    ema20: latest.ema26 ?? latest.ema12 ?? 0,
    rsi14: latest.rsi14 ?? 50,
    macd: {
      macdLine: latest.macd_line ?? 0,
      signalLine: latest.signal_line ?? 0,
      histogram: latest.macd_histogram ?? 0,
    },
    atr14: latest.atr14 ?? 0,
    trend,
    trendScore: backend.trend_score,
  };
}

export function mapBackendSignalToFrontend(backend: BackendSignalResponse): TradingSignal {
  return {
    symbol: backend.symbol,
    timestamp: backend.signal_timestamp,
    signal: backend.signal,
    confidence: backend.confidence,
    strategy: backend.strategy,
    reasons: backend.reasons,
    risks: backend.risks,
    supportLevel: backend.support_level ?? 0,
    resistanceLevel: backend.resistance_level ?? 0,
    stopLossSuggestion: backend.support_level
      ? Math.round(backend.support_level * 0.985 * 100) / 100
      : undefined,
    targetPriceSuggestion: backend.resistance_level
      ? Math.round(backend.resistance_level * 1.03 * 100) / 100
      : undefined,
    disclaimer: backend.disclaimer,
  };
}

export function buildQuoteFromCandles(
  symbol: string,
  candles: OHLCVCandle[],
  baseQuote?: StockQuote,
  source = 'Yahoo Finance (NSE/BSE)'
): StockQuote {
  if (candles.length === 0) {
    if (baseQuote) return baseQuote;
    return {
      symbol,
      name: symbol.replace('.NS', '').replace('.BO', ''),
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
      dataSource: source,
      isDelayed: true,
    };
  }

  const latest = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : latest;
  const change = Math.round((latest.close - prev.close) * 100) / 100;
  const changePercent = prev.close > 0 ? Math.round((change / prev.close) * 10000) / 100 : 0;

  return {
    symbol,
    name: baseQuote?.name || symbol.replace('.NS', '').replace('.BO', ''),
    exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE',
    sector: baseQuote?.sector || 'Equities',
    price: latest.close,
    change,
    changePercent,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    previousClose: prev.close,
    volume: latest.volume,
    marketCap: baseQuote?.marketCap,
    peRatio: baseQuote?.peRatio,
    week52High: baseQuote?.week52High,
    week52Low: baseQuote?.week52Low,
    lastUpdated: latest.time,
    dataSource: source,
    isDelayed: true,
  };
}

export interface BackendBacktestTrade {
  id: string;
  entry_date: string;
  exit_date: string;
  type: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  gross_pnl: number;
  net_pnl: number;
  costs: number;
  return_pct: number;
  reason: string;
}

export interface BackendEquityPoint {
  date: string;
  portfolio_value: number;
  cash: number;
  holdings_value: number;
  benchmark_value: number;
  drawdown_pct: number;
}

export interface BackendBacktestMetrics {
  net_return: number;
  net_return_pct: number;
  gross_return: number;
  gross_return_pct: number;
  total_costs: number;
  buy_and_hold_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  annualized_volatility_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_winning_trade: number;
  avg_losing_trade: number;
}

export interface BackendBacktestResponse {
  backtest_id: string;
  symbol: string;
  strategy: string;
  initial_capital: number;
  final_capital: number;
  net_return: number;
  net_return_pct: number;
  benchmark_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  win_rate_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  profit_factor: number;
  metrics: BackendBacktestMetrics;
  equity_curve: BackendEquityPoint[];
  trades: BackendBacktestTrade[];
  params: Record<string, any>;
  data_source: string;
  data_timestamp: string;
  disclaimer: string;
}

export function mapBackendBacktestToFrontend(
  backend: BackendBacktestResponse,
  originalParams: BacktestParams
): BacktestResult {
  return {
    id: backend.backtest_id,
    params: {
      ...originalParams,
      symbol: backend.symbol,
      strategy: (backend.strategy as BacktestParams['strategy']) || originalParams.strategy,
      fastPeriod: backend.params?.fast_period ?? originalParams.fastPeriod,
      slowPeriod: backend.params?.slow_period ?? originalParams.slowPeriod,
      initialCapital: backend.initial_capital,
      startDate: backend.params?.start_date ?? originalParams.startDate,
      endDate: backend.params?.end_date ?? originalParams.endDate,
      brokeragePercent: backend.params?.brokerage_pct ?? originalParams.brokeragePercent,
      slippagePercent: backend.params?.slippage_pct ?? originalParams.slippagePercent,
    },
    initialCapital: backend.initial_capital,
    finalCapital: backend.final_capital,
    netReturn: backend.net_return,
    netReturnPercent: backend.net_return_pct,
    benchmarkReturnPercent: backend.benchmark_return_pct,
    maxDrawdownPercent: backend.max_drawdown_pct,
    sharpeRatio: backend.sharpe_ratio,
    winRatePercent: backend.win_rate_pct,
    totalTrades: backend.total_trades,
    winningTrades: backend.winning_trades,
    losingTrades: backend.losing_trades,
    profitFactor: backend.profit_factor,
    equityCurve: (backend.equity_curve || []).map((pt) => ({
      date: pt.date,
      portfolioValue: pt.portfolio_value,
      benchmarkValue: pt.benchmark_value,
      drawdownPercent: pt.drawdown_pct,
    })),
    trades: (backend.trades || []).map((t) => ({
      id: t.id,
      entryDate: t.entry_date,
      exitDate: t.exit_date,
      type: (t.type === 'SELL' ? 'SELL' : 'BUY') as BacktestTrade['type'],
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      quantity: t.quantity,
      netProfit: t.net_pnl,
      returnPercent: t.return_pct,
      reason: t.reason,
    })),
    disclaimer: backend.disclaimer,
  };
}

export async function runBacktest(
  params: BacktestParams,
  signal?: AbortSignal
): Promise<BacktestResult> {
  const payload = {
    symbol: params.symbol,
    strategy: params.strategy,
    fast_period: params.fastPeriod,
    slow_period: params.slowPeriod,
    initial_capital: params.initialCapital,
    start_date: params.startDate || undefined,
    end_date: params.endDate || undefined,
    brokerage_pct: params.brokeragePercent,
    slippage_pct: params.slippagePercent,
  };

  const response = await fetchWithTimeout<BackendBacktestResponse>(
    `${API_BASE_URL}/api/backtests/run`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    },
    20000
  );

  return mapBackendBacktestToFrontend(response, params);
}

export async function fetchBacktestById(
  backtestId: string,
  signal?: AbortSignal
): Promise<BackendBacktestResponse> {
  return await fetchWithTimeout<BackendBacktestResponse>(
    `${API_BASE_URL}/api/backtests/${encodeURIComponent(backtestId)}`,
    { method: 'GET', signal },
    10000
  );
}

export async function checkAIHealth(signal?: AbortSignal): Promise<AIHealthStatus | null> {
  try {
    return await fetchWithTimeout<AIHealthStatus>(
      `${API_BASE_URL}/api/ai/health`,
      { method: 'GET', signal },
      4000
    );
  } catch {
    return null;
  }
}

export async function analyzeStockWithAI(
  req: AIAnalyzeRequest,
  signal?: AbortSignal
): Promise<AIAnalyzeResponse> {
  return await fetchWithTimeout<AIAnalyzeResponse>(
    `${API_BASE_URL}/api/ai/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal,
    },
    25000
  );
}

export interface BackendPaperAccountResponse {
  id?: string;
  name?: string;
  user_id?: string | null;
  initial_balance: number;
  cash_balance: number;
  invested_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_return_percent: number;
  daily_pnl: number;
  currency: 'INR';
  max_position_size_percent: number;
  daily_loss_limit: number;
  max_order_value: number;
  open_positions_count: number;
  total_fees_paid: number;
  last_updated: string;
}

export interface BackendPaperPositionResponse {
  symbol: string;
  name: string;
  quantity: number;
  average_entry_price: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  is_stale_price: boolean;
  price_timestamp: string;
}

export interface BackendPaperOrderResponse {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT';
  quantity: number;
  limit_price: number | null;
  status: 'EXECUTED' | 'REJECTED' | 'PENDING' | 'CANCELLED';
  execution_price: number | null;
  total_value: number;
  fees: number;
  slippage_cost: number;
  rejection_reason: string | null;
  data_source: string;
  data_timestamp: string;
  timestamp: string;
  notes?: string;
}

export function mapBackendPaperAccountToFrontend(b: BackendPaperAccountResponse): PaperAccount {
  return {
    startingBalance: b.initial_balance,
    cashBalance: b.cash_balance,
    investedValue: b.invested_value,
    totalEquity: b.total_equity,
    realizedPnL: b.realized_pnl,
    unrealizedPnL: b.unrealized_pnl,
    totalPnL: b.total_pnl,
    totalReturnPercent: b.total_return_percent,
    dailyPnL: b.daily_pnl,
    maxPositionSizePercent: b.max_position_size_percent,
    dailyLossLimit: b.daily_loss_limit,
    maxOrderValue: b.max_order_value,
    openPositionsCount: b.open_positions_count,
    totalFeesPaid: b.total_fees_paid,
    currency: 'INR',
  };
}

export function mapBackendPaperPositionToFrontend(b: BackendPaperPositionResponse): PaperPosition {
  return {
    symbol: b.symbol,
    name: b.name,
    quantity: b.quantity,
    averageEntryPrice: b.average_entry_price,
    currentPrice: b.current_price,
    currentValue: b.current_value,
    unrealizedPnL: b.unrealized_pnl,
    unrealizedPnLPercent: b.unrealized_pnl_percent,
    isStalePrice: b.is_stale_price,
    priceTimestamp: b.price_timestamp,
  };
}

export function mapBackendPaperOrderToFrontend(b: BackendPaperOrderResponse): PaperOrder {
  return {
    id: b.id,
    timestamp: b.timestamp,
    symbol: b.symbol,
    type: b.side,
    orderType: b.order_type,
    quantity: b.quantity,
    price: b.execution_price ?? b.limit_price ?? 0,
    status: b.status,
    totalValue: b.total_value,
    fees: b.fees,
    slippage: b.slippage_cost,
    rejectionReason: b.rejection_reason ?? undefined,
    dataSource: b.data_source,
    notes: b.notes,
  };
}

export async function fetchPaperAccount(
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<PaperAccount> {
  const data = await fetchWithTimeout<BackendPaperAccountResponse>(
    `${API_BASE_URL}/api/paper/account?account_id=${encodeURIComponent(accountId)}`,
    { method: 'GET', signal },
    8000
  );
  return mapBackendPaperAccountToFrontend(data);
}

export async function fetchPaperPositions(
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<PaperPosition[]> {
  const data = await fetchWithTimeout<BackendPaperPositionResponse[]>(
    `${API_BASE_URL}/api/paper/positions?account_id=${encodeURIComponent(accountId)}`,
    { method: 'GET', signal },
    8000
  );
  return data.map(mapBackendPaperPositionToFrontend);
}

export async function fetchPaperOrders(
  accountId = 'default_account',
  limit = 50,
  signal?: AbortSignal
): Promise<PaperOrder[]> {
  const data = await fetchWithTimeout<BackendPaperOrderResponse[]>(
    `${API_BASE_URL}/api/paper/orders?account_id=${encodeURIComponent(accountId)}&limit=${limit}`,
    { method: 'GET', signal },
    8000
  );
  return data.map(mapBackendPaperOrderToFrontend);
}

export async function submitPaperOrder(
  order: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType?: 'MARKET' | 'LIMIT';
    quantity: number;
    limitPrice?: number;
    stopLossPrice?: number;
    notes?: string;
    idempotencyKey?: string;
  },
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<PaperOrder> {
  const payload = {
    symbol: order.symbol,
    side: order.side,
    order_type: order.orderType || 'MARKET',
    quantity: order.quantity,
    limit_price: order.limitPrice,
    stop_loss_price: order.stopLossPrice,
    notes: order.notes,
    idempotency_key: order.idempotencyKey,
  };

  const data = await fetchWithTimeout<BackendPaperOrderResponse>(
    `${API_BASE_URL}/api/paper/orders?account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    },
    15000
  );
  return mapBackendPaperOrderToFrontend(data);
}

export async function resetPaperAccount(
  confirm = true,
  initialBalance = 100000.0,
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<PaperAccount> {
  const data = await fetchWithTimeout<{ message: string; account: BackendPaperAccountResponse }>(
    `${API_BASE_URL}/api/paper/reset?account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm, initial_balance: initialBalance }),
      signal,
    },
    10000
  );
  return mapBackendPaperAccountToFrontend(data.account);
}

// ==========================================
// Strategy Doctor APIs
// ==========================================

export async function runStrategyDoctorAnalysis(
  req: StrategyDoctorRequest,
  signal?: AbortSignal
): Promise<StrategyDoctorResponse> {
  return await fetchWithTimeout<StrategyDoctorResponse>(
    `${API_BASE_URL}/api/strategy-doctor/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal,
    },
    25000
  );
}

export async function fetchStrategyDoctorReport(
  analysisId: string,
  signal?: AbortSignal
): Promise<StrategyDoctorResponse> {
  return await fetchWithTimeout<StrategyDoctorResponse>(
    `${API_BASE_URL}/api/strategy-doctor/${encodeURIComponent(analysisId)}`,
    {
      method: 'GET',
      signal,
    },
    15000
  );
}

export async function explainStrategyDoctorReport(
  analysisId: string,
  signal?: AbortSignal
): Promise<StrategyDoctorResponse> {
  return await fetchWithTimeout<StrategyDoctorResponse>(
    `${API_BASE_URL}/api/strategy-doctor/${encodeURIComponent(analysisId)}/explain`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
    },
    25000
  );
}

// ==========================================
// Personal Risk Guardian APIs
// ==========================================

export async function fetchRiskProfile(
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<RiskProfile> {
  return await fetchWithTimeout<RiskProfile>(
    `${API_BASE_URL}/api/risk/profile?account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'GET',
      signal,
    },
    10000
  );
}

export async function updateRiskProfile(
  profile: Partial<RiskProfile>,
  accountId = 'default_account',
  signal?: AbortSignal
): Promise<RiskProfile> {
  return await fetchWithTimeout<RiskProfile>(
    `${API_BASE_URL}/api/risk/profile?account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
      signal,
    },
    10000
  );
}

export async function assessPreTradeRisk(
  req: PreTradeAssessmentRequest,
  signal?: AbortSignal
): Promise<PreTradeAssessmentResponse> {
  return await fetchWithTimeout<PreTradeAssessmentResponse>(
    `${API_BASE_URL}/api/risk/assess-order`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal,
    },
    15000
  );
}

// ==========================================
// HFT Simulation & Microstructure APIs
// ==========================================

export async function fetchHFTHealth(signal?: AbortSignal): Promise<{
  status: string;
  engine: string;
  replay_mode: string;
  datasets_available: number;
  timer_resolution: string;
  disclaimer: string;
}> {
  return await fetchWithTimeout(
    `${API_BASE_URL}/api/hft/health`,
    { method: 'GET', signal },
    8000
  );
}

export async function fetchHFTDatasets(signal?: AbortSignal): Promise<Array<{
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
}>> {
  return await fetchWithTimeout(
    `${API_BASE_URL}/api/hft/datasets`,
    { method: 'GET', signal },
    10000
  );
}

export async function fetchHFTDatasetPreview(
  datasetId: string,
  offset = 0,
  limit = 40,
  signal?: AbortSignal
): Promise<any[]> {
  return await fetchWithTimeout(
    `${API_BASE_URL}/api/hft/datasets/${encodeURIComponent(datasetId)}/preview?offset=${offset}&limit=${limit}`,
    { method: 'GET', signal },
    15000
  );
}

export async function validateHFTDataset(
  datasetId: string,
  signal?: AbortSignal
): Promise<{
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
}> {
  return await fetchWithTimeout(
    `${API_BASE_URL}/api/hft/datasets/${encodeURIComponent(datasetId)}/validate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
    },
    20000
  );
}

export async function runHFTBenchmark(
  datasetId = 'synthetic-stress-100k',
  maxEvents = 2000,
  signal?: AbortSignal
): Promise<{
  dataset_id: string;
  events_processed: number;
  duration_seconds: number;
  throughput_events_per_sec: number;
  median_latency_us: number;
  p95_latency_us: number;
  p99_latency_us: number;
  max_latency_us: number;
  clock_type: string;
}> {
  return await fetchWithTimeout(
    `${API_BASE_URL}/api/hft/benchmark`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, max_events: maxEvents }),
      signal,
    },
    25000
  );
}

// ==========================================
// Authentication & Multi-Account Management
// ==========================================

export async function registerUser(req: {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}): Promise<AuthSessionResponse> {
  const data = await fetchWithTimeout<AuthSessionResponse>(
    `${API_BASE_URL}/api/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    15000
  );
  setStoredAuthToken(data.access_token);
  if (data.active_account_id) {
    setStoredAccountId(data.active_account_id);
  }
  return data;
}

export async function loginUser(req: {
  username_or_email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const data = await fetchWithTimeout<AuthSessionResponse>(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    15000
  );
  setStoredAuthToken(data.access_token);
  if (data.active_account_id) {
    setStoredAccountId(data.active_account_id);
  }
  return data;
}

export async function loginDemoUser(): Promise<AuthSessionResponse> {
  const data = await fetchWithTimeout<AuthSessionResponse>(
    `${API_BASE_URL}/api/auth/demo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    15000
  );
  setStoredAuthToken(data.access_token);
  if (data.active_account_id) {
    setStoredAccountId(data.active_account_id);
  }
  return data;
}

export async function fetchCurrentUser(): Promise<AuthSessionResponse | null> {
  const token = getStoredAuthToken();
  if (!token) return null;
  try {
    return await fetchWithTimeout<AuthSessionResponse>(
      `${API_BASE_URL}/api/auth/me`,
      { method: 'GET' },
      10000
    );
  } catch {
    return null;
  }
}

export async function fetchUserAccounts(): Promise<UserAccountItem[]> {
  return await fetchWithTimeout<UserAccountItem[]>(
    `${API_BASE_URL}/api/paper/accounts`,
    { method: 'GET' },
    10000
  );
}

export async function createNewAccount(req: CreateAccountPayload): Promise<BackendPaperAccountResponse> {
  const data = await fetchWithTimeout<BackendPaperAccountResponse>(
    `${API_BASE_URL}/api/paper/accounts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    15000
  );
  if (data.id) {
    setStoredAccountId(data.id);
  }
  return data;
}

export function logoutUserSession() {
  setStoredAuthToken(null);
  setStoredAccountId('default_account');
}






