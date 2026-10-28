"""Tests for health and diagnostic endpoints."""
from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"
    assert data["data_provider"] == "YAHOO_FINANCE"
    assert data["provider_status"] == "ready"
    assert "timestamp" in data


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "MarketIQ" in data["message"]
    assert data["docs_url"] == "/docs"
