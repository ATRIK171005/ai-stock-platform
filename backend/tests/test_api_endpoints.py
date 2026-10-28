"""Integration tests for FastAPI endpoints with mocked market provider."""
from unittest.mock import patch
from fastapi.testclient import TestClient
import pandas as pd


def test_search_endpoint(client: TestClient):
    response = client.get("/api/stocks/search?q=INFY")
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "INFY"
    assert data["total"] >= 1
    assert any("INFY" in r["symbol"] for r in data["results"])


def test_invalid_symbol_endpoint(client: TestClient):
    response = client.get("/api/stocks/INVALID$$SYMBOL/history")
    assert response.status_code == 400
    data = response.json()
    assert data["error_code"] == "INVALID_SYMBOL"


def test_invalid_period_endpoint(client: TestClient):
    response = client.get("/api/stocks/RELIANCE.NS/history?period=999years")
    assert response.status_code == 400
    data = response.json()
    assert data["error_code"] == "VALIDATION_ERROR"


@patch("app.services.market_data.default_market_provider.fetch_history")
def test_history_endpoint_success(mock_fetch, client: TestClient, synthetic_candles_100: pd.DataFrame):
    mock_fetch.return_value = synthetic_candles_100

    response = client.get("/api/stocks/RELIANCE.NS/history?period=1y&interval=1d")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "RELIANCE.NS"
    assert data["exchange"] == "NSE"
    assert data["total_candles"] == 100
    assert len(data["candles"]) == 100
    first_candle = data["candles"][0]
    assert "time" in first_candle
    assert "open" in first_candle
    assert "close" in first_candle


@patch("app.services.market_data.default_market_provider.fetch_history")
def test_indicators_endpoint_success(mock_fetch, client: TestClient, synthetic_candles_100: pd.DataFrame):
    mock_fetch.return_value = synthetic_candles_100

    response = client.get("/api/stocks/TCS.NS/indicators?period=1y&interval=1d")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "TCS.NS"
    assert data["total_candles"] == 100
    assert "latest_indicators" in data
    assert "trend_summary" in data
    assert 0 <= data["trend_score"] <= 100

    # Ensure indicators object is in each candle
    candle = data["candles"][-1]
    assert "indicators" in candle
    assert "sma20" in candle["indicators"]
    assert "rsi14" in candle["indicators"]


@patch("app.services.market_data.default_market_provider.fetch_history")
def test_signal_endpoint_success(mock_fetch, client: TestClient, synthetic_crossover_buy: pd.DataFrame):
    mock_fetch.return_value = synthetic_crossover_buy

    response = client.get("/api/stocks/RELIANCE.NS/signal?period=1y&interval=1d")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "RELIANCE.NS"
    assert data["signal"] in ["BUY", "SELL", "HOLD"]
    assert "reasons" in data
    assert len(data["reasons"]) > 0
    assert "disclaimer" in data
