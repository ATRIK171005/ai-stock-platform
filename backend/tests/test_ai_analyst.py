"""Unit and integration tests for AI Market Analyst service and API routes."""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from google.genai.errors import APIError
import pytest

from app.config import settings
from app.schemas.backtest import BacktestRequest, StrategyType
from app.services.ai_analyst import (
    ai_cache,
    default_ai_service,
    gather_stock_context,
)
from app.services.backtest_engine import BacktestEngine
from tests.test_backtest import generate_synthetic_crossover_data


@pytest.fixture(autouse=True)
def clear_ai_cache_and_state():
    """Clears AI cache and reset singleton state before each test."""
    ai_cache.clear()
    default_ai_service._gemini_client = None
    with patch.object(settings, "groq_api_key", None), patch.object(settings, "ai_provider", "AUTO"):
        yield
    ai_cache.clear()
    default_ai_service._gemini_client = None


def test_ai_health_not_configured(client: TestClient):
    """GET /api/ai/health reports not_configured when GEMINI_API_KEY is empty."""
    with patch.object(settings, "gemini_api_key", None):
        response = client.get("/api/ai/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_configured"
        assert data["configured"] is False
        assert "gemini" in data["model"].lower()
        assert data["provider"] == "Google Gemini"


def test_ai_health_configured(client: TestClient):
    """GET /api/ai/health reports ready when GEMINI_API_KEY is configured."""
    with patch.object(settings, "gemini_api_key", "dummy_test_api_key_12345"):
        response = client.get("/api/ai/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["configured"] is True


def test_ai_analyze_missing_api_key(client: TestClient):
    """POST /api/ai/analyze returns 503 AI_KEY_NOT_CONFIGURED when key is missing."""
    with patch.object(settings, "gemini_api_key", ""):
        payload = {"symbol": "RELIANCE.NS", "question": "Explain current momentum."}
        response = client.post("/api/ai/analyze", json=payload)
        assert response.status_code == 503
        data = response.json()
        assert data["error_code"] == "AI_KEY_NOT_CONFIGURED"
        assert "GEMINI_API_KEY" in data["detail"]


def test_ai_analyze_valid_structured_response(client: TestClient):
    """POST /api/ai/analyze returns 200 and validated StructuredAIAnalysis when Gemini succeeds."""
    mock_gemini_json = """{
        "summary": "TCS is consolidating above its 20-day SMA with neutral RSI momentum.",
        "observed_facts": {
            "price": 4180.50,
            "SMA20": 4150.00,
            "RSI14": 52.4,
            "signal": "HOLD"
        },
        "interpretation": "The price is forming a constructive base above short-term moving average support.",
        "supporting_evidence": [
            "Closing price ₹4,180.50 remains above SMA20 (₹4,150.00)",
            "RSI-14 at 52.4 reflects balanced buying and selling pressure"
        ],
        "key_risks": [
            "Downside test of 50-day moving average at ₹4,100",
            "IT sector valuation multiple compression"
        ],
        "uncertainties": [
            "Market data delayed up to 15 minutes",
            "No high-impact corporate filings in past 24 hours"
        ],
        "data_timestamp": "2026-10-26",
        "disclaimer": "Non-advisory simulation."
    }"""

    mock_response = MagicMock()
    mock_response.text = mock_gemini_json

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch.object(settings, "gemini_api_key", "test_key_valid"), \
         patch.object(default_ai_service, "get_client", return_value=mock_client):

        payload = {
            "symbol": "TCS.NS",
            "question": "What is the current technical setup for TCS?",
        }
        response = client.post("/api/ai/analyze", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["symbol"] == "TCS.NS"
        assert "analysis" in data
        analysis = data["analysis"]
        assert "consolidating" in analysis["summary"]
        assert analysis["observed_facts"]["price"] == 4180.50
        assert len(analysis["supporting_evidence"]) >= 1
        assert len(analysis["key_risks"]) >= 1
        assert "disclaimer" in analysis


def test_ai_analyze_malformed_model_response_fallback(client: TestClient):
    """POST /api/ai/analyze safely recovers when Gemini returns unformatted plain text."""
    raw_plain_text = "TCS is currently bullish with strong momentum. The RSI is 60 and price is above 20 SMA."

    mock_response = MagicMock()
    mock_response.text = raw_plain_text

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch.object(settings, "gemini_api_key", "test_key_valid"), \
         patch.object(default_ai_service, "get_client", return_value=mock_client):

        payload = {"symbol": "TCS.NS", "question": "Explain TCS momentum."}
        response = client.post("/api/ai/analyze", json=payload)
        assert response.status_code == 200
        data = response.json()
        analysis = data["analysis"]
        assert analysis["summary"] != ""
        assert raw_plain_text in analysis["interpretation"]


def test_ai_analyze_rate_limit_error(client: TestClient):
    """POST /api/ai/analyze translates Gemini 429 quota error to AIRateLimitError."""
    mock_error = APIError(429, {"error": {"message": "Resource exhausted: rate limit exceeded."}})

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = mock_error

    with patch.object(settings, "gemini_api_key", "test_key_valid"), \
         patch.object(default_ai_service, "get_client", return_value=mock_client):

        payload = {"symbol": "INFY.NS", "question": "Explain RSI."}
        response = client.post("/api/ai/analyze", json=payload)
        assert response.status_code == 429
        data = response.json()
        assert data["error_code"] == "AI_RATE_LIMIT"


def test_ai_analyze_timeout_error(client: TestClient):
    """POST /api/ai/analyze translates Gemini 504 deadline error to AITimeoutError."""
    mock_error = APIError(504, {"error": {"message": "Deadline exceeded waiting for Gemini upstream."}})

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = mock_error

    with patch.object(settings, "gemini_api_key", "test_key_valid"), \
         patch.object(default_ai_service, "get_client", return_value=mock_client):

        payload = {"symbol": "INFY.NS", "question": "Analyze volume."}
        response = client.post("/api/ai/analyze", json=payload)
        assert response.status_code == 504
        data = response.json()
        assert data["error_code"] == "AI_TIMEOUT"


def test_ai_context_construction_with_indicators_and_signal():
    """Verifies that gather_stock_context constructs a complete structured context."""
    df = generate_synthetic_crossover_data(75)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        context = gather_stock_context("RELIANCE.NS")

        assert context["symbol"] == "RELIANCE.NS"
        assert context["has_data"] is True
        assert "latest_close" in context
        assert "indicators" in context
        assert "SMA20" in context["indicators"]
        assert "RSI14" in context["indicators"]
        assert "rule_based_signal" in context
        assert context["rule_based_signal"]["signal"] in ["BUY", "SELL", "HOLD"]
        assert len(context["recent_5_sessions"]) == 5


def test_ai_context_construction_with_actual_backtest_metrics():
    """Verifies that gather_stock_context integrates actual Stage 4 backtest metrics."""
    df = generate_synthetic_crossover_data(80)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        req = BacktestRequest(
            symbol="TCS.NS",
            strategy=StrategyType.SMA_CROSSOVER,
            fast_period=5,
            slow_period=15,
            initial_capital=100000.0,
            brokerage_pct=0.05,
            slippage_pct=0.02,
        )
        bt_res = BacktestEngine(df, req).run()

        # Context gather with backtest_id
        context = gather_stock_context("TCS.NS", backtest_id=bt_res.backtest_id)

        assert "backtest_data" in context
        bt_ctx = context["backtest_data"]
        assert bt_ctx["backtest_id"] == bt_res.backtest_id
        assert bt_ctx["net_return"] == bt_res.net_return
        assert bt_ctx["max_drawdown_pct"] == bt_res.max_drawdown_pct
        assert bt_ctx["sharpe_ratio"] == bt_res.sharpe_ratio
        assert bt_ctx["total_trades"] == bt_res.total_trades


def test_ai_context_missing_stock_data():
    """Verifies that gather_stock_context gracefully marks has_data=False when data unavailable."""
    with patch("app.services.market_data.default_market_provider.fetch_history", side_effect=Exception("No data")):
        context = gather_stock_context("MISSING.NS")
        assert context["has_data"] is False
        assert "unavailable" in context["uncertainty"].lower()


def test_ai_input_validation(client: TestClient):
    """Rejects empty questions or questions exceeding 1000 characters."""
    # Empty question
    res_empty = client.post("/api/ai/analyze", json={"symbol": "TCS.NS", "question": ""})
    assert res_empty.status_code == 422

    # Overly long question (> 1000 chars)
    res_long = client.post(
        "/api/ai/analyze", json={"symbol": "TCS.NS", "question": "a" * 1001}
    )
    assert res_long.status_code == 422


def test_groq_health_and_analyze(client: TestClient):
    """Verifies Groq provider health reporting and JSON synthesis mocking."""
    mock_groq_response = {
        "choices": [
            {
                "message": {
                    "content": '{"summary": "Groq synthesis complete.", "observed_facts": {"price": 1200.0}, "interpretation": "Constructive bullish base.", "supporting_evidence": ["Price > SMA20"], "key_risks": ["Drawdown risk"], "uncertainties": ["Market open"]}'
                }
            }
        ]
    }
    with patch.object(settings, "groq_api_key", "gsk_dummy_test_key"), \
         patch.object(settings, "gemini_api_key", None), \
         patch.object(default_ai_service, "_analyze_with_groq") as mock_groq_fn:
        
        from app.schemas.ai import StructuredAIAnalysis
        mock_groq_fn.return_value = (
            StructuredAIAnalysis(
                summary="Groq synthesis complete.",
                observed_facts={"price": 1200.0},
                interpretation="Constructive bullish base.",
                supporting_evidence=["Price > SMA20"],
                key_risks=["Drawdown risk"],
                uncertainties=["Market open"],
            ),
            settings.groq_model,
        )
        
        # Test health
        h_resp = client.get("/api/ai/health")
        assert h_resp.status_code == 200
        h_data = h_resp.json()
        assert h_data["status"] == "ready"
        assert h_data["configured"] is True
        assert h_data["provider"] == "Groq"

        # Test analyze
        payload = {"symbol": "RELIANCE.NS", "question": "Analyze momentum."}
        a_resp = client.post("/api/ai/analyze", json=payload)
        assert a_resp.status_code == 200
        a_data = a_resp.json()
        assert a_data["model"] == settings.groq_model
        assert a_data["analysis"]["summary"] == "Groq synthesis complete."
        assert a_data["analysis"]["observed_facts"]["price"] == 1200.0
