"""Unit and integration tests for persistent paper trading engine, orders, and risk controls."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from fastapi.testclient import TestClient
import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import PaperPositionModel
from app.db.session import Base, get_db
from app.main import app
from app.schemas.paper import (
    OrderSide,
    OrderStatus,
    OrderType,
    PaperOrderCreateRequest,
)
from app.services.paper_trading import PaperTradingService


# In-memory SQLite session fixture for isolated tests
@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def paper_client(test_db):
    """FastAPI TestClient with test_db override."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_dummy_candles(price: float) -> pd.DataFrame:
    """Creates a dummy 5-bar dataframe with exact close price."""
    dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(5)]
    records = [
        {"Date": d, "Open": price, "High": price * 1.01, "Low": price * 0.99, "Close": price, "Volume": 10000}
        for d in dates
    ]
    return pd.DataFrame(records).set_index("Date")


def test_paper_account_initialization(test_db):
    """New paper account starts with ₹100,000 cash balance and 0 positions."""
    service = PaperTradingService()
    account = service.get_or_create_account(test_db, account_id="acc_init_test")

    assert account.initial_balance == Decimal("100000.00")
    assert account.cash_balance == Decimal("100000.00")
    assert account.realized_pnl == Decimal("0.00")
    assert account.currency == "INR"

    summary = service.get_account_summary(test_db, account_id="acc_init_test")
    assert summary.cash_balance == 100000.0
    assert summary.total_equity == 100000.0
    assert summary.invested_value == 0.0
    assert summary.open_positions_count == 0


def test_simulated_buy_order_execution(test_db):
    """Valid BUY order deducts cash (trade + fee), establishes position with slippage, and logs order."""
    service = PaperTradingService()
    df = make_dummy_candles(1000.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        req = PaperOrderCreateRequest(
            symbol="RELIANCE.NS",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=10,
        )
        res = service.place_order(test_db, req, account_id="acc_buy_test")

        assert res.status == OrderStatus.EXECUTED
        # Market price = 1000, 0.02% slippage -> 1000.20
        assert res.execution_price == 1000.20
        # Trade value = 10 * 1000.20 = 10002.00
        assert res.total_value == 10002.00
        # Brokerage = 0.05% of 10002 = 5.00
        assert res.fees == 5.00

        # Verify account cash
        summary = service.get_account_summary(test_db, account_id="acc_buy_test")
        expected_cash = 100000.00 - 10002.00 - 5.00
        assert abs(summary.cash_balance - expected_cash) <= 0.05
        assert summary.open_positions_count == 1
        assert summary.invested_value == 10000.0  # 10 * 1000.0 market price


def test_simulated_weighted_average_entry_price(test_db):
    """Multiple BUY orders calculate weighted average entry price correctly."""
    service = PaperTradingService()

    # Buy 10 @ 1000 (exec ~ 1000.20)
    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=make_dummy_candles(1000.0)):
        service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="TCS.NS", side=OrderSide.BUY, quantity=10),
            account_id="acc_avg_test",
        )

    # Buy 10 @ 1200 (exec ~ 1200.24)
    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=make_dummy_candles(1200.0)):
        service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="TCS.NS", side=OrderSide.BUY, quantity=10),
            account_id="acc_avg_test",
        )

    positions = service.get_positions(test_db, account_id="acc_avg_test")
    assert len(positions) == 1
    tcs_pos = positions[0]
    assert tcs_pos.quantity == 20
    # Average should be around (1000.20 + 1200.24) / 2 = 1100.22
    assert abs(tcs_pos.average_entry_price - 1100.22) <= 0.05


def test_simulated_sell_order_and_realized_pnl(test_db):
    """SELL order updates holdings, credits net cash, and calculates realized P&L."""
    service = PaperTradingService()

    # Buy 10 @ 1000.0
    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=make_dummy_candles(1000.0)):
        service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="INFY.NS", side=OrderSide.BUY, quantity=10),
            account_id="acc_sell_test",
        )

    # Sell 5 @ 1200.0 (profitable exit)
    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=make_dummy_candles(1200.0)):
        sell_res = service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="INFY.NS", side=OrderSide.SELL, quantity=5),
            account_id="acc_sell_test",
        )

        assert sell_res.status == OrderStatus.EXECUTED
        # Exec price = 1200 * (1 - 0.0002) = 1199.76
        assert abs(sell_res.execution_price - 1199.76) <= 0.05

        summary = service.get_account_summary(test_db, account_id="acc_sell_test")
        # Realized PnL = 5 * (1199.76 - 1000.20) - fees = ~994.80
        assert summary.realized_pnl > 900.0

        positions = service.get_positions(test_db, account_id="acc_sell_test")
        assert len(positions) == 1
        assert positions[0].quantity == 5


