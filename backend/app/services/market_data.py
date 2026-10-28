"""Market data provider service with pluggable architecture and in-memory TTL cache."""
from abc import ABC, abstractmethod
import re
import threading
import time
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

from ..config import settings
from ..core.exceptions import (
    DataUnavailableError,
    InvalidSymbolError,
    RateLimitOrTimeoutError,
    ValidationError,
)
from ..schemas.stock import StockSearchResult


# Popular Indian Equities Registry for Search & Validation
INDIAN_EQUITIES_REGISTRY: List[Dict[str, str]] = [
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries Ltd", "exchange": "NSE", "sector": "Energy & Conglomerate"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services Ltd", "exchange": "NSE", "sector": "Information Technology"},
    {"symbol": "INFY.NS", "name": "Infosys Ltd", "exchange": "NSE", "sector": "Information Technology"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank Ltd", "exchange": "NSE", "sector": "Banking & Finance"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors Ltd", "exchange": "NSE", "sector": "Automobile"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank Ltd", "exchange": "NSE", "sector": "Banking & Finance"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "exchange": "NSE", "sector": "Banking & Finance"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel Ltd", "exchange": "NSE", "sector": "Telecommunications"},
    {"symbol": "ITC.NS", "name": "ITC Ltd", "exchange": "NSE", "sector": "Consumer Goods"},
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever Ltd", "exchange": "NSE", "sector": "Consumer Goods"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro Ltd", "exchange": "NSE", "sector": "Construction & Engineering"},
    {"symbol": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank Ltd", "exchange": "NSE", "sector": "Banking & Finance"},
    {"symbol": "AXISBANK.NS", "name": "Axis Bank Ltd", "exchange": "NSE", "sector": "Banking & Finance"},
    {"symbol": "MARUTI.NS", "name": "Maruti Suzuki India Ltd", "exchange": "NSE", "sector": "Automobile"},
    {"symbol": "SUNPHARMA.NS", "name": "Sun Pharmaceutical Industries Ltd", "exchange": "NSE", "sector": "Pharmaceuticals"},
    {"symbol": "TITAN.NS", "name": "Titan Company Ltd", "exchange": "NSE", "sector": "Consumer Durables"},
    {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance Ltd", "exchange": "NSE", "sector": "Financial Services"},
    {"symbol": "WIPRO.NS", "name": "Wipro Ltd", "exchange": "NSE", "sector": "Information Technology"},
    {"symbol": "ASIANPAINT.NS", "name": "Asian Paints Ltd", "exchange": "NSE", "sector": "Consumer Goods"},
    {"symbol": "HCLTECH.NS", "name": "HCL Technologies Ltd", "exchange": "NSE", "sector": "Information Technology"},
    {"symbol": "NTPC.NS", "name": "NTPC Ltd", "exchange": "NSE", "sector": "Utilities & Power"},
    {"symbol": "POWERGRID.NS", "name": "Power Grid Corporation of India Ltd", "exchange": "NSE", "sector": "Utilities & Power"},
    {"symbol": "TATASTEEL.NS", "name": "Tata Steel Ltd", "exchange": "NSE", "sector": "Metals & Mining"},
    {"symbol": "COALINDIA.NS", "name": "Coal India Ltd", "exchange": "NSE", "sector": "Energy & Mining"},
    {"symbol": "ADANIENT.NS", "name": "Adani Enterprises Ltd", "exchange": "NSE", "sector": "Conglomerate"},
    # BSE Suffixes
    {"symbol": "RELIANCE.BO", "name": "Reliance Industries Ltd (BSE)", "exchange": "BSE", "sector": "Energy"},
    {"symbol": "TCS.BO", "name": "Tata Consultancy Services (BSE)", "exchange": "BSE", "sector": "Information Technology"},
    {"symbol": "INFY.BO", "name": "Infosys Ltd (BSE)", "exchange": "BSE", "sector": "Information Technology"},
    {"symbol": "HDFCBANK.BO", "name": "HDFC Bank Ltd (BSE)", "exchange": "BSE", "sector": "Banking"},
    {"symbol": "500325.BO", "name": "Reliance Industries Ltd (BSE)", "exchange": "BSE", "sector": "Energy"},
    {"symbol": "532540.BO", "name": "Tata Consultancy Services (BSE)", "exchange": "BSE", "sector": "Information Technology"},
    {"symbol": "500209.BO", "name": "Infosys Ltd (BSE)", "exchange": "BSE", "sector": "Information Technology"},
    {"symbol": "500180.BO", "name": "HDFC Bank Ltd (BSE)", "exchange": "BSE", "sector": "Banking"},
]

ALLOWED_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}
ALLOWED_INTERVALS = {"1d", "1wk", "1mo"}


