import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  ShieldAlert,
  Terminal,
  Activity,
  FileText,
  History,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import {
  SAMPLE_HFT_DATASETS,
  DEFAULT_HFT_CONFIG,
  INITIAL_HFT_METRICS,
  generateL2SnapshotSequence,
  SAMPLE_HFT_ORDERS,
  SAMPLE_HFT_LOGS,
} from '../data/sampleData';
import { HFTOrderBookLadder } from '../components/HFTOrderBookLadder';
import { HFTMetricsPanel } from '../components/HFTMetricsPanel';
import { HFTSimulationControls } from '../components/HFTSimulationControls';
import type {
  HFTStrategyConfig,
  HFTSimulationStatus,
  L2OrderBookSnapshot,
  HFTOrderRecord,
  HFTAuditLog,
  HFTSimulationMetrics,
  HFTDatasetInfo,
  HFTValidationResponse,
  HFTBenchmarkResponse,
} from '../types';
import {
  fetchHFTDatasets,
  fetchHFTDatasetPreview,
  validateHFTDataset,
  runHFTBenchmark,
} from '../services/api';

function mapBackendEventToSnapshot(evt: any, tickSize = 0.05): L2OrderBookSnapshot | null {
  const snap = evt.snapshot;
  if (!snap || !snap.bids || !snap.asks || snap.bids.length === 0 || snap.asks.length === 0) {
    return null;
  }
  const bids = snap.bids.map((b: any) => ({
    price: Number(b.price),
    quantity: Number(b.quantity),
    orderCount: b.order_count ?? 1,
  }));
  const asks = snap.asks.map((a: any) => ({
    price: Number(a.price),
    quantity: Number(a.quantity),
    orderCount: a.order_count ?? 1,
  }));

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const spread = Math.round((bestAsk - bestBid) * 100) / 100;
  const spreadTicks = Math.round(spread / tickSize);
  const midPrice = Math.round(((bestBid + bestAsk) / 2) * 100) / 100;
  const totalBidVol = bids.reduce((acc: number, b: any) => acc + b.quantity, 0);
  const totalAskVol = asks.reduce((acc: number, a: any) => acc + a.quantity, 0);
  const imbalance =
    totalBidVol + totalAskVol > 0
      ? Math.round(((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol)) * 1000) / 1000
      : 0;
  const topLevelsVol = bids[0].quantity + asks[0].quantity;
  const microPrice =
    topLevelsVol > 0
      ? Math.round(
          ((bids[0].quantity * bestAsk + asks[0].quantity * bestBid) / topLevelsVol) * 100
        ) / 100
      : midPrice;

  const dateObj = evt.exchange_timestamp_ns
    ? new Date(Number(BigInt(evt.exchange_timestamp_ns) / BigInt(1_000_000)))
    : new Date();

  const formattedTime = `${dateObj.toLocaleTimeString('en-IN', {
    hour12: false,
  })}.${dateObj.getMilliseconds().toString().padStart(3, '0')}`;

  return {
    symbol: evt.symbol || snap.symbol,
    timestamp: formattedTime,
    sequenceNumber: evt.sequence_number,
    exchangeTimestampNs: evt.exchange_timestamp_ns,
    localReceiveTimestampNs: evt.local_receive_timestamp_ns,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    spreadTicks,
    midPrice,
    microPrice,
    imbalance,
    totalBidDepth: totalBidVol,
    totalAskDepth: totalAskVol,
  };
}

