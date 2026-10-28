import { describe, it, expect } from 'vitest';
import {
  SAMPLE_HFT_DATASETS,
  DEFAULT_HFT_CONFIG,
  generateL2SnapshotSequence,
} from '../data/sampleData';

describe('HFT Research Platform & L2 Microstructure Unit Tests', () => {
  it('SAMPLE_HFT_DATASETS provides valid dataset descriptors and disclaimers', () => {
    expect(SAMPLE_HFT_DATASETS.length).toBeGreaterThanOrEqual(2);

    for (const dataset of SAMPLE_HFT_DATASETS) {
      expect(dataset.id).toBeTruthy();
      expect(dataset.name).toBeTruthy();
      expect(dataset.symbol).toBeTruthy();
      expect(['REAL_RECORDED', 'SYNTHETIC_L2', 'STRESS_TEST']).toContain(dataset.type);
      expect(dataset.tickSize).toBeGreaterThan(0);
      expect(dataset.disclaimer).toBeTruthy();
      expect(dataset.totalEvents).toBeGreaterThan(0);
    }
  });

  it('generateL2SnapshotSequence generates valid 10-level L2 depth books', () => {
    const basePrice = 1180.50;
    const snapshots = generateL2SnapshotSequence(basePrice, 10);

    expect(snapshots.length).toBe(10);

    for (const snap of snapshots) {
      // Structure checks
      expect(snap.symbol).toBe('RELIANCE.NS');
      expect(snap.sequenceNumber).toBeGreaterThan(0);
      expect(snap.bids.length).toBe(10);
      expect(snap.asks.length).toBe(10);

      // Best bid and best ask spread
      expect(snap.bestBid).toBeLessThan(snap.bestAsk);
      expect(snap.spread).toBeCloseTo(snap.bestAsk - snap.bestBid, 2);
      expect(snap.midPrice).toBeCloseTo((snap.bestBid + snap.bestAsk) / 2, 2);

      // Microprice must be bounded between best bid and best ask
      expect(snap.microPrice).toBeGreaterThanOrEqual(snap.bestBid);
      expect(snap.microPrice).toBeLessThanOrEqual(snap.bestAsk);

      // Imbalance must be strictly between -1.0 and +1.0
      expect(snap.imbalance).toBeGreaterThanOrEqual(-1.0);
      expect(snap.imbalance).toBeLessThanOrEqual(1.0);

      // Price ordering: bids descending, asks ascending
      for (let i = 1; i < snap.bids.length; i++) {
        expect(snap.bids[i].price).toBeLessThan(snap.bids[i - 1].price);
        expect(snap.asks[i].price).toBeGreaterThan(snap.asks[i - 1].price);
      }

      // Depth totals must match cumulative sum
      const totalBidQty = snap.bids.reduce((acc, b) => acc + b.quantity, 0);
      const totalAskQty = snap.asks.reduce((acc, a) => acc + a.quantity, 0);
      expect(snap.totalBidDepth).toBe(totalBidQty);
      expect(snap.totalAskDepth).toBe(totalAskQty);
    }
  });

  it('DEFAULT_HFT_CONFIG contains strict risk limits and realistic latency', () => {
    expect(DEFAULT_HFT_CONFIG.maxInventory).toBeLessThanOrEqual(500);
    expect(DEFAULT_HFT_CONFIG.simulatedWireLatencyMs).toBeGreaterThan(0);
    expect(DEFAULT_HFT_CONFIG.brokerageFeeBps).toBeGreaterThan(0);
    expect(DEFAULT_HFT_CONFIG.imbalanceThreshold).toBeGreaterThan(0);
    expect(DEFAULT_HFT_CONFIG.imbalanceThreshold).toBeLessThan(1);
  });
});