class MarketDataProvider(ABC):
    """Abstract interface for pluggable market data sources."""

    @abstractmethod
    def fetch_history(self, symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        """Fetch historical OHLCV data as a cleaned pandas DataFrame."""
        pass

    @abstractmethod
    def search_symbols(self, query: str) -> List[StockSearchResult]:
        """Search available stock symbols matching query."""
        pass


class YFinanceProvider(MarketDataProvider):
    """Yahoo Finance implementation for Indian Equities (NSE/BSE)."""

    # Upstream symbol aliases for delisted or numeric BSE codes
    UPSTREAM_ALIASES = {
        "TATAMOTORS.NS": "TMCV.NS",
        "TATAMOTORS": "TMCV.NS",
        "500570.BO": "TMCV.BO",
        "500325.BO": "RELIANCE.BO",
        "532540.BO": "TCS.BO",
        "500209.BO": "INFY.BO",
        "500180.BO": "HDFCBANK.BO",
    }

    def __init__(self, cache_ttl: int = settings.cache_ttl_seconds):
        self.cache_ttl = cache_ttl
        self._cache: Dict[Tuple[str, str, str], Tuple[float, pd.DataFrame]] = {}
        self._lock = threading.Lock()

    def normalize_symbol(self, raw_symbol: str) -> Tuple[str, str]:
        """Validates symbol format and determines exchange."""
        sym = raw_symbol.strip().upper()
        if not sym:
            raise InvalidSymbolError("Stock symbol cannot be empty.")

        # Check for disallowed characters
        if not re.match(r"^[A-Z0-9\.\^_\-]+$", sym):
            raise InvalidSymbolError(f"Invalid symbol characters in '{raw_symbol}'.")

        # Auto-append exchange suffix if not provided
        if not sym.endswith(".NS") and not sym.endswith(".BO") and not sym.startswith("^"):
            sym = f"{sym}.NS"

        exchange = "BSE" if sym.endswith(".BO") else "NSE"
        return sym, exchange

    def validate_params(self, period: str, interval: str) -> None:
        """Validates period and interval arguments."""
        if period not in ALLOWED_PERIODS:
            raise ValidationError(
                f"Invalid period '{period}'. Supported periods: {', '.join(sorted(ALLOWED_PERIODS))}"
            )
        if interval not in ALLOWED_INTERVALS:
            raise ValidationError(
                f"Invalid interval '{interval}'. Supported intervals: {', '.join(sorted(ALLOWED_INTERVALS))}"
            )

    def fetch_history(self, raw_symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        """Retrieves and cleans historical OHLCV candles with caching."""
        symbol, _ = self.normalize_symbol(raw_symbol)
        self.validate_params(period, interval)

        cache_key = (symbol, period, interval)
        now = time.time()

        # Check cache
        with self._lock:
            if cache_key in self._cache:
                timestamp, cached_df = self._cache[cache_key]
                if now - timestamp < self.cache_ttl:
                    return cached_df.copy()

        # Fetch from yfinance (using alias if symbol was renamed upstream)
        upstream_symbol = self.UPSTREAM_ALIASES.get(symbol, symbol)
        try:
            ticker = yf.Ticker(upstream_symbol)
            df = ticker.history(period=period, interval=interval, auto_adjust=True)
        except Exception as e:
            raise RateLimitOrTimeoutError(f"Upstream provider failure fetching data for '{symbol}': {str(e)}")

        if df is None or df.empty:
            raise DataUnavailableError(f"No market data found for symbol '{symbol}' with period='{period}'.")

        # Verify required columns exist
        req_cols = ["Open", "High", "Low", "Close", "Volume"]
        missing = [c for c in req_cols if c not in df.columns]
        if missing:
            raise DataUnavailableError(f"Market data response missing required columns: {missing}")

        # Clean and sort chronologically
        cleaned_df = df[req_cols].copy()
        cleaned_df = cleaned_df.dropna(subset=["Open", "High", "Low", "Close"])
        cleaned_df = cleaned_df[~cleaned_df.index.duplicated(keep="first")]
        cleaned_df = cleaned_df.sort_index(ascending=True)

        if cleaned_df.empty:
            raise DataUnavailableError(f"All returned records were invalid or NaN for '{symbol}'.")

        # Ensure volume is integer
        cleaned_df["Volume"] = cleaned_df["Volume"].fillna(0).astype(np.int64)

        # Store in cache with bounded size management
        with self._lock:
            if len(self._cache) >= 200:
                # Purge expired entries
                expired = [k for k, (ts, _) in self._cache.items() if now - ts >= self.cache_ttl]
                for k in expired:
                    del self._cache[k]
                # If still at limit, evict oldest entry
                if len(self._cache) >= 200:
                    oldest_k = min(self._cache.keys(), key=lambda k: self._cache[k][0])
                    del self._cache[oldest_k]
            self._cache[cache_key] = (now, cleaned_df)

        return cleaned_df.copy()

    def search_symbols(self, query: str) -> List[StockSearchResult]:
        """Case-insensitive search over Indian equities registry."""
        q = query.strip().upper()
        if not q:
            # Return top default stocks
            return [
                StockSearchResult(**item) for item in INDIAN_EQUITIES_REGISTRY[:10]
            ]

        matches: List[StockSearchResult] = []
        for item in INDIAN_EQUITIES_REGISTRY:
            if (
                q in item["symbol"].upper()
                or q in item["name"].upper()
                or q in (item.get("sector") or "").upper()
            ):
                matches.append(StockSearchResult(**item))

        # If user typed an exact valid-looking ticker not in sample registry, allow validating it
        if not matches and re.match(r"^[A-Z0-9\^_\-]{2,12}(\.NS|\.BO)?$", q):
            clean_sym, exch = self.normalize_symbol(q)
            matches.append(
                StockSearchResult(
                    symbol=clean_sym,
                    name=f"{clean_sym.replace('.NS', '').replace('.BO', '')} ({exch})",
                    exchange=exch,
                    sector="Equities",
                )
            )

        return matches


# Default singleton instance
default_market_provider = YFinanceProvider()
