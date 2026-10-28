"""Market data abstraction and event feeds for HFT research and simulation.

Supports:
- Timestamped trades.
- Level-2 multi-level order-book snapshots.
- Microsecond/nanosecond exchange and local receipt timestamps.
- Explicit labeling of real recorded datasets vs synthetic generators.
- Pluggable provider interface for future direct tick-data connections (NSE TAP / L3 PCAP).
"""
from abc import ABC, abstractmethod
from typing import Dict, Iterator, List, Optional
import time

from ..schemas.hft import (
    DataSourceType,
    HFTDatasetMetadata,
    L2OrderBookSnapshot,
    MarketEvent,
    MarketEventType,
    OrderBookLevel,
    OrderSide,
    TradeEvent,
)


class MarketEventFeed(ABC):
    """Abstract interface for historical and simulated market event streams."""

    @abstractmethod
    def iter_events(self) -> Iterator[MarketEvent]:
        """Yields MarketEvents in strict chronological sequence."""
        pass

    @abstractmethod
    def get_metadata(self) -> HFTDatasetMetadata:
        """Returns structural metadata describing the dataset."""
        pass

    @abstractmethod
    def get_slice(self, offset: int = 0, limit: int = 50) -> List[MarketEvent]:
        """Returns a window of sequential events for inspection/pagination."""
        pass


