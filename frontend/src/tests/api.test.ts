import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkBackendHealth,
  searchStocks,
  fetchStockHistory,
  fetchStockIndicators,
  fetchStockSignal,
  ApiError,
} from '../services/api';

describe('Centralized API Client Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checkBackendHealth returns status when server is healthy', async () => {
    const mockHealth = {
      status: 'ok',
      version: '1.0.0',
      environment: 'development',
      data_provider: 'YAHOO_FINANCE',
      provider_status: 'ready',
      timestamp: '2026-10-26T12:00:00Z',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealth,
    } as Response);

    const result = await checkBackendHealth();
    expect(result).toEqual(mockHealth);
  });

  it('checkBackendHealth returns null when server is offline or fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

    const result = await checkBackendHealth();
    expect(result).toBeNull();
  });

  it('searchStocks parses results correctly', async () => {
    const mockSearchResults = {
      query: 'TCS',
      total: 1,
      results: [
        {
          symbol: 'TCS.NS',
          name: 'Tata Consultancy Services Ltd',
          exchange: 'NSE',
          sector: 'Information Technology',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResults,
    } as Response);

    const results = await searchStocks('TCS');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('TCS.NS');
    expect(results[0].exchange).toBe('NSE');
  });

  it('searchStocks handles empty results without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ query: 'NONEXISTENT', total: 0, results: [] }),
    } as Response);

    const results = await searchStocks('NONEXISTENT');
    expect(results).toHaveLength(0);
  });

  it('fetchStockHistory handles HTTP 404 with structured ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        detail: 'No market data found for symbol INVALID.NS',
        error_code: 'DATA_UNAVAILABLE',
      }),
    } as Response);

    await expect(fetchStockHistory('INVALID.NS')).rejects.toThrowError(ApiError);
    try {
      await fetchStockHistory('INVALID.NS');
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.detail).toContain('No market data found');
      expect(err.errorCode).toBe('DATA_UNAVAILABLE');
    }
  });

  it('fetchStockIndicators handles request abort cancellation gracefully', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchStockIndicators('RELIANCE.NS', '1y', '1d', controller.signal)
    ).rejects.toThrowError(ApiError);
  });

  it('fetchStockSignal parses valid response payload', async () => {
    const mockSignal = {
      symbol: 'INFY.NS',
      signal: 'HOLD',
      confidence: 0.6,
      strategy: 'SMA Crossover (20/50)',
      signal_timestamp: '2026-10-26T12:00:00Z',
      data_source: 'Yahoo Finance (NSE)',
      data_timestamp: '2026-10-26',
      indicator_values: { price: 1845.6 },
      reasons: ['Neutral moving average stance'],
      risks: ['Sector rotation'],
      support_level: 1800,
      resistance_level: 1900,
      disclaimer: 'Not SEBI advice.',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSignal,
    } as Response);

    const result = await fetchStockSignal('INFY.NS');
    expect(result.symbol).toBe('INFY.NS');
    expect(result.signal).toBe('HOLD');
    expect(result.confidence).toBe(0.6);
  });

  it('fetchWithTimeout maps HTTP 429 Rate Limit Exceeded with structured ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        detail: 'Rate limit exceeded. Please wait a minute before sending further requests.',
        error_code: 'RATE_LIMIT_EXCEEDED',
      }),
    } as Response);

    await expect(fetchStockHistory('TCS.NS')).rejects.toThrowError(ApiError);
    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          detail: 'Rate limit exceeded. Please wait a minute before sending further requests.',
          error_code: 'RATE_LIMIT_EXCEEDED',
        }),
      } as Response);
      await fetchStockHistory('TCS.NS');
    } catch (err: any) {
      expect(err.status).toBe(429);
      expect(err.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(err.detail).toContain('Rate limit exceeded');
    }
  });

  it('fetchWithTimeout maps HTTP 413 Payload Too Large with structured ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({
        detail: 'Request payload exceeds max limit of 1048576 bytes.',
        error_code: 'PAYLOAD_TOO_LARGE',
      }),
    } as Response);

    try {
      await fetchStockHistory('INFY.NS');
    } catch (err: any) {
      expect(err.status).toBe(413);
      expect(err.errorCode).toBe('PAYLOAD_TOO_LARGE');
    }
  });
});
