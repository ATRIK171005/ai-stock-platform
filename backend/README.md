# MarketIQ Backend API (FastAPI)

FastAPI-powered quantitative analysis engine and historical market data provider for Indian equities (NSE/BSE).

## Features

- **Pluggable Market Data Engine:** Abstract provider interface with `yfinance` implementation, automatic symbol normalization (`.NS` / `.BO`), request validation, and in-memory TTL caching.
- **Quantitative Technical Indicators:** Chronological computation of SMA 20/50, EMA 12/26, RSI-14 (Wilder's smoothing), MACD (12, 26, 9), and ATR-14. Insufficient warm-up values are assigned `null`, never `0`.
- **Deterministic Signal Engine:** Evaluates moving average crossover transitions (Golden Cross / Death Cross / Trend Hold) between prior and current candles, generating explainable rationale, risk factors, and dynamic pivot levels.
- **RESTful Endpoints:**
  - `GET /api/health`: Health status and provider readiness.
  - `GET /api/stocks/search?q={query}`: Search Indian stock symbols.
  - `GET /api/stocks/{symbol}/history?period={period}&interval={interval}`: Historical OHLCV candles.
  - `GET /api/stocks/{symbol}/indicators?period={period}&interval={interval}`: Historical candles with technical indicators.
  - `GET /api/stocks/{symbol}/signal?period={period}&interval={interval}`: Rule-based trading signal.

---

## Setup & Execution (Windows PowerShell)

### 1. Create Virtual Environment & Install Dependencies
```powershell
cd "C:\Users\Atrik Samanta\ai-stock-platform\backend"
python -m venv venv
.\venv\Scripts\pip.exe install -r requirements.txt
```

### 2. Run the Test Suite
```powershell
.\venv\Scripts\python.exe -m pytest -v
```
All 26 unit and integration tests run deterministically using mocked fixtures without depending on external network availability.

### 3. Start the FastAPI Development Server
```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
```
The API is available at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.
