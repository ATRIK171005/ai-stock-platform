"""Deterministic unit and integration tests for Personal Risk Guardian pre-trade evaluations and order enforcement."""
from decimal import Decimal
from unittest.mock import patch
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import RiskLimitViolationError
from app.db.models import Base, PaperAccountModel
from app.db.session import get_db
from app.main import app
from app.schemas.paper import OrderSide, OrderType, PaperOrderCreateRequest
from app.schemas.risk_guardian import PreTradeAssessmentRequest, RiskAssessmentOutcome
from app.services.paper_trading import default_paper_service
from app.services.risk_guardian import risk_guardian_service


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        # Seed test account with ₹100,000
        acc = PaperAccountModel(
            id="test_risk_acc",
            user_id="test_user",
            initial_balance=Decimal("100000.00"),
            cash_balance=Decimal("100000.00"),
            realized_pnl=Decimal("0.00"),
            total_fees_paid=Decimal("0.00"),
            daily_realized_loss=Decimal("0.00"),
            daily_loss_date="2026-10-26",
            currency="INR",
        )
        session.add(acc)
        session.commit()
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_stock_df():
    """Generates synthetic stock data with Close at ₹1,000."""
    dates = pd.date_range("2026-10-20", periods=5, freq="B")
    return pd.DataFrame(
        {
            "Open": [995.0] * 5,
            "High": [1010.0] * 5,
            "Low": [990.0] * 5,
            "Close": [1000.0] * 5,
            "Volume": [100000] * 5,
        },
        index=dates,
    )


def test_approved_pre_trade_order(db_session, mock_stock_df):
    """Verifies that an order meeting all risk rules receives an APPROVED outcome."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="RELIANCE.NS",
            side="BUY",
            quantity=10,  # 10 * 1000 = ₹10,000 (well within ₹50k limit & 25% allocation)
            stop_loss_price=950.0,
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.APPROVED
        assert len(assessment.hard_breaches) == 0
        assert assessment.estimated_order_value == 10000.0
        assert assessment.projected_allocation_pct == 10.0


def test_soft_warning_near_threshold(db_session, mock_stock_df):
    """Verifies that an order nearing the 80% allocation or order value threshold triggers WARNING."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="RELIANCE.NS",
            side="BUY",
            quantity=22,  # 22 * 1000 = ₹22,000 (22% allocation, which is > 80% of 25% allocation cap)
            stop_loss_price=960.0,
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.WARNING
        assert len(assessment.hard_breaches) == 0
        assert any("approaches" in w or "close" in w for w in assessment.soft_warnings)


def test_blocked_exceeding_max_order_value(db_session, mock_stock_df):
    """Verifies that an order exceeding max order limit (₹50,000) is BLOCKED."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="RELIANCE.NS",
            side="BUY",
            quantity=60,  # 60 * 1000 = ₹60,000 > ₹50,000
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.BLOCKED
        assert any("max order limit" in b.lower() for b in assessment.hard_breaches)


def test_blocked_exceeding_allocation_cap(db_session, mock_stock_df):
    """Verifies that an order pushing single-stock allocation beyond 25% is BLOCKED."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="RELIANCE.NS",
            side="BUY",
            quantity=30,  # ₹30,000 = 30% of ₹100k equity > 25% cap
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.BLOCKED
        assert any("position limit" in b.lower() for b in assessment.hard_breaches)


def test_blocked_missing_required_stop_loss(db_session, mock_stock_df):
    """Verifies that when profile mandates stop loss, BUY order without stop loss is BLOCKED."""
    # Update profile to require stop loss
    profile = risk_guardian_service.get_or_create_risk_profile(db_session, "test_risk_acc")
    profile.require_stop_loss = True
    db_session.commit()

    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="TCS.NS",
            side="BUY",
            quantity=10,
            stop_loss_price=None,  # Missing mandatory stop-loss
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.BLOCKED
        assert any("Mandatory Stop-Loss required" in b for b in assessment.hard_breaches)


def test_blocked_invalid_stop_loss_price(db_session, mock_stock_df):
    """Verifies that a stop-loss price >= current market price for a BUY is rejected."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df):
        req = PreTradeAssessmentRequest(
            symbol="INFY.NS",
            side="BUY",
            quantity=10,
            stop_loss_price=1050.0,  # Invalid: above market price of ₹1000
            account_id="test_risk_acc",
        )
        assessment = risk_guardian_service.assess_pre_trade_risk(db_session, req)
        assert assessment.outcome == RiskAssessmentOutcome.BLOCKED
        assert any("must be strictly below" in b for b in assessment.hard_breaches)


def test_order_submission_mandatory_enforcement_blocks_violation(db_session, mock_stock_df):
    """Verifies that submitting a violating order via place_order raises RiskLimitViolationError."""
    with patch("app.services.risk_guardian.default_market_provider.fetch_history", return_value=mock_stock_df), \
         patch("app.services.paper_trading.default_market_provider.fetch_history", return_value=mock_stock_df):

        # Attempt to order ₹60,000 (exceeds ₹50,000 max order limit)
        order_req = PaperOrderCreateRequest(
            symbol="RELIANCE.NS",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=60,
        )

        with pytest.raises(RiskLimitViolationError) as exc_info:
            default_paper_service.place_order(db=db_session, req=order_req, account_id="test_risk_acc")

        assert "Pre-Trade Risk Guardian Check Failed" in str(exc_info.value)


def test_risk_profile_crud_endpoints(client):
    """Verifies GET /api/risk/profile and PUT /api/risk/profile endpoints."""
    # 1. Fetch default profile
    res = client.get("/api/risk/profile?account_id=test_risk_acc")
    assert res.status_code == 200
    data = res.json()
    assert data["max_order_value"] == 50000.0
    assert data["require_stop_loss"] is False

    # 2. Update profile
    update_payload = {
        "account_id": "test_risk_acc",
        "max_order_value": 40000.0,
        "max_position_allocation_pct": 20.0,
        "max_open_positions": 4,
        "max_daily_loss_pct": 4.0,
        "max_risk_per_trade_pct": 1.5,
        "require_stop_loss": True,
        "max_portfolio_concentration_pct": 45.0,
        "version": 1,
    }
    put_res = client.put("/api/risk/profile?account_id=test_risk_acc", json=update_payload)
    assert put_res.status_code == 200
    updated_data = put_res.json()
    assert updated_data["max_order_value"] == 40000.0
    assert updated_data["require_stop_loss"] is True
    assert updated_data["version"] == 2
