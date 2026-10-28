"""Deterministic unit tests for Strategy Doctor walk-forward validation and robustness scoring."""
from unittest.mock import patch
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.strategy_doctor import StrategyDoctorRequest
from app.services.strategy_doctor import strategy_doctor_service


@pytest.fixture
def mock_candles_df() -> pd.DataFrame:
    """Generates 180 synthetic chronological daily candles for testing."""
    dates = pd.date_range(start="2024-01-01", periods=180, freq="B")
    np.random.seed(42)
    # Generate random walk with slight upward drift
    returns = np.random.normal(0.001, 0.015, size=180)
    prices = 1000.0 * np.cumprod(1 + returns)

    df = pd.DataFrame(
        {
            "Open": prices * 0.998,
            "High": prices * 1.012,
            "Low": prices * 0.990,
            "Close": prices,
            "Volume": np.random.randint(100000, 500000, size=180),
        },
        index=dates,
    )
    return df


def test_strategy_doctor_chronological_splits(mock_candles_df):
    """Verifies that walk-forward splits are strictly non-overlapping and chronological."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        req = StrategyDoctorRequest(
            symbol="RELIANCE.NS",
            fast_period=10,
            slow_period=30,
            train_pct=50.0,
            validation_pct=25.0,
            test_pct=25.0,
        )
        report = strategy_doctor_service.analyze_strategy(req)

        assert report.train_period.period_name == "Train"
        assert report.validation_period.period_name == "Validation"
        assert report.test_period.period_name == "Test (Out-of-Sample)"

        # Verify chronology
        assert report.train_period.start_date < report.train_period.end_date
        assert report.train_period.end_date < report.validation_period.start_date
        assert report.validation_period.end_date < report.test_period.start_date

        # Total sample counts
        total_bars = len(mock_candles_df)
        assert (
            report.train_period.candles_count
            + report.validation_period.candles_count
            + report.test_period.candles_count
        ) == total_bars


def test_parameter_sensitivity_grid_isolation(mock_candles_df):
    """Verifies parameter grid is evaluated strictly without fast >= slow pairs."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        req = StrategyDoctorRequest(
            symbol="INFY.NS",
            fast_period=15,
            slow_period=40,
        )
        report = strategy_doctor_service.analyze_strategy(req)

        for pt in report.parameter_sensitivity:
            assert pt.fast_period < pt.slow_period, f"Found invalid pair: {pt.fast_period} >= {pt.slow_period}"

        assert report.sensitivity_summary.tested_combinations > 0
        assert 0.0 <= report.sensitivity_summary.profitable_ratio_pct <= 100.0


def test_cost_stress_testing_increases_friction(mock_candles_df):
    """Verifies that elevated and severe transaction costs decrease net returns."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        req = StrategyDoctorRequest(
            symbol="TCS.NS",
            fast_period=10,
            slow_period=25,
            brokerage_pct=0.05,
            slippage_pct=0.02,
        )
        report = strategy_doctor_service.analyze_strategy(req)
        stress = report.cost_stress_test

        assert len(stress) == 3
        baseline = stress[0]
        elevated = stress[1]
        severe = stress[2]

        assert "Baseline" in baseline.tier
        assert "Elevated" in elevated.tier
        assert "Severe" in severe.tier

        assert baseline.brokerage_pct < elevated.brokerage_pct < severe.brokerage_pct
        assert baseline.total_costs <= elevated.total_costs <= severe.total_costs
        assert baseline.net_return >= elevated.net_return >= severe.net_return


def test_trade_concentration_metrics(mock_candles_df):
    """Verifies calculation of top 1 and top 3 winning trade concentration shares."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        req = StrategyDoctorRequest(
            symbol="HDFCBANK.NS",
            fast_period=5,
            slow_period=20,
        )
        report = strategy_doctor_service.analyze_strategy(req)
        tc = report.trade_concentration

        assert tc.total_trades >= 0
        assert 0.0 <= tc.top_1_share_pct <= 100.0
        assert 0.0 <= tc.top_3_share_pct <= 100.0
        if tc.winning_trades >= 3:
            assert tc.top_3_share_pct >= tc.top_1_share_pct


def test_robustness_score_reproducibility(mock_candles_df):
    """Verifies that heuristic score calculation is deterministic and 100% reproducible."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        req = StrategyDoctorRequest(
            symbol="RELIANCE.NS",
            fast_period=12,
            slow_period=35,
        )
        report1 = strategy_doctor_service.analyze_strategy(req)
        report2 = strategy_doctor_service.analyze_strategy(req)

        assert report1.robustness_score.overall_score == report2.robustness_score.overall_score
        assert report1.robustness_score.rating == report2.robustness_score.rating
        assert 0.0 <= report1.robustness_score.overall_score <= 100.0


def test_insufficient_historical_data_raises_error():
    """Verifies that an error is raised when historical data has fewer than 60 candles."""
    short_df = pd.DataFrame(
        {"Close": [100.0] * 20, "Open": [100.0] * 20, "High": [101.0] * 20, "Low": [99.0] * 20, "Volume": [1000] * 20},
        index=pd.date_range("2024-01-01", periods=20, freq="B"),
    )
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=short_df):
        req = StrategyDoctorRequest(symbol="SHORT.NS", fast_period=5, slow_period=15)
        with pytest.raises(Exception):
            strategy_doctor_service.analyze_strategy(req)


def test_api_endpoints_strategy_doctor(mock_candles_df):
    """Verifies FastAPI endpoints POST /analyze, GET /{id}, and POST /{id}/explain."""
    with patch("app.services.strategy_doctor.default_market_provider.fetch_history", return_value=mock_candles_df):
        client = TestClient(app)

        # 1. Analyze endpoint
        payload = {
            "symbol": "RELIANCE.NS",
            "fast_period": 10,
            "slow_period": 30,
            "train_pct": 50.0,
            "validation_pct": 25.0,
            "test_pct": 25.0,
        }
        res = client.post("/api/strategy-doctor/analyze", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert "analysis_id" in data
        assert "robustness_score" in data
        analysis_id = data["analysis_id"]

        # 2. Get by ID
        get_res = client.get(f"/api/strategy-doctor/{analysis_id}")
        assert get_res.status_code == 200
        assert get_res.json()["analysis_id"] == analysis_id

        # 3. Explain endpoint (fallback when key is absent/mocked)
        exp_res = client.post(f"/api/strategy-doctor/{analysis_id}/explain")
        assert exp_res.status_code == 200
        assert exp_res.json()["ai_explanation"] is not None
        assert len(exp_res.json()["ai_explanation"]) > 20