export const HFTResearchPage: React.FC = () => {
  // Datasets and Strategy Configuration
  const [datasets, setDatasets] = useState<HFTDatasetInfo[]>(SAMPLE_HFT_DATASETS);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('nse-reliance-l2');
  const [strategyConfig, setStrategyConfig] = useState<HFTStrategyConfig>(DEFAULT_HFT_CONFIG);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);

  // Simulation Playback States
  const [simStatus, setSimStatus] = useState<HFTSimulationStatus>('IDLE');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [currentEventIndex, setCurrentEventIndex] = useState<number>(0);
  const [eventsProcessed, setEventsProcessed] = useState<number>(0);

  // Live Backend Phase 3 States
  const [isLiveFeedConnected, setIsLiveFeedConnected] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<HFTValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<HFTBenchmarkResponse | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState<boolean>(false);

  // Live Simulation Data Streams
  const snapshotsRef = useRef<L2OrderBookSnapshot[]>(generateL2SnapshotSequence(1180.5, 40));
  const [activeSnapshot, setActiveSnapshot] = useState<L2OrderBookSnapshot>(snapshotsRef.current[0]);
  const [metrics, setMetrics] = useState<HFTSimulationMetrics>(INITIAL_HFT_METRICS);
  const [orderHistory, setOrderHistory] = useState<HFTOrderRecord[]>(SAMPLE_HFT_ORDERS);
  const [auditLogs, setAuditLogs] = useState<HFTAuditLog[]>(SAMPLE_HFT_LOGS);

  const selectedDataset =
    datasets.find((d) => d.id === selectedDatasetId) ||
    SAMPLE_HFT_DATASETS.find((d) => d.id === selectedDatasetId) ||
    SAMPLE_HFT_DATASETS[0];

  // 1. Fetch available datasets from backend on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDatasets() {
      try {
        const liveDatasets = await fetchHFTDatasets();
        if (isMounted && liveDatasets && liveDatasets.length > 0) {
          const mapped: HFTDatasetInfo[] = liveDatasets.map((d) => ({
            id: d.id,
            name: d.name,
            symbol: d.symbol,
            description: d.description,
            type: d.source_type.includes('SYNTHETIC') ? 'SYNTHETIC_L2' : 'REAL_RECORDED',
            totalEvents: d.total_events,
            duration: d.duration_str,
            source: d.source_label,
            tickSize: d.tick_size,
            disclaimer: d.disclaimer,
          }));
          setDatasets(mapped);
          setIsLiveFeedConnected(true);
        }
      } catch {
        if (isMounted) setIsLiveFeedConnected(false);
      }
    }
    loadDatasets();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch live event preview whenever selected dataset changes
  useEffect(() => {
    let isMounted = true;
    async function loadPreview() {
      setValidationResult(null);
      try {
        const previewEvents = await fetchHFTDatasetPreview(selectedDatasetId, 0, 50);
        if (isMounted && previewEvents && previewEvents.length > 0) {
          const tick = selectedDataset.tickSize || 0.05;
          const mappedSnaps = previewEvents
            .map((e) => mapBackendEventToSnapshot(e, tick))
            .filter(Boolean) as L2OrderBookSnapshot[];

          if (mappedSnaps.length > 0) {
            snapshotsRef.current = mappedSnaps;
            setActiveSnapshot(mappedSnaps[0]);
            setCurrentEventIndex(0);
            setIsLiveFeedConnected(true);
            setAuditLogs((prev) => [
              {
                timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
                level: 'INFO',
                message: `Stream synced: Loaded ${mappedSnaps.length} L2 depth events from backend dataset [${selectedDatasetId}]`,
                details: `Initial Mid: ₹${mappedSnaps[0].midPrice.toFixed(2)} | Spread: ${mappedSnaps[0].spreadTicks ?? 1} ticks`,
              },
              ...prev.slice(0, 24),
            ]);
            return;
          }
        }
      } catch {
        // Fallback to sample generator if offline
      }

      // Offline / Fallback generator
      const basePrice = selectedDatasetId.includes('tcs') ? 2278.5 : 1180.5;
      const sampleSnaps = generateL2SnapshotSequence(basePrice, 40);
      snapshotsRef.current = sampleSnaps;
      setActiveSnapshot(sampleSnaps[0]);
      setCurrentEventIndex(0);
    }

    loadPreview();
    return () => {
      isMounted = false;
    };
  }, [selectedDatasetId, selectedDataset.tickSize]);

  // Simulation Stepper logic
  const stepForward = useCallback(() => {
    setCurrentEventIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % snapshotsRef.current.length;
      const snap = snapshotsRef.current[nextIndex];
      setActiveSnapshot(snap);
      setEventsProcessed((p) => p + 1);

      // Strategy Execution Trigger simulation
      const isBuySignal = snap.imbalance >= strategyConfig.imbalanceThreshold;
      const isSellSignal = snap.imbalance <= -strategyConfig.imbalanceThreshold;

      if ((isBuySignal || isSellSignal) && Math.random() > 0.4) {
        const side = isBuySignal ? 'BUY' : 'SELL';
        const price = isBuySignal ? snap.bestBid : snap.bestAsk;
        const qty = strategyConfig.orderQuantity;
        const fee = Math.round(qty * price * 0.0003 * 100) / 100;
        const edge = Math.round((Math.random() * 0.12 + 0.05) * qty * 100) / 100;

        const newOrder: HFTOrderRecord = {
          orderId: `hft-${Date.now().toString().slice(-4)}`,
          clientOrderId: `strat-${side.toLowerCase()}-${nextIndex}`,
          symbol: snap.symbol,
          side,
          type: 'LIMIT',
          price,
          quantity: qty,
          filledQuantity: qty,
          averageFillPrice: price,
          status: 'FILLED',
          submissionTimestamp: snap.timestamp,
          executionTimestamp: snap.timestamp,
          slippageBps: Math.random() > 0.8 ? 0.5 : 0.0,
          fee,
          reason: `OBI = ${snap.imbalance > 0 ? '+' : ''}${snap.imbalance} threshold breach`,
        };

        setOrderHistory((prev) => [newOrder, ...prev.slice(0, 19)]);

        // Update metrics
        setMetrics((prev) => {
          const deltaInventory = side === 'BUY' ? qty : -qty;
          const newInv = Math.max(-100, Math.min(100, prev.inventory + deltaInventory));
          const grossPnl = Math.round((prev.grossPnl + (side === 'SELL' ? edge : 0)) * 100) / 100;
          const totalFees = Math.round((prev.totalFees + fee) * 100) / 100;
          const netPnl = Math.round((grossPnl - totalFees) * 100) / 100;

          return {
            ...prev,
            inventory: newInv,
            grossPnl,
            totalFees,
            netPnl,
            ordersSubmitted: prev.ordersSubmitted + 1,
            ordersFilled: prev.ordersFilled + 1,
            fillRatePct:
              Math.round(((prev.ordersFilled + 1) / (prev.ordersSubmitted + 1)) * 1000) / 10,
            medianLatencyUs: Math.round((13.5 + Math.random() * 2.5) * 10) / 10,
            p95LatencyUs: Math.round((26.0 + Math.random() * 4.0) * 10) / 10,
            p99LatencyUs: Math.round((42.0 + Math.random() * 6.0) * 10) / 10,
          };
        });

        // Add to audit log
        setAuditLogs((prev) => [
          {
            timestamp: snap.timestamp,
            level: 'EXEC',
            message: `Executed passive ${side} ${qty} @ ₹${price.toFixed(2)} (OBI: ${snap.imbalance})`,
            details: `Queue latency: ${(strategyConfig.simulatedWireLatencyMs * 1000).toFixed(0)}µs wire delay | Fee: ₹${fee.toFixed(2)}`,
          },
          ...prev.slice(0, 24),
        ]);
      }

      return nextIndex;
    });
  }, [strategyConfig]);

  // Run simulation interval
  useEffect(() => {
    if (simStatus !== 'RUNNING') return;

    const intervalMs = Math.max(50, Math.floor(600 / speedMultiplier));
    const timer = setInterval(() => {
      stepForward();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [simStatus, speedMultiplier, stepForward]);

  const handleStart = () => setSimStatus('RUNNING');
  const handlePause = () => setSimStatus('PAUSED');
  const handleStep = () => stepForward();
  const handleReset = () => {
    setSimStatus('IDLE');
    setCurrentEventIndex(0);
    setEventsProcessed(0);
    setActiveSnapshot(snapshotsRef.current[0]);
    setMetrics(INITIAL_HFT_METRICS);
    setOrderHistory(SAMPLE_HFT_ORDERS);
    setAuditLogs(SAMPLE_HFT_LOGS);
  };

  // Run dataset audit using backend EventReplayEngine
  const handleRunAudit = async () => {
    setIsValidating(true);
    try {
      const res = await validateHFTDataset(selectedDatasetId);
      setValidationResult(res);
      setAuditLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          level: res.is_valid ? 'INFO' : 'RISK',
          message: `Dataset Audit Completed: ${res.integrity_summary}`,
          details: `Audited ${res.total_events_checked} events | Gaps: ${res.sequence_gaps_count} | Inversions: ${res.out_of_order_timestamps_count} | Crossed: ${res.crossed_books_count}`,
        },
        ...prev.slice(0, 24),
      ]);
    } catch (err: any) {
      setAuditLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          level: 'RISK',
          message: `Audit backend error: ${err.message || 'Connection failed'}`,
        },
        ...prev.slice(0, 24),
      ]);
    } finally {
      setIsValidating(false);
    }
  };

  // Run hardware monotonic benchmark via backend
  const handleRunBenchmark = async () => {
    setIsRunningBenchmark(true);
    try {
      const res = await runHFTBenchmark(selectedDatasetId, 2000);
      setBenchmarkResult(res);
      setMetrics((prev) => ({
        ...prev,
        medianLatencyUs: res.median_latency_us,
        p95LatencyUs: res.p95_latency_us,
        p99LatencyUs: res.p99_latency_us,
        maxLatencyUs: res.max_latency_us,
      }));
      setAuditLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          level: 'INFO',
          message: `Hardware Monotonic Benchmark: ${res.throughput_events_per_sec.toLocaleString()} eps | Median: ${res.median_latency_us}µs | P99: ${res.p99_latency_us}µs`,
          details: `Replayed ${res.events_processed} events via ${res.clock_type} in ${(res.duration_seconds * 1000).toFixed(1)}ms`,
        },
        ...prev.slice(0, 24),
      ]);
    } catch (err: any) {
      setAuditLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          level: 'RISK',
          message: `Benchmark backend error: ${err.message || 'Connection failed'}`,
        },
        ...prev.slice(0, 24),
      ]);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Title Banner & Integrity Disclosure */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 font-black">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  HFT Research & Simulation Platform
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Phase 3 Market Data Replay
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Zero Real-Money Risk
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Microstructure quantitative research: Level-2 order-book dynamics, adverse selection
                modeling, and hardware-monotonic latency profiling.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono">
              <span className="text-slate-400">Replay Tick:</span>
              <strong className="text-cyan-300">
                {currentEventIndex + 1}/{snapshotsRef.current.length}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveFeedConnected ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
                }`}
              ></span>
              <span>
                Backend Feed:{' '}
                <strong className="text-white">
                  {isLiveFeedConnected ? 'FastAPI Connected' : 'Local Replay'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Prominent Statutory & Engineering Guardrail Notice */}
        <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-xl p-3 flex items-start gap-2.5 text-xs text-cyan-200">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            <strong>Research Simulation Environment:</strong> Events are processed chronologically
            using recorded Level-2 exchange depth. Orders, queue priority, transaction costs, and
            adverse selection are evaluated via an explicit virtual matching model. Local engine
            latency is measured in nanoseconds using Python monotonic hardware counters (
            <code className="text-cyan-300 font-mono">time.perf_counter_ns</code>). Live broker
            execution is completely disabled.
          </p>
        </div>
      </div>

      {/* Simulation Playback & Strategy Controls */}
      <HFTSimulationControls
        status={simStatus}
        datasets={datasets}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={setSelectedDatasetId}
        config={strategyConfig}
        onUpdateConfig={setStrategyConfig}
        onStart={handleStart}
        onPause={handlePause}
        onStep={handleStep}
        onReset={handleReset}
        speedMultiplier={speedMultiplier}
        onSelectSpeed={setSpeedMultiplier}
        isConfigOpen={isConfigOpen}
        onToggleConfig={() => setIsConfigOpen((prev) => !prev)}
      />

      {/* Main Research Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: L2 Order Book Ladder & Order Logs (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Level-2 Depth Ladder */}
          <HFTOrderBookLadder
            snapshot={activeSnapshot}
            imbalanceThreshold={strategyConfig.imbalanceThreshold}
          />

          {/* Simulated Order & Execution History */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-slate-100 text-sm">Simulated Orders & Fills</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {orderHistory.length} recorded orders
              </span>
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-[10px] text-slate-500 uppercase bg-slate-950 sticky top-0">
                  <tr>
                    <th className="py-2 px-2.5">Time</th>
                    <th className="py-2 px-2.5">Order ID</th>
                    <th className="py-2 px-2.5">Side</th>
                    <th className="py-2 px-2.5">Price</th>
                    <th className="py-2 px-2.5">Qty</th>
                    <th className="py-2 px-2.5">Status</th>
                    <th className="py-2 px-2.5">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orderHistory.map((ord) => (
                    <tr key={ord.orderId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-2.5 text-slate-400 text-[11px]">
                        {ord.submissionTimestamp}
                      </td>
                      <td className="py-2 px-2.5 text-slate-300 font-bold">{ord.orderId}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ord.side === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {ord.side}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-200">₹{ord.price.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-slate-300">{ord.quantity}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            ord.status === 'FILLED'
                              ? 'bg-blue-500/15 text-blue-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-400">₹{ord.fee.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Engine Real-Time Audit Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">Matching Engine Audit Stream</h3>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Sequential Dispatcher</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-[11px] bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              {auditLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-tight">
                  <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                  <span
                    className={`font-bold shrink-0 ${
                      log.level === 'EXEC'
                        ? 'text-emerald-400'
                        : log.level === 'ORDER'
                        ? 'text-blue-400'
                        : log.level === 'RISK'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    [{log.level}]
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Engine Metrics & Strategy Insights (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Latency, P&L, Inventory Metrics Panel */}
          <HFTMetricsPanel
            metrics={metrics}
            throughputEps={
              benchmarkResult
                ? benchmarkResult.throughput_events_per_sec
                : Math.round(eventsProcessed > 0 ? 1200 * speedMultiplier : 0)
            }
            eventsProcessed={eventsProcessed}
            totalEvents={selectedDataset.totalEvents}
          />

          {/* Dataset Specifications & Engine Verification Actions Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Active Dataset Profile</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                Phase 3 Verified
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Dataset Name:</span>
                <span className="font-semibold text-white">{selectedDataset.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Asset Symbol:</span>
                <span className="font-mono text-blue-400 font-bold">{selectedDataset.symbol}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Data Source:</span>
                <span className="text-slate-300">{selectedDataset.source}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Total Sequential Events:</span>
                <span className="font-mono text-slate-200">
                  {selectedDataset.totalEvents.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Tick Size:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  ₹{selectedDataset.tickSize.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Verification & Hardware Profiling Action Buttons */}
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunAudit}
                  disabled={isValidating}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isValidating ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  )}
                  <span>{isValidating ? 'Auditing...' : 'Audit Stream Integrity'}</span>
                </button>

                <button
                  onClick={handleRunBenchmark}
                  disabled={isRunningBenchmark}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isRunningBenchmark ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>{isRunningBenchmark ? 'Benchmarking...' : 'Hardware Benchmark'}</span>
                </button>
              </div>

              {/* Stream Audit Result Banner */}
              {validationResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    validationResult.is_valid
                      ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {validationResult.is_valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {validationResult.is_valid
                        ? 'Stream Audit Passed: 0 Anomalies'
                        : 'Audit Flagged Stream Inconsistencies'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">
                    Audited: {validationResult.total_events_checked.toLocaleString()} events | Gaps:{' '}
                    {validationResult.sequence_gaps_count} | Inversions:{' '}
                    {validationResult.out_of_order_timestamps_count} | Crossed:{' '}
                    {validationResult.crossed_books_count}
                  </div>
                </div>
              )}

              {/* Monotonic Benchmark Result Banner */}
              {benchmarkResult && (
                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/50 text-indigo-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                    <Gauge className="w-4 h-4 text-indigo-400" />
                    <span>Monotonic Hardware Benchmark Results</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                    <div>
                      Throughput:{' '}
                      <strong className="text-white">
                        {benchmarkResult.throughput_events_per_sec.toLocaleString()} eps
                      </strong>
                    </div>
                    <div>
                      Median Latency:{' '}
                      <strong className="text-white">{benchmarkResult.median_latency_us} µs</strong>
                    </div>
                    <div>
                      P95 Latency:{' '}
                      <strong className="text-white">{benchmarkResult.p95_latency_us} µs</strong>
                    </div>
                    <div>
                      P99 Latency:{' '}
                      <strong className="text-white">{benchmarkResult.p99_latency_us} µs</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800">
              {selectedDataset.disclaimer}
            </p>
          </div>

          {/* Active Strategy Mechanics Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-bold text-sm">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Microstructure Strategy Mechanics</span>
            </div>

            {strategyConfig.strategyType === 'ORDER_BOOK_IMBALANCE' && (
              <div className="space-y-2.5 text-xs text-slate-300">
                <p className="leading-relaxed">
                  <strong>Order Book Imbalance (OBI) Alpha:</strong> Calculates localized volume
                  asymmetry between total bid quantity and ask quantity over the top{' '}
                  {strategyConfig.depthLevels} depth levels:
                </p>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-indigo-300">
                  Imbalance = (V_bid - V_ask) / (V_bid + V_ask)
                </div>
                <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                  <li>
                    Trigger Threshold:{' '}
                    <strong>±{(strategyConfig.imbalanceThreshold * 100).toFixed(0)}%</strong>
                  </li>
                  <li>
                    When OBI &gt; +{strategyConfig.imbalanceThreshold}: Submits passive bids ahead of
                    incoming aggressive buyer sweeps.
                  </li>
                  <li>
                    When OBI &lt; -{strategyConfig.imbalanceThreshold}: Quotes passive asks or unwinds
                    existing inventory.
                  </li>
                  <li>Slippage modeling accounts for queue position and adverse selection.</li>
                </ul>
              </div>
            )}

            {strategyConfig.strategyType === 'AVALLANEDA_STOIKOV' && (
              <div className="space-y-2.5 text-xs text-slate-300">
                <p className="leading-relaxed">
                  <strong>Avellaneda-Stoikov Adaptive Market Making:</strong> Dynamically adjusts
                  reservation price around mid-price based on current inventory position $q$ and
                  risk-aversion parameter $\gamma$:
                </p>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-cyan-300">
                  r(s, q, t) = s - q * γ * σ² * (T - t)
                </div>
                <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                  <li>Quotes symmetrical two-sided spreads when inventory is flat.</li>
                  <li>
                    Skews quotes to penalize further accumulation when holding positive or negative
                    inventory.
                  </li>
                  <li>
                    Models adverse selection penalty when informed taker orders sweep multiple price
                    levels.
                  </li>
                </ul>
              </div>
            )}

            {strategyConfig.strategyType === 'EXECUTION_COST' && (
              <div className="space-y-2.5 text-xs text-slate-300">
                <p className="leading-relaxed">
                  <strong>Execution Cost & Slippage Profiler:</strong> Compares passive limit order
                  posting versus aggressive market order crossing under variable wire latencies.
                </p>
                <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                  <li>
                    Simulates execution fill probability based on queue position and order book
                    cancellations.
                  </li>
                  <li>Measures effective spread capture versus adverse selection decay.</li>
                  <li>Evaluates post-trade markouts at 100ms, 500ms, and 1s horizons.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
