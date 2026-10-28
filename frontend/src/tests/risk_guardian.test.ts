import { describe, it, expect, vi } from 'vitest';
import {
  assessPreTradeRisk,
  fetchRiskProfile,
  updateRiskProfile,
} from '../services/api';

describe('Personal Risk Guardian Frontend Service', () => {
  it('calls pre-trade assessment endpoint and returns structured outcome', async () => {
    const mockAssessment = {
      outcome: 'APPROVED',
      summary: 'Order APPROVED: All configured portfolio risk checks passed safely.',
      symbol: 'RELIANCE.NS',
      side: 'BUY',
      quantity: 10,
      market_price: 1000.0,
      price_timestamp: '2026-10-26',
      data_source: 'Yahoo Finance (NSE)',
      is_stale_price: false,
      estimated_order_value: 10000.0,
      estimated_fees: 7.0,
      estimated_cash_required: 10007.0,
      remaining_cash: 89993.0,
      current_position_qty: 0,
      projected_position_qty: 10,
      current_allocation_pct: 0.0,
      projected_allocation_pct: 10.0,
      stop_loss_risk_inr: 514.0,
      stop_loss_risk_pct: 0.51,
      hard_breaches: [],
      soft_warnings: [],
      risk_profile_version: 1,
      assessment_timestamp: '2026-10-26T12:00:00Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAssessment,
    } as any);

    const res = await assessPreTradeRisk({
      symbol: 'RELIANCE.NS',
      side: 'BUY',
      quantity: 10,
      stop_loss_price: 950.0,
    });

    expect(res.outcome).toBe('APPROVED');
    expect(res.estimated_order_value).toBe(10000.0);
    expect(res.projected_allocation_pct).toBe(10.0);
    expect(res.hard_breaches.length).toBe(0);
  });

  it('fetches and updates user risk profile settings', async () => {
    const mockProfile = {
      account_id: 'default_account',
      max_order_value: 50000.0,
      max_position_allocation_pct: 25.0,
      max_open_positions: 5,
      max_daily_loss_pct: 5.0,
      max_risk_per_trade_pct: 2.0,
      require_stop_loss: true,
      max_portfolio_concentration_pct: 50.0,
      version: 2,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfile,
    } as any);

    const fetched = await fetchRiskProfile('default_account');
    expect(fetched.max_order_value).toBe(50000.0);
    expect(fetched.require_stop_loss).toBe(true);

    const updated = await updateRiskProfile({ max_order_value: 40000.0 }, 'default_account');
    expect(updated.version).toBe(2);
  });
});
