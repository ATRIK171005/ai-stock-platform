import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runBacktest,
  fetchBacktestById,
  mapBackendBacktestToFrontend,
  ApiError,
  type BackendBacktestResponse,
} from '../services/api';
import type { BacktestParams } from '../types';

describe('Historical Backtest Service Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleParams: BacktestParams = {
    symbol: 'RELIANCE.NS',
    strategy: 'SMA_CROSSOVER',
    fastPeriod: 20,
    slowPeriod: 50,
    startDate: '2024-01-01',
    endDate: '2026-10-25',
    initialCapital: 100000,
    brokeragePercent: 0.05,
    slippagePercent: 0.02,
  };

  const sampleBackendResponse: BackendBacktestResponse = {
    backtest_id: 'bt_abc123',
    symbol: 'RELIANCE.NS',
    strategy: 'SMA_CROSSOVER',
    initial_capital: 100000.0,
    final_capital: 114500.5,
    net_return: 14500.5,
    net_return_pct: 14.5,
    benchmark_return_pct: 10.2,
    max_drawdown_pct: 6.4,
    sharpe_ratio: 1.45,
    win_rate_pct: 60.0,
    total_trades: 5,
    winning_trades: 3,
    losing_trades: 2,
    profit_factor: 1.85,
    metrics: {
      net_return: 14500.5,
      net_return_pct: 14.5,
      gross_return: 14850.5,
      gross_return_pct: 14.85,
      total_costs: 350.0,
      buy_and_hold_return_pct: 10.2,
      max_drawdown_pct: 6.4,
      sharpe_ratio: 1.45,
      annualized_volatility_pct: 12.3,
      win_rate_pct: 60.0,
      profit_factor: 1.85,
      total_trades: 5,
      winning_trades: 3,
      losing_trades: 2,
      avg_winning_trade: 5500.0,
      avg_losing_trade: 1000.0,
    },
    equity_curve: [
      {
        date: '2024-01-15',
        portfolio_value: 100000.0,
        cash: 100000.0,
        holdings_value: 0.0,
        benchmark_value: 100000.0,
        drawdown_pct: 0.0,
      },
      {
        date: '2024-02-15',
        portfolio_value: 105200.0,
        cash: 5200.0,
        holdings_value: 100000.0,
        benchmark_value: 102100.0,
        drawdown_pct: 0.0,
      },
    ],
    trades: [
      {
        id: 'BT-001',
        entry_date: '2024-01-20',
        exit_date: '2024-02-10',
        type: 'BUY',
        entry_price: 2450.0,
        exit_price: 2600.0,
        quantity: 40,
        gross_pnl: 6000.0,
        net_pnl: 5898.0,
        costs: 102.0,
        return_pct: 6.02,
        reason: 'Entry: SMA Bullish | Exit: SMA Bearish',
      },
    ],
    params: {
      symbol: 'RELIANCE.NS',
      strategy: 'SMA_CROSSOVER',
      fast_period: 20,
      slow_period: 50,
      initial_capital: 100000.0,
      start_date: '2024-01-01',
      end_date: '2026-10-25',
      brokerage_pct: 0.05,
      slippage_pct: 0.02,
    },
    data_source: 'Yahoo Finance (NSE/BSE)',
    data_timestamp: '2026-10-25',
    disclaimer: 'Deterministic backtest disclaimer',
  };

  it('mapBackendBacktestToFrontend correctly formats snake_case payload into BacktestResult', () => {
    const result = mapBackendBacktestToFrontend(sampleBackendResponse, sampleParams);

    expect(result.initialCapital).toBe(100000.0);
    expect(result.finalCapital).toBe(114500.5);
    expect(result.netReturn).toBe(14500.5);
    expect(result.netReturnPercent).toBe(14.5);
    expect(result.benchmarkReturnPercent).toBe(10.2);
    expect(result.maxDrawdownPercent).toBe(6.4);
    expect(result.sharpeRatio).toBe(1.45);
    expect(result.winRatePercent).toBe(60.0);
    expect(result.totalTrades).toBe(5);
    expect(result.winningTrades).toBe(3);
    expect(result.losingTrades).toBe(2);
    expect(result.profitFactor).toBe(1.85);

    // Equity curve mapped correctly
    expect(result.equityCurve.length).toBe(2);
    expect(result.equityCurve[0].portfolioValue).toBe(100000.0);
    expect(result.equityCurve[0].benchmarkValue).toBe(100000.0);
    expect(result.equityCurve[1].drawdownPercent).toBe(0.0);

    // Trades mapped correctly
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].id).toBe('BT-001');
    expect(result.trades[0].entryPrice).toBe(2450.0);
    expect(result.trades[0].exitPrice).toBe(2600.0);
    expect(result.trades[0].netProfit).toBe(5898.0);
    expect(result.trades[0].returnPercent).toBe(6.02);
  });

  it('runBacktest executes POST /api/backtests/run with serialized params', async () => {
    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        json: async () => sampleBackendResponse,
      } as Response;
    });

    const result = await runBacktest(sampleParams);

    expect(capturedUrl).toContain('/api/backtests/run');
    expect(capturedOptions?.method).toBe('POST');

    const sentBody = JSON.parse(capturedOptions?.body as string);
    expect(sentBody.symbol).toBe('RELIANCE.NS');
    expect(sentBody.fast_period).toBe(20);
    expect(sentBody.slow_period).toBe(50);
    expect(sentBody.initial_capital).toBe(100000);
    expect(sentBody.brokerage_pct).toBe(0.05);
    expect(sentBody.slippage_pct).toBe(0.02);

    expect(result.netReturn).toBe(14500.5);
    expect(result.trades.length).toBe(1);
  });

  it('runBacktest surfaces ApiError on backend HTTP 422 validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        detail: 'Fast period must be strictly less than slow period.',
        error_code: 'VALIDATION_ERROR',
      }),
    } as Response);

    await expect(
      runBacktest({
        ...sampleParams,
        fastPeriod: 50,
        slowPeriod: 20,
      })
    ).rejects.toThrow(ApiError);
  });

  it('fetchBacktestById requests /api/backtests/{backtestId} via GET', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => sampleBackendResponse,
      } as Response;
    });

    const result = await fetchBacktestById('bt_abc123');
    expect(capturedUrl).toContain('/api/backtests/bt_abc123');
    expect(result.backtest_id).toBe('bt_abc123');
  });
});
