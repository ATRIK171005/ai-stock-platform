"""Pydantic schemas for High-Frequency Trading (HFT) market data, L2 order books, and events.

Strictly preserves nanosecond-precision timestamps, sequence numbers, multi-level depth,
and deterministic microstructural metrics (spread, mid-price, micro-price, depth imbalance).
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class MarketEventType(str, Enum):
    SNAPSHOT = "SNAPSHOT"
    BOOK_DELTA = "BOOK_DELTA"
    TRADE = "TRADE"
    HEARTBEAT = "HEARTBEAT"


class DataSourceType(str, Enum):
    RECORDED_EXCHANGE_L2 = "RECORDED_EXCHANGE_L2"
    SYNTHETIC_MICROSTRUCTURE = "SYNTHETIC_MICROSTRUCTURE"
    SIMULATION_INTERNAL = "SIMULATION_INTERNAL"


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderBookLevel(BaseModel):
    """Single price-level in a Limit Order Book."""
    price: float = Field(gt=0, description="Limit price in INR")
    quantity: int = Field(gt=0, description="Aggregate shares at this price level")
    order_count: int = Field(default=1, ge=1, description="Number of resting orders at this level")

    @field_validator("price")
    @classmethod
    def round_price(cls, v: float) -> float:
        return round(v, 4)


class OrderBookDelta(BaseModel):
    """Incremental Level-2 / Level-3 book update."""
    price: float = Field(gt=0, description="Price level updated")
    quantity: int = Field(ge=0, description="New quantity (0 represents level deletion)")
    side: OrderSide = Field(description="Order side (BUY or SELL)")
    order_count: Optional[int] = Field(default=None, ge=0)


class TradeEvent(BaseModel):
    """Executed trade event on the exchange."""
    symbol: str
    trade_id: str
    sequence_number: int = Field(ge=0)
    exchange_timestamp_ns: int = Field(ge=0, description="Exchange matching engine timestamp in nanoseconds UTC")
    local_receive_timestamp_ns: int = Field(ge=0, description="Client reception timestamp in nanoseconds")
    price: float = Field(gt=0, description="Execution trade price")
    quantity: int = Field(gt=0, description="Execution trade volume in shares")
    aggressor_side: OrderSide = Field(description="Taker side that initiated the trade execution")


class L2OrderBookSnapshot(BaseModel):
    """Multi-level Limit Order Book (L2) snapshot."""
    symbol: str
    sequence_number: int = Field(ge=0)
    exchange_timestamp_ns: int = Field(ge=0, description="Exchange timestamp in nanoseconds UTC")
    local_receive_timestamp_ns: int = Field(ge=0, description="Local arrival timestamp in nanoseconds")
    bids: List[OrderBookLevel] = Field(default_factory=list, description="Sorted descending by price")
    asks: List[OrderBookLevel] = Field(default_factory=list, description="Sorted ascending by price")

    @model_validator(mode="after")
    def validate_book_integrity(self) -> "L2OrderBookSnapshot":
        if self.bids and self.asks:
            best_bid = self.bids[0].price
            best_ask = self.asks[0].price
            if best_bid >= best_ask:
                raise ValueError(
                    f"Crossed/locked order book detected: Best Bid ({best_bid}) >= Best Ask ({best_ask})"
                )
        return self

    @property
    def best_bid(self) -> Optional[float]:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Optional[float]:
        return self.asks[0].price if self.asks else None

    @property
    def spread(self) -> Optional[float]:
        if self.bids and self.asks:
            return round(self.asks[0].price - self.bids[0].price, 4)
        return None

    @property
    def mid_price(self) -> Optional[float]:
        if self.bids and self.asks:
            return round((self.bids[0].price + self.asks[0].price) / 2.0, 4)
        return None

    @property
    def total_bid_depth(self) -> int:
        return sum(b.quantity for b in self.bids)

    @property
    def total_ask_depth(self) -> int:
        return sum(a.quantity for a in self.asks)

    def micro_price(self, depth_levels: int = 5) -> Optional[float]:
        """Calculates volume-weighted micro-price:
        Microprice = (V_bid * P_ask + V_ask * P_bid) / (V_bid + V_ask)
        """
        if not self.bids or not self.asks:
            return None
        b_qty = sum(b.quantity for b in self.bids[:depth_levels])
        a_qty = sum(a.quantity for a in self.asks[:depth_levels])
        total = b_qty + a_qty
        if total == 0:
            return self.mid_price
        best_b = self.bids[0].price
        best_a = self.asks[0].price
        return round((b_qty * best_a + a_qty * best_b) / total, 4)

    def calculate_imbalance(self, depth_levels: int = 5) -> float:
        """Calculates Order Book Imbalance (OBI) in range [-1.0, +1.0]:
        Imbalance = (V_bid - V_ask) / (V_bid + V_ask)
        """
        b_qty = sum(b.quantity for b in self.bids[:depth_levels])
        a_qty = sum(a.quantity for a in self.asks[:depth_levels])
        total = b_qty + a_qty
        if total == 0:
            return 0.0
        return round((b_qty - a_qty) / total, 4)


class MarketEvent(BaseModel):
    """Atomic market event envelope processed sequentially by the simulation engine."""
    event_id: str
    sequence_number: int = Field(ge=0)
    event_type: MarketEventType
    symbol: str
    exchange_timestamp_ns: int = Field(ge=0, description="Exchange timestamp in nanoseconds UTC")
    local_receive_timestamp_ns: int = Field(ge=0, description="Local hardware receipt timestamp in nanoseconds")
    snapshot: Optional[L2OrderBookSnapshot] = None
    deltas: Optional[List[OrderBookDelta]] = None
    trade: Optional[TradeEvent] = None

    @model_validator(mode="after")
    def validate_payload_presence(self) -> "MarketEvent":
        if self.event_type == MarketEventType.SNAPSHOT and not self.snapshot:
            raise ValueError("SNAPSHOT event must include snapshot payload")
        if self.event_type == MarketEventType.TRADE and not self.trade:
            raise ValueError("TRADE event must include trade payload")
        if self.event_type == MarketEventType.BOOK_DELTA and not self.deltas:
            raise ValueError("BOOK_DELTA event must include deltas list")
        return self


class HFTDatasetMetadata(BaseModel):
    id: str
    name: str
    symbol: str
    description: str
    source_type: DataSourceType
    source_label: str
    total_events: int
    duration_str: str
    tick_size: float = 0.05
    start_timestamp_ns: int
    end_timestamp_ns: int
    disclaimer: str


class HFTDatasetValidationResult(BaseModel):
    dataset_id: str
    is_valid: bool
    total_events_checked: int
    sequence_gaps_count: int
    out_of_order_timestamps_count: int
    duplicate_events_count: int
    crossed_books_count: int
    min_timestamp_ns: int
    max_timestamp_ns: int
    integrity_summary: str
    anomalies: List[str] = Field(default_factory=list)
