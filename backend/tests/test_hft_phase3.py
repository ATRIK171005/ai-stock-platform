"""Unit and integration tests for HFT Phase 3: Market event schemas, deterministic replay, and L2 depth validation."""
import pytest
from fastapi.testclient import TestClient

from app.schemas.hft import (
    L2OrderBookSnapshot,
    MarketEvent,
    MarketEventType,
    OrderBookLevel,
    OrderSide,
)
from app.services.hft_data import (
    MarketEventFeed,
    RecordedL2EventFeed,
    SyntheticMicrostructureFeed,
    default_hft_registry,
)
from app.services.hft_replay import EventReplayEngine


def test_hft_health_endpoint(client: TestClient):
    """GET /api/hft/health reports operational status, datasets, and monotonic clock."""
    response = client.get("/api/hft/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["datasets_available"] >= 3
    assert "monotonic" in data["timer_resolution"].lower()
    assert "disabled" in data["disclaimer"].lower()


def test_hft_datasets_listing(client: TestClient):
    """GET /api/hft/datasets returns list of available recorded and synthetic datasets."""
    response = client.get("/api/hft/datasets")
    assert response.status_code == 200
    datasets = response.json()
    assert len(datasets) >= 3

    ids = [d["id"] for d in datasets]
    assert "nse-reliance-l2" in ids
    assert "nse-tcs-imbalance" in ids
    assert "synthetic-stress-100k" in ids

    for d in datasets:
        assert d["total_events"] > 0
        assert d["tick_size"] == 0.05
        assert d["disclaimer"]


def test_hft_dataset_preview(client: TestClient):
    """GET /api/hft/datasets/{id}/preview returns sequential slice of L2 market events."""
    response = client.get("/api/hft/datasets/nse-reliance-l2/preview?offset=0&limit=15")
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 15

    for i, evt in enumerate(events):
        assert evt["event_id"].startswith("evt-")
        assert evt["symbol"] == "RELIANCE.NS"
        assert evt["sequence_number"] > 0
        assert evt["exchange_timestamp_ns"] > 0

        # Sequence must be consecutive
        if i > 0:
            assert evt["sequence_number"] == events[i - 1]["sequence_number"] + 1
            assert evt["exchange_timestamp_ns"] >= events[i - 1]["exchange_timestamp_ns"]

        # Level 2 order book snapshot checks
        snap = evt.get("snapshot")
        if snap:
            assert len(snap["bids"]) == 10
            assert len(snap["asks"]) == 10
            assert snap["bids"][0]["price"] < snap["asks"][0]["price"]


def test_hft_dataset_validation_clean_stream(client: TestClient):
    """POST /api/hft/datasets/{id}/validate audits recorded dataset for 0 anomalies."""
    response = client.post("/api/hft/datasets/nse-reliance-l2/validate")
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is True
    assert data["sequence_gaps_count"] == 0
    assert data["out_of_order_timestamps_count"] == 0
    assert data["duplicate_events_count"] == 0
    assert data["crossed_books_count"] == 0
    assert data["total_events_checked"] >= 1200
    assert "verified" in data["integrity_summary"].lower()


class AnomalyTestFeed(MarketEventFeed):
    """Custom mock feed generating deliberately corrupted events for validation tests."""

    def __init__(self, events):
        self.events = events

    def iter_events(self):
        for e in self.events:
            yield e

    def get_metadata(self):
        meta = default_hft_registry.get_feed("nse-reliance-l2").get_metadata()
        meta.id = "anomaly-feed"
        return meta

    def get_slice(self, offset=0, limit=50):
        return self.events[offset : offset + limit]


def test_replay_engine_anomaly_detection():
    """EventReplayEngine correctly detects duplicate events, sequence gaps, and timestamp inversions."""
    # Base snapshot
    snap = L2OrderBookSnapshot(
        symbol="TEST.NS",
        sequence_number=100,
        exchange_timestamp_ns=1000,
        local_receive_timestamp_ns=1010,
        bids=[OrderBookLevel(price=100.0, quantity=50)],
        asks=[OrderBookLevel(price=100.1, quantity=50)],
    )

    # 1. Valid event
    e1 = MarketEvent(
        event_id="e1",
        sequence_number=1,
        event_type=MarketEventType.SNAPSHOT,
        symbol="TEST.NS",
        exchange_timestamp_ns=1000,
        local_receive_timestamp_ns=1010,
        snapshot=snap,
    )

    # 2. Duplicate event (duplicate seq & id)
    e2 = MarketEvent(
        event_id="e1",
        sequence_number=1,
        event_type=MarketEventType.SNAPSHOT,
        symbol="TEST.NS",
        exchange_timestamp_ns=1050,
        local_receive_timestamp_ns=1060,
        snapshot=snap,
    )

    # 3. Gapped sequence (expected 2, got 5) and inverted timestamp (900 < 1050)
    e3 = MarketEvent(
        event_id="e3",
        sequence_number=5,
        event_type=MarketEventType.SNAPSHOT,
        symbol="TEST.NS",
        exchange_timestamp_ns=900,
        local_receive_timestamp_ns=910,
        snapshot=snap,
    )

    feed = AnomalyTestFeed([e1, e2, e3])
    engine = EventReplayEngine(feed)
    audit = engine.validate_stream_integrity()

    assert audit.is_valid is False
    assert audit.duplicate_events_count == 1
    assert audit.sequence_gaps_count == 1
    assert audit.out_of_order_timestamps_count == 1
    assert len(audit.anomalies) >= 3


def test_l2_order_book_microprice_and_imbalance():
    """L2OrderBookSnapshot microprice and imbalance conform to microstructural formulas."""
    bids = [
        OrderBookLevel(price=100.00, quantity=300),
        OrderBookLevel(price=99.95, quantity=200),
    ]
    asks = [
        OrderBookLevel(price=100.05, quantity=100),
        OrderBookLevel(price=100.10, quantity=200),
    ]
    snap = L2OrderBookSnapshot(
        symbol="RELIANCE.NS",
        sequence_number=1,
        exchange_timestamp_ns=1000,
        local_receive_timestamp_ns=1005,
        bids=bids,
        asks=asks,
    )

    assert snap.best_bid == 100.00
    assert snap.best_ask == 100.05
    assert snap.spread == 0.05
    assert snap.mid_price == 100.025

    # Bid qty = 500, Ask qty = 300. Imbalance = (500 - 300) / 800 = +0.25
    assert snap.calculate_imbalance(depth_levels=2) == 0.25

    # Microprice must be strictly between best bid and best ask, tilted toward ask due to heavier bid volume
    micro = snap.micro_price(depth_levels=2)
    assert micro is not None
    assert 100.00 <= micro <= 100.05
    assert micro > snap.mid_price  # More buying pressure lifts microprice above mid


def test_crossed_book_rejection():
    """L2OrderBookSnapshot rejects crossed or locked books (best_bid >= best_ask)."""
    with pytest.raises(ValueError, match="Crossed/locked order book detected"):
        L2OrderBookSnapshot(
            symbol="CROSS.NS",
            sequence_number=1,
            exchange_timestamp_ns=1000,
            local_receive_timestamp_ns=1005,
            bids=[OrderBookLevel(price=105.00, quantity=100)],
            asks=[OrderBookLevel(price=104.90, quantity=100)],  # Ask < Bid!
        )


def test_hft_benchmark_endpoint(client: TestClient):
    """POST /api/hft/benchmark runs local engine profiling and measures throughput."""
    payload = {"dataset_id": "synthetic-stress-100k", "max_events": 1000}
    response = client.post("/api/hft/benchmark", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["events_processed"] == 1000
    assert data["duration_seconds"] > 0
    assert data["throughput_events_per_sec"] > 1000  # Python engine should process thousands of events/sec
    assert data["median_latency_us"] >= 0
    assert data["p95_latency_us"] >= data["median_latency_us"]
    assert data["max_latency_us"] >= data["p95_latency_us"]
    assert data["clock_type"] == "time.perf_counter_ns"


def test_deterministic_replay_reproducibility():
    """Replaying the event feed twice dispatches identical events in the exact same order."""
    feed = default_hft_registry.get_feed("nse-reliance-l2")
    engine = EventReplayEngine(feed)

    run_1_events = []
    run_2_events = []

    engine.subscribe(lambda e: run_1_events.append(e.event_id))
    engine.run_replay(max_events=100)

    # Reset subscribers and run again
    engine._subscribers.clear()
    engine.subscribe(lambda e: run_2_events.append(e.event_id))
    engine.run_replay(max_events=100)

    assert len(run_1_events) == 100
    assert len(run_2_events) == 100
    assert run_1_events == run_2_events
