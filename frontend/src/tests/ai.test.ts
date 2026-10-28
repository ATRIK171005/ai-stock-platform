import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAIHealth,
  analyzeStockWithAI,
  ApiError,
} from '../services/api';
import type { AIAnalyzeRequest, AIAnalyzeResponse } from '../types';

describe('AI Market Analyst Client Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleRequest: AIAnalyzeRequest = {
    question: 'Explain the current RSI and MACD indicators for TCS.NS.',
    symbol: 'TCS.NS',
    backtest_id: 'bt_12345',
    conversation_history: [
      { sender: 'user', text: 'Hello' },
      { sender: 'assistant', text: 'Welcome to MarketIQ Analyst.' },
    ],
  };

  const sampleResponse: AIAnalyzeResponse = {
    symbol: 'TCS.NS',
    question: 'Explain the current RSI and MACD indicators for TCS.NS.',
    model: 'gemini-2.5-flash',
    analysis: {
      summary: 'TCS is demonstrating constructive upward momentum.',
      observed_facts: {
        price: 4180.5,
        SMA20: 4150.0,
        RSI14: 58.4,
      },
      interpretation: 'The current technical profile reflects steady accumulation.',
      supporting_evidence: ['RSI at 58.4 is above the 50 centerline.'],
      key_risks: ['Resistance near 4250.'],
      uncertainties: ['Data delayed 15 minutes.'],
      data_timestamp: '2026-10-26',
      disclaimer: 'Non-advisory research simulation.',
    },
    backtest_id: 'bt_12345',
    cached: false,
    timestamp: '2026-10-26T15:30:00Z',
  };

  it('checkAIHealth returns health payload when configured', async () => {
    const mockHealth = {
      status: 'ready',
      configured: true,
      model: 'gemini-2.5-flash',
      provider: 'Google Gemini',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealth,
    } as Response);

    const result = await checkAIHealth();
    expect(result).toEqual(mockHealth);
  });

  it('checkAIHealth returns null on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection failed'));
    const result = await checkAIHealth();
    expect(result).toBeNull();
  });

  it('analyzeStockWithAI sends POST /api/ai/analyze with JSON body', async () => {
    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        json: async () => sampleResponse,
      } as Response;
    });

    const result = await analyzeStockWithAI(sampleRequest);

    expect(capturedUrl).toContain('/api/ai/analyze');
    expect(capturedOptions?.method).toBe('POST');

    const sentBody = JSON.parse(capturedOptions?.body as string);
    expect(sentBody.symbol).toBe('TCS.NS');
    expect(sentBody.question).toBe(sampleRequest.question);
    expect(sentBody.backtest_id).toBe('bt_12345');
    expect(sentBody.conversation_history?.length).toBe(2);

    expect(result.analysis.summary).toContain('constructive');
    expect(result.analysis.observed_facts.price).toBe(4180.5);
  });

  it('analyzeStockWithAI surfaces ApiError with AI_KEY_NOT_CONFIGURED on HTTP 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        detail: 'GEMINI_API_KEY is not configured on the backend server.',
        error_code: 'AI_KEY_NOT_CONFIGURED',
      }),
    } as Response);

    await expect(analyzeStockWithAI(sampleRequest)).rejects.toThrow(ApiError);
  });

  it('analyzeStockWithAI surfaces ApiError with AI_RATE_LIMIT on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        detail: 'Gemini rate limit exceeded.',
        error_code: 'AI_RATE_LIMIT',
      }),
    } as Response);

    try {
      await analyzeStockWithAI(sampleRequest);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errorCode).toBe('AI_RATE_LIMIT');
      expect(err.status).toBe(429);
    }
  });

  it('analyzeStockWithAI surfaces ApiError with AI_TIMEOUT on HTTP 504', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: async () => ({
        detail: 'Gemini request timed out.',
        error_code: 'AI_TIMEOUT',
      }),
    } as Response);

    try {
      await analyzeStockWithAI(sampleRequest);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errorCode).toBe('AI_TIMEOUT');
      expect(err.status).toBe(504);
    }
  });
});
