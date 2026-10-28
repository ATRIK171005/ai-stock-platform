import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStoredAuthToken,
  setStoredAuthToken,
  getStoredAccountId,
  setStoredAccountId,
  registerUser,
  loginUser,
  loginDemoUser,
  fetchCurrentUser,
  fetchUserAccounts,
  createNewAccount,
  logoutUserSession,
} from '../services/api';

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
};

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('Auth & Multi-Account Client Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorageMock.clear();
  });

  it('stores and retrieves auth token and account ID properly', () => {
    expect(getStoredAuthToken()).toBeNull();
    expect(getStoredAccountId()).toBe('default_account');

    setStoredAuthToken('test-token-123');
    expect(getStoredAuthToken()).toBe('test-token-123');

    setStoredAccountId('acc-portfolio-999');
    expect(getStoredAccountId()).toBe('acc-portfolio-999');

    logoutUserSession();
    expect(getStoredAuthToken()).toBeNull();
    expect(getStoredAccountId()).toBe('default_account');
  });

  it('loginUser posts credentials and persists token & active account', async () => {
    const mockAuthResponse = {
      access_token: 'auth-jwt-token-abc',
      token_type: 'bearer',
      user: {
        id: 'u1',
        email: 'trader@market.in',
        username: 'trader',
        full_name: 'Trader Alpha',
        created_at: '2026-10-28T00:00:00Z',
      },
      accounts: [
        {
          id: 'acc1',
          name: 'Primary Portfolio',
          user_id: 'u1',
          initial_balance: 100000,
          cash_balance: 100000,
          total_equity: 100000,
          realized_pnl: 0,
          open_positions_count: 0,
          currency: 'INR',
          created_at: '2026-10-28T00:00:00Z',
        },
      ],
      active_account_id: 'acc1',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuthResponse,
    } as Response);

    const res = await loginUser({
      username_or_email: 'trader',
      password: 'StrongPassword123',
    });

    expect(res.access_token).toBe('auth-jwt-token-abc');
    expect(getStoredAuthToken()).toBe('auth-jwt-token-abc');
    expect(getStoredAccountId()).toBe('acc1');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username_or_email: 'trader',
          password: 'StrongPassword123',
        }),
      })
    );
  });

  it('loginDemoUser invokes /api/auth/demo and sets session', async () => {
    const mockDemoResponse = {
      access_token: 'demo-token-xyz',
      token_type: 'bearer',
      user: {
        id: 'demo-user-id',
        email: 'demo@marketiq.in',
        username: 'demotrader',
        full_name: 'Demo Quant Trader',
        created_at: '2026-10-28T00:00:00Z',
      },
      accounts: [],
      active_account_id: 'demo_portfolio_id',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockDemoResponse,
    } as Response);

    const res = await loginDemoUser();
    expect(res.user.username).toBe('demotrader');
    expect(getStoredAuthToken()).toBe('demo-token-xyz');
    expect(getStoredAccountId()).toBe('demo_portfolio_id');
  });

  it('registerUser sends registration payload and sets session', async () => {
    const mockRegisterResponse = {
      access_token: 'reg-token-456',
      token_type: 'bearer',
      user: {
        id: 'u2',
        email: 'newbie@marketiq.in',
        username: 'newbie',
        full_name: 'Newbie Quant',
        created_at: '2026-10-28T00:00:00Z',
      },
      accounts: [],
      active_account_id: 'acc2',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockRegisterResponse,
    } as Response);

    const res = await registerUser({
      email: 'newbie@marketiq.in',
      username: 'newbie',
      password: 'SafePassword123',
      full_name: 'Newbie Quant',
    });

    expect(res.access_token).toBe('reg-token-456');
    expect(getStoredAuthToken()).toBe('reg-token-456');
    expect(getStoredAccountId()).toBe('acc2');
  });

  it('fetchCurrentUser returns null if no token is saved', async () => {
    const res = await fetchCurrentUser();
    expect(res).toBeNull();
  });

  it('fetchCurrentUser queries /api/auth/me when token exists', async () => {
    setStoredAuthToken('existing-token');
    const mockSession = {
      access_token: 'existing-token',
      token_type: 'bearer',
      user: {
        id: 'u1',
        email: 'user@market.in',
        username: 'user1',
        full_name: 'User One',
        created_at: '2026-10-28T00:00:00Z',
      },
      accounts: [],
      active_account_id: 'acc1',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSession,
    } as Response);

    const res = await fetchCurrentUser();
    expect(res).not.toBeNull();
    expect(res?.user.username).toBe('user1');
  });

  it('createNewAccount posts to /api/paper/accounts and saves new account ID', async () => {
    const mockNewAccount = {
      id: 'acc-new-777',
      name: 'High Beta Growth',
      user_id: 'u1',
      initial_balance: 500000,
      cash_balance: 500000,
      invested_value: 0,
      total_equity: 500000,
      realized_pnl: 0,
      unrealized_pnl: 0,
      total_pnl: 0,
      total_return_percent: 0,
      daily_pnl: 0,
      currency: 'INR' as const,
      max_position_size_percent: 25,
      daily_loss_limit: 10000,
      max_order_value: 200000,
      open_positions_count: 0,
      total_fees_paid: 0,
      last_updated: '2026-10-28T00:00:00Z',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNewAccount,
    } as Response);

    const res = await createNewAccount({
      name: 'High Beta Growth',
      initial_balance: 500000,
      currency: 'INR',
    });

    expect(res.id).toBe('acc-new-777');
    expect(getStoredAccountId()).toBe('acc-new-777');
  });

  it('fetchUserAccounts returns array of accounts', async () => {
    const mockAccounts = [
      {
        id: 'acc-1',
        name: 'Alpha Strategy',
        user_id: 'u1',
        initial_balance: 100000,
        cash_balance: 100000,
        total_equity: 100000,
        realized_pnl: 0,
        open_positions_count: 0,
        currency: 'INR',
        created_at: '2026-10-28T00:00:00Z',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockAccounts,
    } as Response);

    const res = await fetchUserAccounts();
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Alpha Strategy');
  });
});
