import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchPaperAccount,
  fetchPaperPositions,
  fetchPaperOrders,
  submitPaperOrder,
  resetPaperAccount,
  mapBackendPaperAccountToFrontend,
  mapBackendPaperPositionToFrontend,
  mapBackendPaperOrderToFrontend,
  ApiError,
  type BackendPaperAccountResponse,
  type BackendPaperPositionResponse,
  type BackendPaperOrderResponse,
} from '../services/api';

describe('Paper Trading API & Accounting Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockBackendAccount: BackendPaperAccountResponse = {
    initial_balance: 100000.0,
    cash_balance: 75000.0,
    invested_value: 25500.0,
    total_equity: 100500.0,
    realized_pnl: 200.0,
    unrealized_pnl: 300.0,
    total_pnl: 500.0,
    total_return_percent: 0.5,
    daily_pnl: 150.0,
    currency: 'INR',
    max_position_size_percent: 25.0,
    daily_loss_limit: 5000.0,
    max_order_value: 50000.0,
    open_positions_count: 1,
    total_fees_paid: 35.5,
    last_updated: '2026-10-26T14:30:00Z',
  };

  const mockBackendPosition: BackendPaperPositionResponse = {
    symbol: 'RELIANCE.NS',
    name: 'Reliance Industries Ltd',
    quantity: 10,
    average_entry_price: 2500.0,
    current_price: 2550.0,
    current_value: 25500.0,
    unrealized_pnl: 500.0,
    unrealized_pnl_percent: 2.0,
    is_stale_price: false,
    price_timestamp: '2026-10-26T14:30:00Z',
  };

  const mockBackendOrder: BackendPaperOrderResponse = {
    id: 'ord-12345',
    symbol: 'RELIANCE.NS',
    side: 'BUY',
    order_type: 'MARKET',
    quantity: 10,
    limit_price: null,
    status: 'EXECUTED',
    execution_price: 2500.5,
    total_value: 25005.0,
    fees: 12.5,
    slippage_cost: 5.0,
    rejection_reason: null,
    data_source: 'Yahoo Finance (NSE) - Historical/Delayed',
    data_timestamp: '2026-10-26',
    timestamp: '2026-10-26T14:30:00Z',
    notes: 'Test market order',
  };

  it('mapBackendPaperAccountToFrontend correctly maps all financial metrics', () => {
    const account = mapBackendPaperAccountToFrontend(mockBackendAccount);

    expect(account.startingBalance).toBe(100000.0);
    expect(account.cashBalance).toBe(75000.0);
    expect(account.investedValue).toBe(25500.0);
    expect(account.totalEquity).toBe(100500.0);
    expect(account.realizedPnL).toBe(200.0);
    expect(account.unrealizedPnL).toBe(300.0);
    expect(account.totalPnL).toBe(500.0);
    expect(account.totalReturnPercent).toBe(0.5);
    expect(account.dailyLossLimit).toBe(5000.0);
    expect(account.maxPositionSizePercent).toBe(25.0);
    expect(account.maxOrderValue).toBe(50000.0);
    expect(account.openPositionsCount).toBe(1);
    expect(account.currency).toBe('INR');
  });

  it('mapBackendPaperPositionToFrontend maps position fields with mark-to-market accuracy', () => {
    const position = mapBackendPaperPositionToFrontend(mockBackendPosition);

    expect(position.symbol).toBe('RELIANCE.NS');
    expect(position.quantity).toBe(10);
    expect(position.averageEntryPrice).toBe(2500.0);
    expect(position.currentPrice).toBe(2550.0);
    expect(position.currentValue).toBe(25500.0);
    expect(position.unrealizedPnL).toBe(500.0);
    expect(position.unrealizedPnLPercent).toBe(2.0);
    expect(position.isStalePrice).toBe(false);
  });

  it('mapBackendPaperOrderToFrontend maps order audit log fields accurately', () => {
    const order = mapBackendPaperOrderToFrontend(mockBackendOrder);

    expect(order.id).toBe('ord-12345');
    expect(order.symbol).toBe('RELIANCE.NS');
    expect(order.type).toBe('BUY');
    expect(order.orderType).toBe('MARKET');
    expect(order.quantity).toBe(10);
    expect(order.price).toBe(2500.5);
    expect(order.status).toBe('EXECUTED');
    expect(order.totalValue).toBe(25005.0);
    expect(order.fees).toBe(12.5);
    expect(order.slippage).toBe(5.0);
    expect(order.rejectionReason).toBeUndefined();
  });

  it('fetchPaperAccount returns mapped PaperAccount from backend API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockBackendAccount,
    } as Response);

    const account = await fetchPaperAccount('default_account');
    expect(account.totalEquity).toBe(100500.0);
    expect(account.cashBalance).toBe(75000.0);
    expect(account.maxPositionSizePercent).toBe(25.0);
  });

  it('fetchPaperPositions returns list of active positions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [mockBackendPosition],
    } as Response);

    const positions = await fetchPaperPositions('default_account');
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('RELIANCE.NS');
    expect(positions[0].quantity).toBe(10);
  });

  it('fetchPaperOrders returns execution audit log', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [mockBackendOrder],
    } as Response);

    const orders = await fetchPaperOrders('default_account');
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('ord-12345');
    expect(orders[0].status).toBe('EXECUTED');
  });

  it('submitPaperOrder sends correct request payload and returns executed order', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockBackendOrder,
    } as Response);

    const order = await submitPaperOrder({
      symbol: 'RELIANCE.NS',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 10,
      notes: 'Test submission',
    });

    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[0]).toContain('/api/paper/orders');
    const sentBody = JSON.parse(callArgs[1]?.body as string);
    expect(sentBody.symbol).toBe('RELIANCE.NS');
    expect(sentBody.side).toBe('BUY');
    expect(sentBody.order_type).toBe('MARKET');
    expect(sentBody.quantity).toBe(10);
    expect(order.status).toBe('EXECUTED');
  });

  it('submitPaperOrder handles backend risk limit violation (HTTP 400)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: 'Risk limit exceeded: Single position would exceed 25% of total equity',
        error_code: 'RISK_LIMIT_VIOLATION',
      }),
    } as Response);

    await expect(
      submitPaperOrder({
        symbol: 'TCS.NS',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100,
      })
    ).rejects.toThrowError(ApiError);

    // Verify error detail is structured
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: 'Daily loss limit (₹5,000) reached. New BUY orders are halted today.',
        error_code: 'RISK_LIMIT_VIOLATION',
      }),
    } as Response);

    try {
      await submitPaperOrder({
        symbol: 'INFY.NS',
        side: 'BUY',
        quantity: 50,
      });
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.detail).toContain('Daily loss limit');
    }
  });

  it('resetPaperAccount sends confirm payload and restores sandbox balance', async () => {
    const resetResponse = {
      message: 'Account reset successful',
      account: {
        ...mockBackendAccount,
        cash_balance: 100000.0,
        invested_value: 0.0,
        total_equity: 100000.0,
        realized_pnl: 0.0,
        unrealized_pnl: 0.0,
        total_pnl: 0.0,
        total_return_percent: 0.0,
        open_positions_count: 0,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => resetResponse,
    } as Response);

    const restoredAccount = await resetPaperAccount(true, 100000.0);
    expect(fetchSpy).toHaveBeenCalled();
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sentBody.confirm).toBe(true);
    expect(sentBody.initial_balance).toBe(100000.0);
    expect(restoredAccount.cashBalance).toBe(100000.0);
    expect(restoredAccount.totalEquity).toBe(100000.0);
    expect(restoredAccount.openPositionsCount).toBe(0);
  });
});
