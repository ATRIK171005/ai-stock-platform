"""Tests for Stage 7 security hardening, input validation, headers, and concurrency."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.core.exceptions import InvalidAccountError
from app.db.session import Base, get_db
from app.main import app
from app.schemas.paper import OrderSide, OrderType, PaperOrderCreateRequest
from app.services.paper_trading import AccountLockManager, PaperTradingService, validate_account_id


# Isolated in-memory SQLite fixture for security & concurrency tests
@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_client_with_db(test_db_session):
    def override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_readiness_probe(client: TestClient):
    """GET /api/health/ready must return HTTP 200 with database connected status."""
    res = client.get("/api/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


def test_security_headers_injected(client: TestClient):
    """Responses must include secure headers to prevent clickjacking and MIME sniffing."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-xss-protection") == "1; mode=block"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"


def test_payload_size_limit_rejection(client: TestClient):
    """Payloads exceeding max body size limit must be rejected with HTTP 413."""
    headers = {"Content-Length": str(settings.max_request_body_size_bytes + 1000)}
    res = client.post(
        "/api/paper/orders",
        json={"symbol": "RELIANCE.NS", "side": "BUY", "quantity": 1},
        headers=headers,
    )
    assert res.status_code == 413
    assert res.json()["error_code"] == "PAYLOAD_TOO_LARGE"


def test_symbol_validation_prevents_injection(client: TestClient):
    """Malformed symbol strings containing SQL or control characters must return HTTP 400."""
    res = client.get("/api/stocks/RELIANCE;DROP TABLE/history")
    assert res.status_code == 400
    assert res.json()["error_code"] == "INVALID_SYMBOL"


def test_period_and_interval_validation(client: TestClient):
    """Unsupported period or interval values must be rejected with HTTP 400."""
    res1 = client.get("/api/stocks/RELIANCE.NS/history?period=invalid_period")
    assert res1.status_code == 400
    assert res1.json()["error_code"] == "VALIDATION_ERROR"

    res2 = client.get("/api/stocks/RELIANCE.NS/history?interval=2h")
    assert res2.status_code == 400
    assert res2.json()["error_code"] == "VALIDATION_ERROR"


def test_account_id_validation_prevents_path_traversal():
    """Account IDs with path traversal or invalid punctuation must raise InvalidAccountError."""
    with pytest.raises(InvalidAccountError):
        validate_account_id("../../etc/passwd")

    with pytest.raises(InvalidAccountError):
        validate_account_id("account;DROP")

    with pytest.raises(InvalidAccountError):
        validate_account_id("ab")  # less than 3 chars

    # Valid account IDs should pass
    assert validate_account_id("user_123") == "user_123"
    assert validate_account_id("portfolio-main.v1") == "portfolio-main.v1"


def test_account_lock_manager_concurrency():
    """AccountLockManager returns the same lock for identical account IDs and different locks for distinct IDs."""
    manager = AccountLockManager()
    lock_a1 = manager.get_lock("account_alpha")
    lock_a2 = manager.get_lock("account_alpha")
    lock_b = manager.get_lock("account_beta")

    assert lock_a1 is lock_a2
    assert lock_a1 is not lock_b


def test_api_secret_key_protection(test_client_with_db):
    """When API_SECRET_KEY is configured, paper routes without matching token return HTTP 403."""
    original_secret = settings.api_secret_key
    try:
        settings.api_secret_key = "super_secure_production_secret"

        # Request without header fails with 403
        res_unauth = test_client_with_db.get("/api/paper/account")
        assert res_unauth.status_code == 403
        assert res_unauth.json()["error_code"] == "UNAUTHORIZED_ACCOUNT"

        # Request with correct Bearer token succeeds
        headers = {"Authorization": "Bearer super_secure_production_secret"}
        res_auth = test_client_with_db.get("/api/paper/account", headers=headers)
        assert res_auth.status_code == 200

        # Request with X-API-Key header succeeds
        headers_api_key = {"X-API-Key": "super_secure_production_secret"}
        res_api_key = test_client_with_db.get("/api/paper/account", headers=headers_api_key)
        assert res_api_key.status_code == 200
    finally:
        settings.api_secret_key = original_secret


def test_database_transaction_rollback_on_failure(test_db_session):
    """If an error occurs mid-transaction, cash and positions are not partially modified."""
    service = PaperTradingService()
    account = service.get_or_create_account(test_db_session, "rollback_test_account")
    initial_cash = account.cash_balance

    # Attempt an order for an invalid / zero price stock
    req = PaperOrderCreateRequest(
        symbol="NONEXISTENT_MOCK_XYZ",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=10,
    )

    try:
        service.place_order(test_db_session, req, account_id="rollback_test_account")
    except Exception:
        pass

    test_db_session.rollback()

    # Re-query account and verify cash was untouched
    account_after = service.get_or_create_account(test_db_session, "rollback_test_account")
    assert account_after.cash_balance == initial_cash
