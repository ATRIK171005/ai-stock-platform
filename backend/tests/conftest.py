"""Pytest fixtures and synthetic market data generators."""
from datetime import datetime, timedelta
from typing import Generator
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Test client for FastAPI test suite."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def synthetic_candles_100() -> pd.DataFrame:
    """Generates 100 days of deterministic OHLCV candles."""
    start_date = datetime(2024, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(100)]

    np.random.seed(42)
    base = 1000.0
    records = []

    current = base
    for d in dates:
        open_p = current
        close_p = open_p * (1.0 + np.random.uniform(-0.01, 0.015))
        high_p = max(open_p, close_p) * 1.01
        low_p = min(open_p, close_p) * 0.99
        volume = int(np.random.uniform(500000, 2000000))

        records.append({
            "Date": d,
            "Open": round(open_p, 2),
            "High": round(high_p, 2),
            "Low": round(low_p, 2),
            "Close": round(close_p, 2),
            "Volume": volume,
        })
        current = close_p

    df = pd.DataFrame(records)
    return df.set_index("Date")


@pytest.fixture
def synthetic_crossover_buy() -> pd.DataFrame:
    """Creates a deterministic dataset where SMA20 crosses above SMA50 at the last row."""
    dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(70)]

    closes = [200.0 - (i * 0.2) for i in range(68)]
    closes.append(280.0)
    closes.append(310.0)

    records = []
    for d, c in zip(dates, closes):
        records.append({
            "Date": d,
            "Open": c * 0.99,
            "High": c * 1.01,
            "Low": c * 0.98,
            "Close": c,
            "Volume": 1000000,
        })
    df = pd.DataFrame(records)
    return df.set_index("Date")


@pytest.fixture
def synthetic_crossover_sell() -> pd.DataFrame:
    """Creates a deterministic dataset where SMA20 crosses below SMA50 at the last row."""
    closes = [100.0] * 50 + [101.0] * 18 + [70.0]
    dates = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(len(closes))]

    records = []
    for d, c in zip(dates, closes):
        records.append({
            "Date": d,
            "Open": c * 1.01,
            "High": c * 1.02,
            "Low": c * 0.99,
            "Close": c,
            "Volume": 1000000,
        })
    df = pd.DataFrame(records)
    return df.set_index("Date")