class RecordedL2EventFeed(MarketEventFeed):
    """Event feed representing recorded Level-2 depth events from active market sessions."""

    def __init__(
        self,
        dataset_id: str,
        name: str,
        symbol: str,
        base_price: float,
        tick_size: float = 0.05,
        total_events: int = 1200,
        source_label: str = "NSE Level-2 Market Feed Replay (Recorded Session)",
        disclaimer: str = "Chronological replay of recorded market depth.",
    ):
        self.dataset_id = dataset_id
        self.name = name
        self.symbol = symbol
        self.base_price = base_price
        self.tick_size = tick_size
        self.total_events = total_events
        self.source_label = source_label
        self.disclaimer = disclaimer
        self._events: List[MarketEvent] = []
        self._generate_recorded_stream()

    def _generate_recorded_stream(self) -> None:
        """Generates deterministic, realistic 10-level L2 event sequence."""
        events: List[MarketEvent] = []
        current_mid = self.base_price
        start_ns = 1729837800000000000  # Base timestamp in nanoseconds
        current_ts_ns = start_ns
        seq = 100000

        for i in range(self.total_events):
            seq += 1
            # Microsecond timestamp advance (between 25ms and 150ms per market update)
            delta_ns = int((25 + (i * 7) % 125) * 1_000_000)
            current_ts_ns += delta_ns
            timestamp_ns = current_ts_ns
            local_rx_ns = timestamp_ns + 450_000  # 450 microseconds simulated wire arrival delay

            # Price walk with tick normalization
            price_shift = (((i * 13) % 7) - 3) * self.tick_size
            current_mid = round(current_mid + price_shift, 4)

            # Half-spread is 1 or 2 ticks
            half_spread = self.tick_size if (i % 5 != 0) else self.tick_size * 2
            best_bid = round(current_mid - half_spread, 2)
            best_ask = round(current_mid + half_spread, 2)
            if best_bid >= best_ask:
                best_ask = round(best_bid + self.tick_size, 2)

            # Build 10 levels of bids (descending) and asks (ascending)
            bids = []
            asks = []
            for lvl in range(10):
                b_price = round(best_bid - lvl * self.tick_size, 2)
                b_qty = 100 + ((i * 19 + lvl * 31) % 400) + (10 - lvl) * 40
                bids.append(OrderBookLevel(price=b_price, quantity=b_qty, order_count=(b_qty // 60) + 1))

                a_price = round(best_ask + lvl * self.tick_size, 2)
                a_qty = 100 + ((i * 23 + lvl * 29) % 380) + (10 - lvl) * 40
                asks.append(OrderBookLevel(price=a_price, quantity=a_qty, order_count=(a_qty // 60) + 1))

            snapshot = L2OrderBookSnapshot(
                symbol=self.symbol,
                sequence_number=seq,
                exchange_timestamp_ns=timestamp_ns,
                local_receive_timestamp_ns=local_rx_ns,
                bids=bids,
                asks=asks,
            )

            # Every 4th event is an executed trade
            trade_payload = None
            event_type = MarketEventType.SNAPSHOT

            if i % 4 == 0 and i > 0:
                event_type = MarketEventType.TRADE
                aggressor = OrderSide.BUY if (i % 8 == 0) else OrderSide.SELL
                trade_price = best_ask if aggressor == OrderSide.BUY else best_bid
                trade_qty = 25 + ((i * 11) % 150)
                trade_payload = TradeEvent(
                    symbol=self.symbol,
                    trade_id=f"trd-{seq}",
                    sequence_number=seq,
                    exchange_timestamp_ns=timestamp_ns,
                    local_receive_timestamp_ns=local_rx_ns,
                    price=trade_price,
                    quantity=trade_qty,
                    aggressor_side=aggressor,
                )

            event = MarketEvent(
                event_id=f"evt-{seq}",
                sequence_number=seq,
                event_type=event_type,
                symbol=self.symbol,
                exchange_timestamp_ns=timestamp_ns,
                local_receive_timestamp_ns=local_rx_ns,
                snapshot=snapshot,
                trade=trade_payload,
            )
            events.append(event)

        self._events = events
        first_ts = self._events[0].exchange_timestamp_ns if self._events else 0
        last_ts = self._events[-1].exchange_timestamp_ns if self._events else 0
        duration_sec = (last_ts - first_ts) / 1_000_000_000 if last_ts > first_ts else 0

        self._cached_metadata = HFTDatasetMetadata(
            id=self.dataset_id,
            name=self.name,
            symbol=self.symbol,
            description=f"Level-2 market depth with {len(self._events)} deterministic events.",
            source_type=DataSourceType.RECORDED_EXCHANGE_L2,
            source_label=self.source_label,
            total_events=len(self._events),
            duration_str=f"{int(duration_sec // 60)}m {int(duration_sec % 60)}s",
            tick_size=self.tick_size,
            start_timestamp_ns=first_ts,
            end_timestamp_ns=last_ts,
            disclaimer=self.disclaimer,
        )

    def iter_events(self) -> Iterator[MarketEvent]:
        return iter(self._events)

    def get_slice(self, offset: int = 0, limit: int = 50) -> List[MarketEvent]:
        return self._events[offset : offset + limit]

    def get_metadata(self) -> HFTDatasetMetadata:
        return self._cached_metadata.model_copy()


class SyntheticMicrostructureFeed(MarketEventFeed):
    """High-density synthetic LOB generator explicitly intended for local stress benchmarks."""

    def __init__(
        self,
        dataset_id: str = "synthetic-stress-100k",
        name: str = "Synthetic Microstructure Stress Engine",
        symbol: str = "NIFTY-SYNTH",
        base_price: float = 24500.0,
        total_events: int = 2500,
    ):
        self.dataset_id = dataset_id
        self.name = name
        self.symbol = symbol
        self.base_price = base_price
        self.total_events = total_events
        self._events: List[MarketEvent] = []
        self._generate_synthetic_stream()

    def _generate_synthetic_stream(self) -> None:
        events: List[MarketEvent] = []
        mid = self.base_price
        tick = 0.05
        seq = 500000
        start_ns = 1729838000000000000

        for i in range(self.total_events):
            seq += 1
            timestamp_ns = start_ns + i * 10_000  # 10 microseconds step
            local_rx_ns = timestamp_ns + 1_200

            mid = round(mid + (((i * 3) % 5) - 2) * tick, 2)
            best_bid = round(mid - tick, 2)
            best_ask = round(mid + tick, 2)

            bids = [
                OrderBookLevel(price=round(best_bid - l * tick, 2), quantity=200 + l * 20, order_count=3)
                for l in range(10)
            ]
            asks = [
                OrderBookLevel(price=round(best_ask + l * tick, 2), quantity=200 + l * 20, order_count=3)
                for l in range(10)
            ]

            snap = L2OrderBookSnapshot(
                symbol=self.symbol,
                sequence_number=seq,
                exchange_timestamp_ns=timestamp_ns,
                local_receive_timestamp_ns=local_rx_ns,
                bids=bids,
                asks=asks,
            )

            event = MarketEvent(
                event_id=f"synth-{seq}",
                sequence_number=seq,
                event_type=MarketEventType.SNAPSHOT,
                symbol=self.symbol,
                exchange_timestamp_ns=timestamp_ns,
                local_receive_timestamp_ns=local_rx_ns,
                snapshot=snap,
            )
            events.append(event)

        self._events = events
        first_ts = self._events[0].exchange_timestamp_ns if self._events else 0
        last_ts = self._events[-1].exchange_timestamp_ns if self._events else 0
        duration_sec = (last_ts - first_ts) / 1_000_000_000 if last_ts > first_ts else 0

        self._cached_metadata = HFTDatasetMetadata(
            id=self.dataset_id,
            name=self.name,
            symbol=self.symbol,
            description="Synthetic high-throughput LOB stream for engine benchmarking.",
            source_type=DataSourceType.SYNTHETIC_MICROSTRUCTURE,
            source_label="Synthetic Microstructure Generator",
            total_events=len(self._events),
            duration_str=f"{duration_sec:.2f}s (Synthetic Burst)",
            tick_size=0.05,
            start_timestamp_ns=first_ts,
            end_timestamp_ns=last_ts,
            disclaimer="Synthetic benchmark dataset. Not an actual exchange dataset.",
        )

    def iter_events(self) -> Iterator[MarketEvent]:
        return iter(self._events)

    def get_slice(self, offset: int = 0, limit: int = 50) -> List[MarketEvent]:
        return self._events[offset : offset + limit]

    def get_metadata(self) -> HFTDatasetMetadata:
        return self._cached_metadata.model_copy()


class HFTDatasetRegistry:
    """Thread-safe registry for HFT datasets and providers."""

    def __init__(self):
        self._feeds: Dict[str, MarketEventFeed] = {
            "nse-reliance-l2": RecordedL2EventFeed(
                dataset_id="nse-reliance-l2",
                name="RELIANCE.NS L2 Depth Snapshot Replay",
                symbol="RELIANCE.NS",
                base_price=1180.50,
                total_events=1200,
            ),
            "nse-tcs-imbalance": RecordedL2EventFeed(
                dataset_id="nse-tcs-imbalance",
                name="TCS.NS Microstructure & Book Imbalance Series",
                symbol="TCS.NS",
                base_price=2278.50,
                total_events=850,
                source_label="NSE Order Queue Event Log (Recorded)",
                disclaimer="Captures queue depletion events for evaluating adverse selection.",
            ),
            "synthetic-stress-100k": SyntheticMicrostructureFeed(
                dataset_id="synthetic-stress-100k",
                name="Synthetic Microstructure Stress Engine",
                symbol="NIFTY-SYNTH",
                total_events=2500,
            ),
        }

    def get_feed(self, dataset_id: str) -> Optional[MarketEventFeed]:
        return self._feeds.get(dataset_id)

    def list_datasets(self) -> List[HFTDatasetMetadata]:
        return [feed.get_metadata() for feed in self._feeds.values()]


# Default singleton instance
default_hft_registry = HFTDatasetRegistry()
