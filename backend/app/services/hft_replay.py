"""Deterministic chronological event replay engine for HFT simulation and data auditing.

Enforces:
- Monotonic chronological time ordering.
- Sequence gap and missing event detection.
- Duplicate event tracking.
- Order-book consistency and sanity checks (no crossed/locked books).
- High-precision local event loop duration measurement via time.perf_counter_ns().
"""
from typing import Callable, List, Optional, Set
import time
import logging

from ..schemas.hft import (
    HFTDatasetValidationResult,
    MarketEvent,
    MarketEventType,
)
from .hft_data import MarketEventFeed

logger = logging.getLogger("market_platform.hft_replay")


class EventReplayEngine:
    """Deterministic chronological replay and audit engine."""

    def __init__(self, feed: MarketEventFeed):
        self.feed = feed
        self._subscribers: List[Callable[[MarketEvent], None]] = []

    def subscribe(self, callback: Callable[[MarketEvent], None]) -> None:
        """Registers a deterministic callback invoked on each chronological event."""
        self._subscribers.append(callback)

    def validate_stream_integrity(self) -> HFTDatasetValidationResult:
        """Audits the entire dataset for sequence gaps, timestamp regressions, and duplicates."""
        meta = self.feed.get_metadata()
        total_checked = 0
        sequence_gaps = 0
        out_of_order_ts = 0
        duplicates = 0
        crossed_books = 0
        anomalies: List[str] = []

        seen_ids: Set[str] = set()
        seen_seqs: Set[int] = set()
        last_seq: Optional[int] = None
        last_ts: Optional[int] = None
        min_ts = float("inf")
        max_ts = 0

        for event in self.feed.iter_events():
            total_checked += 1
            ts = event.exchange_timestamp_ns
            seq = event.sequence_number

            min_ts = min(min_ts, ts)
            max_ts = max(max_ts, ts)

            # 1. Duplicate check
            is_dup = False
            if event.event_id in seen_ids or seq in seen_seqs:
                duplicates += 1
                is_dup = True
                if len(anomalies) < 10:
                    anomalies.append(f"Duplicate event detected: ID={event.event_id}, Seq={seq}")
            seen_ids.add(event.event_id)
            seen_seqs.add(seq)

            # 2. Sequence gap check (ignore duplicates)
            if last_seq is not None and not is_dup:
                if seq != last_seq + 1:
                    sequence_gaps += 1
                    if len(anomalies) < 10:
                        anomalies.append(f"Sequence gap: Expected {last_seq + 1}, got {seq}")

            # 3. Monotonic timestamp check (Exchange timestamps must not move backwards)
            if last_ts is not None:
                if ts < last_ts:
                    out_of_order_ts += 1
                    if len(anomalies) < 10:
                        anomalies.append(f"Timestamp inversion at Seq {seq}: {ts} < {last_ts}")

            # 4. Book cross check
            if event.snapshot and event.snapshot.bids and event.snapshot.asks:
                best_bid = event.snapshot.bids[0].price
                best_ask = event.snapshot.asks[0].price
                if best_bid >= best_ask:
                    crossed_books += 1
                    if len(anomalies) < 10:
                        anomalies.append(f"Crossed book at Seq {seq}: Bid {best_bid} >= Ask {best_ask}")

            if not is_dup:
                last_seq = seq
            last_ts = ts

        is_valid = (
            sequence_gaps == 0
            and out_of_order_ts == 0
            and duplicates == 0
            and crossed_books == 0
        )

        summary = (
            f"Integrity verified: {total_checked} events audited with 0 anomalies."
            if is_valid
            else f"Audit flagged anomalies: {sequence_gaps} gaps, {out_of_order_ts} inversions, {duplicates} duplicates, {crossed_books} crossed books."
        )

        return HFTDatasetValidationResult(
            dataset_id=meta.id,
            is_valid=is_valid,
            total_events_checked=total_checked,
            sequence_gaps_count=sequence_gaps,
            out_of_order_timestamps_count=out_of_order_ts,
            duplicate_events_count=duplicates,
            crossed_books_count=crossed_books,
            min_timestamp_ns=int(min_ts if min_ts != float("inf") else 0),
            max_timestamp_ns=max_ts,
            integrity_summary=summary,
            anomalies=anomalies,
        )

    def run_replay(
        self,
        max_events: Optional[int] = None,
        measure_latency: bool = True,
    ) -> dict:
        """Executes chronological replay dispatching events to all registered subscribers."""
        events_count = 0
        latencies_ns: List[int] = []

        start_perf = time.perf_counter_ns()

        for event in self.feed.iter_events():
            if max_events is not None and events_count >= max_events:
                break

            t0 = time.perf_counter_ns() if measure_latency else 0

            # Deterministic dispatch to all subscribers
            for sub in self._subscribers:
                sub(event)

            if measure_latency:
                t1 = time.perf_counter_ns()
                latencies_ns.append(t1 - t0)

            events_count += 1

        total_duration_ns = time.perf_counter_ns() - start_perf
        duration_sec = total_duration_ns / 1_000_000_000.0
        throughput = int(events_count / duration_sec) if duration_sec > 0 else 0

        # Monotonic latency statistics in microseconds
        latencies_us = [lat / 1000.0 for lat in latencies_ns] if latencies_ns else [0.0]
        latencies_us.sort()
        n = len(latencies_us)

        median_us = latencies_us[n // 2] if n > 0 else 0.0
        p95_us = latencies_us[int(n * 0.95)] if n > 0 else 0.0
        p99_us = latencies_us[int(n * 0.99)] if n > 0 else 0.0
        max_us = latencies_us[-1] if n > 0 else 0.0

        return {
            "events_processed": events_count,
            "duration_seconds": round(duration_sec, 4),
            "throughput_events_per_sec": throughput,
            "median_latency_us": round(median_us, 2),
            "p95_latency_us": round(p95_us, 2),
            "p99_latency_us": round(p99_us, 2),
            "max_latency_us": round(max_us, 2),
        }
