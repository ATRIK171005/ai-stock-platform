"""Unit and integration tests for User Authentication, Session Tokens, and Multi-Account Management."""
import pytest
from fastapi.testclient import TestClient


def test_auth_register_and_login_flow(client: TestClient):
    """POST /api/auth/register creates user and primary portfolio; login authenticates correctly."""
    import uuid
    uid = uuid.uuid4().hex[:8]
    email = f"trader_{uid}@marketiq.in"
    username = f"quant_{uid}"
    password = "SuperSecretPassword123!"

    # 1. Register new user
    reg_resp = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
            "full_name": "Quant Alpha Trader",
        },
    )
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == email
    assert reg_data["user"]["username"] == username
    assert reg_data["user"]["full_name"] == "Quant Alpha Trader"
    assert len(reg_data["accounts"]) >= 1
    assert reg_data["accounts"][0]["name"] == "Primary Portfolio"
    assert reg_data["accounts"][0]["cash_balance"] == 100000.0

    token = reg_data["access_token"]

    # 2. Duplicate registration rejected
    dup_resp = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": "different_username",
            "password": password,
        },
    )
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"].lower()

    # 3. Login with correct credentials
    login_resp = client.post(
        "/api/auth/login",
        json={
            "username_or_email": username,
            "password": password,
        },
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert login_data["user"]["username"] == username
    assert "access_token" in login_data

    # 4. Login with incorrect password
    wrong_resp = client.post(
        "/api/auth/login",
        json={
            "username_or_email": username,
            "password": "WrongPassword999",
        },
    )
    assert wrong_resp.status_code == 401
    assert "invalid" in wrong_resp.json()["detail"].lower()

    # 5. GET /api/auth/me with bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["user"]["email"] == email

    # 6. GET /api/auth/me without token fails with 401
    unauth_resp = client.get("/api/auth/me")
    assert unauth_resp.status_code == 401


def test_auth_demo_login_endpoint(client: TestClient):
    """POST /api/auth/demo provides 1-click access to the pre-seeded demo trading account."""
    resp = client.post("/api/auth/demo")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["username"] == "demotrader"
    assert "access_token" in data
    assert len(data["accounts"]) >= 1


def test_add_account_and_multi_portfolio_isolation(client: TestClient):
    """POST /api/paper/accounts creates new isolated portfolios; orders are segregated."""
    import uuid
    uid = uuid.uuid4().hex[:8]
    # Register user
    reg_resp = client.post(
        "/api/auth/register",
        json={
            "email": f"multi_{uid}@test.in",
            "username": f"multi_{uid}",
            "password": "SecurePassword123!",
            "full_name": "Multi Account Trader",
        },
    )
    assert reg_resp.status_code == 201
    reg = reg_resp.json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    primary_acc_id = reg["active_account_id"]

    # 1. Create a second portfolio: "HFT Momentum Alpha" with ₹250,000
    new_acc_resp = client.post(
        "/api/paper/accounts",
        headers=headers,
        json={
            "name": "HFT Momentum Alpha",
            "initial_balance": 250000.0,
            "currency": "INR",
        },
    )
    assert new_acc_resp.status_code == 200
    new_acc = new_acc_resp.json()
    assert new_acc["name"] == "HFT Momentum Alpha"
    assert new_acc["initial_balance"] == 250000.0
    assert new_acc["cash_balance"] == 250000.0
    hft_acc_id = new_acc["id"]
    assert hft_acc_id != primary_acc_id

    # 2. List accounts for user
    list_resp = client.get("/api/paper/accounts", headers=headers)
    assert list_resp.status_code == 200
    accounts = list_resp.json()
    assert len(accounts) >= 2
    acc_names = [a["name"] for a in accounts]
    assert "Primary Portfolio" in acc_names
    assert "HFT Momentum Alpha" in acc_names

    # 3. Place order specifically in the HFT Momentum Alpha account
    order_resp = client.post(
        "/api/paper/orders",
        headers={"Authorization": f"Bearer {token}", "X-Account-ID": hft_acc_id},
        json={
            "symbol": "RELIANCE.NS",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 10,
        },
    )
    assert order_resp.status_code == 200
    assert order_resp.json()["status"] == "EXECUTED"

    # 4. Check positions in HFT account vs Primary account
    hft_pos_resp = client.get(
        "/api/paper/positions",
        headers={"Authorization": f"Bearer {token}", "X-Account-ID": hft_acc_id},
    )
    assert hft_pos_resp.status_code == 200
    hft_positions = hft_pos_resp.json()
    assert len(hft_positions) == 1
    assert hft_positions[0]["symbol"] == "RELIANCE.NS"
    assert hft_positions[0]["quantity"] == 10

    # Primary account must have ZERO positions (complete portfolio isolation)
    prim_pos_resp = client.get(
        "/api/paper/positions",
        headers={"Authorization": f"Bearer {token}", "X-Account-ID": primary_acc_id},
    )
    assert prim_pos_resp.status_code == 200
    assert len(prim_pos_resp.json()) == 0