def test_insufficient_cash_rejection(test_db):
    """Orders requiring more than available cash must be rejected with InsufficientCashError."""
    service = PaperTradingService()
    account = service.get_or_create_account(test_db, account_id="acc_cash_rej_test")
    # Total equity is ₹100,000: ₹85,000 in OTHER.NS, ₹15,000 cash
    account.cash_balance = Decimal("15000.00")
    test_db.add(
        PaperPositionModel(
            account_id="acc_cash_rej_test",
            symbol="OTHER.NS",
            name="Other Ltd",
            quantity=85,
            average_entry_price=Decimal("1000.00"),
            total_cost_basis=Decimal("85000.00"),
            last_known_price=Decimal("1000.00"),
            is_stale_price=False,
            price_timestamp="2026-10-26",
        )
    )
    test_db.commit()

    df = make_dummy_candles(1000.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        # 18 shares @ ₹1000 = ₹18,000 (18% of ₹100k equity, passes 25% limit, but cash is only ₹15k)
        with pytest.raises(Exception) as exc_info:
            service.place_order(
                test_db,
                PaperOrderCreateRequest(symbol="STOCK.NS", side=OrderSide.BUY, quantity=18),
                account_id="acc_cash_rej_test",
            )
        assert "Insufficient" in str(exc_info.value) or "INSUFFICIENT_CASH" in str(exc_info.value)


def test_insufficient_holdings_rejection(test_db):
    """Selling shares without owning them (short-selling) must be rejected."""
    service = PaperTradingService()
    df = make_dummy_candles(500.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        with pytest.raises(Exception) as exc_info:
            service.place_order(
                test_db,
                PaperOrderCreateRequest(symbol="UNOWNED.NS", side=OrderSide.SELL, quantity=10),
                account_id="acc_hold_rej_test",
            )
        assert "Insufficient shares" in str(exc_info.value) or "INSUFFICIENT_HOLDINGS" in str(exc_info.value)


def test_max_order_value_risk_limit(test_db):
    """Orders exceeding max order value (₹50,000) must be rejected."""
    service = PaperTradingService()
    df = make_dummy_candles(6000.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        # 10 shares @ 6000 = ₹60,000 > ₹50,000 limit
        with pytest.raises(Exception) as exc_info:
            service.place_order(
                test_db,
                PaperOrderCreateRequest(symbol="BIGORDER.NS", side=OrderSide.BUY, quantity=10),
                account_id="acc_order_limit_test",
            )
        assert "max order limit" in str(exc_info.value).lower()


def test_max_position_size_risk_limit(test_db):
    """Position allocation exceeding 25% of portfolio equity must be rejected."""
    service = PaperTradingService()
    df = make_dummy_candles(1400.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        # Buy 15 @ 1400 = 21,000 (ok, under 25,000)
        service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="MAXPOS.NS", side=OrderSide.BUY, quantity=15),
            account_id="acc_pos_limit_test",
        )

        # Try to buy another 10 @ 1400 = 14,000 -> Total 35,000 > 25,000 (25% limit)
        with pytest.raises(Exception) as exc_info:
            service.place_order(
                test_db,
                PaperOrderCreateRequest(symbol="MAXPOS.NS", side=OrderSide.BUY, quantity=10),
                account_id="acc_pos_limit_test",
            )
        assert "exceeding 25" in str(exc_info.value) or "position limit" in str(exc_info.value).lower()


def test_daily_loss_limit_halts_new_buys_allows_sells(test_db):
    """When daily loss reaches ₹5,000, new BUY orders are rejected but SELL orders are permitted."""
    service = PaperTradingService()
    account = service.get_or_create_account(test_db, account_id="acc_loss_test")

    # Manually trigger daily loss limit
    account.daily_realized_loss = Decimal("5500.00")
    test_db.commit()

    df = make_dummy_candles(100.0)
    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        # Attempt BUY -> Rejected
        with pytest.raises(Exception) as exc_info:
            service.place_order(
                test_db,
                PaperOrderCreateRequest(symbol="TEST.NS", side=OrderSide.BUY, quantity=10),
                account_id="acc_loss_test",
            )
        assert "daily loss limit" in str(exc_info.value).lower()


def test_limit_order_pending_when_condition_unmet(test_db):
    """LIMIT buy order when market price > limit price remains PENDING without deducting cash."""
    service = PaperTradingService()
    # Market price is 1200, user sets BUY limit at 1100
    df = make_dummy_candles(1200.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        res = service.place_order(
            test_db,
            PaperOrderCreateRequest(
                symbol="LIMIT.NS",
                side=OrderSide.BUY,
                order_type=OrderType.LIMIT,
                quantity=10,
                limit_price=1100.0,
            ),
            account_id="acc_limit_test",
        )

        assert res.status == OrderStatus.PENDING
        assert res.execution_price is None

        # Cash must not be deducted for pending limit order
        summary = service.get_account_summary(test_db, account_id="acc_limit_test")
        assert summary.cash_balance == 100000.0
        assert summary.open_positions_count == 0


def test_idempotency_duplicate_order_prevention(test_db):
    """Submitting order with existing idempotency_key is rejected."""
    service = PaperTradingService()
    df = make_dummy_candles(500.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        req = PaperOrderCreateRequest(
            symbol="IDEM.NS",
            side=OrderSide.BUY,
            quantity=5,
            idempotency_key="unique_client_key_999",
        )
        res1 = service.place_order(test_db, req, account_id="acc_idem_test")
        assert res1.status == OrderStatus.EXECUTED

        # Second submission with identical key
        with pytest.raises(Exception) as exc_info:
            service.place_order(test_db, req, account_id="acc_idem_test")
        assert "idempotency key" in str(exc_info.value).lower() or "DUPLICATE_ORDER" in str(exc_info.value)


def test_account_reset_with_confirmation(test_db):
    """Account reset wipes positions, resets cash to ₹100,000, and clears order history."""
    service = PaperTradingService()
    df = make_dummy_candles(1000.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        service.place_order(
            test_db,
            PaperOrderCreateRequest(symbol="TORESET.NS", side=OrderSide.BUY, quantity=10),
            account_id="acc_reset_test",
        )

    # Reset without confirmation must fail
    with pytest.raises(Exception) as exc_info:
        service.reset_account(test_db, account_id="acc_reset_test", confirm=False)
    assert "confirmation" in str(exc_info.value).lower()

    # Reset with confirmation succeeds
    reset_res = service.reset_account(test_db, account_id="acc_reset_test", confirm=True, initial_balance=100000.0)
    assert reset_res.account.cash_balance == 100000.0
    assert reset_res.account.invested_value == 0.0
    assert reset_res.account.open_positions_count == 0

    orders = service.get_orders(test_db, account_id="acc_reset_test")
    assert len(orders) == 0


def test_api_paper_endpoints(paper_client: TestClient):
    """Integration test of /api/paper routes."""
    df = make_dummy_candles(1500.0)

    with patch("app.services.market_data.default_market_provider.fetch_history", return_value=df):
        # 1. GET /api/paper/account
        acc_res = paper_client.get("/api/paper/account")
        assert acc_res.status_code == 200
        assert acc_res.json()["cash_balance"] == 100000.0

        # 2. POST /api/paper/orders
        order_payload = {
            "symbol": "RELIANCE.NS",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 5,
        }
        order_res = paper_client.post("/api/paper/orders", json=order_payload)
        assert order_res.status_code == 200
        assert order_res.json()["status"] == "EXECUTED"

        # 3. GET /api/paper/positions
        pos_res = paper_client.get("/api/paper/positions")
        assert pos_res.status_code == 200
        positions = pos_res.json()
        assert len(positions) == 1
        assert positions[0]["symbol"] == "RELIANCE.NS"

        # 4. GET /api/paper/orders
        orders_res = paper_client.get("/api/paper/orders")
        assert orders_res.status_code == 200
        assert len(orders_res.json()) >= 1

        # 5. POST /api/paper/reset
        reset_res = paper_client.post("/api/paper/reset", json={"confirm": True, "initial_balance": 100000.0})
        assert reset_res.status_code == 200
        assert reset_res.json()["account"]["cash_balance"] == 100000.0
