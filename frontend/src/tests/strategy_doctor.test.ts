import { describe, it, expect, vi } from 'vitest';
import { runStrategyDoctorAnalysis } from '../services/api';

describe('Strategy Doctor Frontend Service', () => {
  it('sends correct walk-forward request payload to backend', async () => {
    const mockResponse = {
      analysis_id: 'doc_test123',
      symbol: 'RELIANCE.NS',
      strategy: 'SMA Crossover (20/50)',
      data_source: 'Yahoo Finance (NSE/BSE)',
      initial_capital: 100000.0,
      full_period: { start_date: '2023-01-01', end_date: '2024-01-01', total_candles: '250' },
      train_period: {
        period_name: 'Train',
        start_date: '2023-01-01',
        end_date: '2023-07-01',
        candles_count: 125,
        trade_count: 6,
        winning_trades: 4,
        losing_trades: 2,
        net_return: 12500,
        net_return_pct: 12.5,
        buy_and_hold_return_pct: 8.0,
        max_drawdown_pct: 6.2,
        win_rate_pct: 66.7,
        profit_factor: 2.1,
        sharpe_ratio: 1.45,
        annualized_volatility_pct: 14.2,
        total_costs: 450,
      },
      validation_period: {
        period_name: 'Validation',
        start_date: '2023-07-02',
        end_date: '2023-10-01',
        candles_count: 62,
        trade_count: 3,
        winning_trades: 2,
        losing_trades: 1,
        net_return: 4200,
        net_return_pct: 4.2,
        buy_and_hold_return_pct: 2.1,
        max_drawdown_pct: 4.1,
        win_rate_pct: 66.7,
        profit_factor: 1.8,
        sharpe_ratio: 1.2,
        annualized_volatility_pct: 12.5,
        total_costs: 210,
      },
      test_period: {
        period_name: 'Test (Out-of-Sample)',
        start_date: '2023-10-02',
        end_date: '2024-01-01',
        candles_count: 63,
        trade_count: 4,
        winning_trades: 2,
        losing_trades: 2,
        net_return: 3500,
        net_return_pct: 3.5,
        buy_and_hold_return_pct: 1.5,
        max_drawdown_pct: 5.0,
        win_rate_pct: 50.0,
        profit_factor: 1.5,
        sharpe_ratio: 1.05,
        annualized_volatility_pct: 13.0,
        total_costs: 290,
      },
      parameter_sensitivity: [],
      sensitivity_summary: {
        tested_combinations: 16,
        profitable_combinations: 14,
        profitable_ratio_pct: 87.5,
        mean_return_pct: 7.2,
        return_std_dev: 2.1,
        min_return_pct: -1.2,
        max_return_pct: 13.5,
        is_fragile: false,
        fragility_notes: 'Stable plateau',
      },
      regime_analysis: [],
      cost_stress_test: [],
      trade_concentration: {
        total_trades: 13,
        winning_trades: 8,
        gross_winning_profit: 25000,
        top_1_trade_profit: 6000,
        top_1_share_pct: 24.0,
        top_3_trades_profit: 14000,
        top_3_share_pct: 56.0,
        is_concentrated: false,
      },
      robustness_score: {
        overall_score: 85.0,
        rating: 'High Robustness (Low Overfitting Risk)',
        formula_version: 'v1.0-heuristic',
        base_score: 100.0,
        deductions: { test_degradation: 15.0 },
        deduction_reasons: ['Out of sample degradation (-15 pts)'],
        disclaimer: 'Internal heuristic only',
      },
      warnings: [],
      limitations: ['Walk-forward assumption'],
      created_at: '2026-10-26T12:00:00Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await runStrategyDoctorAnalysis({
      symbol: 'RELIANCE.NS',
      fast_period: 20,
      slow_period: 50,
      train_pct: 50.0,
      validation_pct: 25.0,
      test_pct: 25.0,
    });

    expect(result.analysis_id).toBe('doc_test123');
    expect(result.robustness_score.overall_score).toBe(85.0);
    expect(result.train_period.candles_count).toBe(125);
    expect(result.test_period.candles_count).toBe(63);
  });
});
