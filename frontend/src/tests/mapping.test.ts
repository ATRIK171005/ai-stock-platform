import { describe, it, expect } from 'vitest';
import {
  buildQuoteFromCandles,
  mapBackendIndicatorsToFrontend,
  mapBackendSignalToFrontend,
  type BackendIndicatorsResponse,
  type BackendSignalResponse,
} from '../services/api';
import type { OHLCVCandle, StockQuote } from '../types';

describe('Frontend Data Mapping Tests', () => {
  it('buildQuoteFromCandles calculates change and percentage correctly from chronological candles', () => {
    const candles: OHLCVCandle[] = [
      { time: '2026-10-24', open: 100, high: 105, low: 98, close: 102, volume: 1000 },
      { time: '2026-10-25', open: 102, high: 110, low: 101, close: 108, volume: 1500 },
    ];

    const quote = buildQuoteFromCandles('TCS.NS', candles);

    expect(quote.symbol).toBe('TCS.NS');
    expect(quote.price).toBe(108);
    expect(quote.change).toBe(6); // 108 - 102
    expect(quote.changePercent).toBe(5.88); // (6 / 102) * 100 = 5.88%
    expect(quote.volume).toBe(1500);
    expect(quote.exchange).toBe('NSE');
  });

  it('buildQuoteFromCandles handles BSE suffix', () => {
    const candles: OHLCVCandle[] = [
      { time: '2026-10-25', open: 500, high: 510, low: 495, close: 505, volume: 2000 },
    ];

    const quote = buildQuoteFromCandles('500325.BO', candles);
    expect(quote.exchange).toBe('BSE');
  });

  it('buildQuoteFromCandles returns fallback quote when candle list is empty', () => {
    const baseQuote: StockQuote = {
      symbol: 'INFY.NS',
      name: 'Infosys Ltd',
      exchange: 'NSE',
      sector: 'IT',
      price: 1800,
      change: 10,
      changePercent: 0.5,
      open: 1795,
      high: 1810,
      low: 1790,
      previousClose: 1790,
      volume: 50000,
      lastUpdated: '2026-10-25',
      dataSource: 'Sample',
    };

    const quote = buildQuoteFromCandles('INFY.NS', [], baseQuote);
    expect(quote).toEqual(baseQuote);
  });

  it('mapBackendIndicatorsToFrontend safely handles null warm-up values without crashing', () => {
    const backendPayload: BackendIndicatorsResponse = {
      symbol: 'RELIANCE.NS',
      source: 'Yahoo Finance',
      interval: '1d',
      period: '1mo',
      last_updated: '2026-10-26T00:00:00Z',
      is_delayed: true,
      total_candles: 15,
      latest_indicators: {
        sma20: null, // Warmup
        sma50: null, // Warmup
        ema12: 1210.5,
        ema26: null,
        rsi14: 52.4,
        macd_line: null,
        signal_line: null,
        macd_histogram: null,
        atr14: 25.1,
      },
      trend_summary: 'BULLISH',
      trend_score: 75,
      candles: [],
    };

    const indicators = mapBackendIndicatorsToFrontend(backendPayload);

    expect(indicators.sma20).toBe(0);
    expect(indicators.sma50).toBe(0);
    expect(indicators.rsi14).toBe(52.4);
    expect(indicators.atr14).toBe(25.1);
    expect(indicators.trend).toBe('BULLISH');
    expect(indicators.trendScore).toBe(75);
  });

  it('mapBackendSignalToFrontend formats signal, stops, targets, and non-advisory disclaimer', () => {
    const backendSignal: BackendSignalResponse = {
      symbol: 'TCS.NS',
      signal: 'BUY',
      confidence: 0.82,
      strategy: 'SMA Crossover (20/50)',
      signal_timestamp: '2026-10-26T10:00:00Z',
      data_source: 'Yahoo Finance (NSE)',
      data_timestamp: '2026-10-26',
      indicator_values: { price: 4100, sma20: 4080, sma50: 4020 },
      reasons: ['Golden Cross on daily candle', 'RSI above 50'],
      risks: ['Resistance near 4200'],
      support_level: 4000,
      resistance_level: 4200,
      disclaimer: 'Not SEBI registered investment advice.',
    };

    const frontendSignal = mapBackendSignalToFrontend(backendSignal);

    expect(frontendSignal.signal).toBe('BUY');
    expect(frontendSignal.confidence).toBe(0.82);
    expect(frontendSignal.supportLevel).toBe(4000);
    expect(frontendSignal.resistanceLevel).toBe(4200);
    expect(frontendSignal.stopLossSuggestion).toBe(3940); // 4000 * 0.985
    expect(frontendSignal.targetPriceSuggestion).toBe(4326); // 4200 * 1.03
    expect(frontendSignal.disclaimer).toContain('Not SEBI registered');
  });
});
