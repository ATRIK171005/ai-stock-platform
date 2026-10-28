"""API endpoints for HFT Research, Datasets, and Replay Engine."""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ...schemas.hft import (
    HFTDatasetMetadata,
    HFTDatasetValidationResult,
    MarketEvent,
)
from ...services.hft_data import default_hft_registry
from ...services.hft_replay import EventReplayEngine

logger = logging.getLogger("market_platform.hft_routes")

router = APIRouter(prefix="/hft", tags=["HFT Simulation & Microstructure"])


class HFTHealthResponse(BaseModel):
    status: str
    engine: str
    replay_mode: str
    datasets_available: int
    timer_resolution: str
    disclaimer: str


class HFTBenchmarkRequest(BaseModel):
    dataset_id: str = "synthetic-stress-100k"
    max_events: Optional[int] = Field(default=2000, le=50000, ge=100)


class HFTBenchmarkResponse(BaseModel):
    dataset_id: str
    events_processed: int
    duration_seconds: float
    throughput_events_per_sec: int
    median_latency_us: float
    p95_latency_us: float
    p99_latency_us: float
    max_latency_us: float
    clock_type: str = "time.perf_counter_ns"


@router.get("/health", response_model=HFTHealthResponse)
def get_hft_health() -> HFTHealthResponse:
    """Reports status of HFT quantitative research engine and available dataset providers."""
    datasets = default_hft_registry.list_datasets()
    return HFTHealthResponse(
        status="ready",
        engine="MarketIQ Event-Driven Simulation Engine (v1.0-HFT)",
        replay_mode="Deterministic Sequential Chronological Replay",
        datasets_available=len(datasets),
        timer_resolution="Hardware Monotonic Clock (nanosecond precision)",
        disclaimer="Simulated research environment. Broker order routing is disabled.",
    )


@router.get("/datasets", response_model=List[HFTDatasetMetadata])
def list_hft_datasets() -> List[HFTDatasetMetadata]:
    """Lists all available recorded and synthetic L2 market datasets."""
    return default_hft_registry.list_datasets()


@router.get("/datasets/{dataset_id}/preview", response_model=List[MarketEvent])
def get_dataset_preview(
    dataset_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> List[MarketEvent]:
    """Returns a sequential window of market events for inspection."""
    feed = default_hft_registry.get_feed(dataset_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found.")
    return feed.get_slice(offset=offset, limit=limit)


@router.post("/datasets/{dataset_id}/validate", response_model=HFTDatasetValidationResult)
def validate_dataset_integrity(dataset_id: str) -> HFTDatasetValidationResult:
    """Performs strict audit for sequence gaps, out-of-order timestamps, duplicates, and crossed books."""
    feed = default_hft_registry.get_feed(dataset_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found.")

    engine = EventReplayEngine(feed)
    return engine.validate_stream_integrity()


@router.post("/benchmark", response_model=HFTBenchmarkResponse)
def run_replay_benchmark(req: HFTBenchmarkRequest) -> HFTBenchmarkResponse:
    """Runs high-throughput local engine replay benchmark with monotonic nanosecond profiling."""
    feed = default_hft_registry.get_feed(req.dataset_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Dataset '{req.dataset_id}' not found.")

    engine = EventReplayEngine(feed)
    res = engine.run_replay(max_events=req.max_events, measure_latency=True)

    return HFTBenchmarkResponse(
        dataset_id=req.dataset_id,
        events_processed=res["events_processed"],
        duration_seconds=res["duration_seconds"],
        throughput_events_per_sec=res["throughput_events_per_sec"],
        median_latency_us=res["median_latency_us"],
        p95_latency_us=res["p95_latency_us"],
        p99_latency_us=res["p99_latency_us"],
        max_latency_us=res["max_latency_us"],
    )
