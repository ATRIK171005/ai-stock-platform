"""Unit tests for Market Data Provider, symbol normalization, validation, and error cases."""
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest

from app.core.exceptions import (
    DataUnavailableError,
    InvalidSymbolError,
    RateLimitOrTimeoutError,
    ValidationError,
)
from app.services.market_data import YFinanceProvider


def test_normalize_symbol():
    provider = YFinanceProvider()

    # Default to NSE if no suffix provided
    sym, exch = provider.normalize_symbol("RELIANCE")
    assert sym == "RELIANCE.NS"
    assert exch == "NSE"

    # Preserves explicit NSE suffix
    sym, exch = provider.normalize_symbol("TCS.NS")
    assert sym == "TCS.NS"
    assert exch == "NSE"

    # Handles BSE suffix
    sym, exch = provider.normalize_symbol("500325.BO")
    assert sym == "500325.BO"
    assert exch == "BSE"

    # Handles index symbol
    sym, exch = provider.normalize_symbol("^NSEI")
    assert sym == "^NSEI"
    assert exch == "NSE"


def test_invalid_symbol_rejection():
    provider = YFinanceProvider()

    with pytest.raises(InvalidSymbolError):
        provider.normalize_symbol("")

    with pytest.raises(InvalidSymbolError):
        provider.normalize_symbol("   ")

    with pytest.raises(InvalidSymbolError):
        provider.normalize_symbol("RELIANCE; DROP TABLE stocks;")

    with pytest.raises(InvalidSymbolError):
        provider.normalize_symbol("TCS<script>")


def test_param_validation():
    provider = YFinanceProvider()

    # Valid
    provider.validate_params("1y", "1d")
    provider.validate_params("3mo", "1d")

    # Invalid period
    with pytest.raises(ValidationError):
        provider.validate_params("invalid_period", "1d")

    # Invalid interval
    with pytest.raises(ValidationError):
        provider.validate_params("1y", "1second")


def test_search_symbols():
    provider = YFinanceProvider()

    # Search for TCS
    results = provider.search_symbols("TCS")
    assert len(results) >= 1
    assert any("TCS" in r.symbol for r in results)

    # Search for Reliance
    results = provider.search_symbols("Reliance")
    assert len(results) >= 1
    assert any("RELIANCE" in r.symbol for r in results)

    # Empty query returns top defaults
    results = provider.search_symbols("")
    assert len(results) == 10


@patch("yfinance.Ticker")
def test_fetch_history_empty_response(mock_ticker):
    mock_instance = MagicMock()
    mock_instance.history.return_value = pd.DataFrame()
    mock_ticker.return_value = mock_instance

    provider = YFinanceProvider(cache_ttl=0)
    with pytest.raises(DataUnavailableError):
        provider.fetch_history("UNKNOWNSTOCK.NS", period="1y", interval="1d")


@patch("yfinance.Ticker")
def test_fetch_history_missing_columns(mock_ticker):
    mock_instance = MagicMock()
    # DataFrame missing Volume column
    mock_instance.history.return_value = pd.DataFrame({
        "Open": [100.0],
        "High": [105.0],
        "Low": [95.0],
        "Close": [102.0],
    })
    mock_ticker.return_value = mock_instance

    provider = YFinanceProvider(cache_ttl=0)
    with pytest.raises(DataUnavailableError):
        provider.fetch_history("RELIANCE.NS", period="1y", interval="1d")


@patch("yfinance.Ticker")
def test_fetch_history_upstream_failure(mock_ticker):
    mock_instance = MagicMock()
    mock_instance.history.side_effect = ConnectionError("Network unreachable")
    mock_ticker.return_value = mock_instance

    provider = YFinanceProvider(cache_ttl=0)
    with pytest.raises(RateLimitOrTimeoutError):
        provider.fetch_history("RELIANCE.NS", period="1y", interval="1d")
