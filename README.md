# MarketIQ: AI-Powered Stock Trading & Research Platform (NSE/BSE)

A high-performance, professional quantitative market analysis and simulation platform tailored for Indian equities (National Stock Exchange & Bombay Stock Exchange).

## Key Features

- **Live Historical Market Data Feed:** Pluggable `yfinance` provider interface with in-memory TTL caching, automatic symbol normalization (`.NS` / `.BO`), request deduplication, and transparent timestamping.
- **Interactive Stock Search (⌘K / Ctrl+K):** Real-time debounced search over verified Indian equities with instant stock switching and detailed empty/error states.
- **Overview Dashboard:** Live index ticker (NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX), interactive search modal, watchlists, key valuation metrics, and TradingView Lightweight Candlestick charts with volume and moving average overlays.
- **Quantitative Technical Analysis:** Deterministic computation of SMA 20/50, EMA 12/26, RSI-14, MACD (12/26/9), and ATR-14 with composite trend scoring and explicit rule-based BUY/SELL/HOLD signals.
- **AI Stock Analyst (Stage 5):** Powered by Groq (`openai/gpt-oss-120b` / `llama-3.3-70b`) & Google Gemini (`gemini-2.5-flash`), strictly separating factual observed market data from model hypotheses and synthesizing market catalysts with risk guardrails.
- **Chronological Backtesting Engine (Stage 4):** Genuine backtesting with no future data leakage / look-ahead bias, modeling configurable slippage (0.02%) and brokerage (0.05%), generating equity curves and risk metrics.
- **Paper Trading Simulator:** ₹100,000 virtual INR balance, simulated market and limit order execution, position tracking, realized and unrealized P&L calculations, risk checks (25% max position limit, ₹5,000 daily loss limit), and portfolio resets.
- **Strategy Doctor (Stage 8):** Quantitative strategy robustness audit suite with chronological walk-forward validation (Train/Validation/Test), parameter sensitivity surface, market regime stress testing, transaction cost friction modeling, trade concentration analysis, and deterministic 0–100 robustness score.
- **Personal Risk Guardian (Stage 9):** Pre-trade risk assessment and mandatory execution gate protecting paper traders with customizable risk profiles, stop-loss downside calculations, portfolio concentration limits, and explanatory warnings before order placement.

---

## Architecture & Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, TradingView Lightweight Charts v5, Recharts, Lucide Icons, Vitest.
- **Backend:** Python 3.11+, FastAPI, Pydantic v2, Uvicorn, pandas, NumPy, yfinance, pytest, httpx.
- **Data Feeds:** Yahoo Finance (`yfinance` for NSE `.NS` and BSE `.BO`) with pluggable provider interface and transparent source/delay labeling.

---

## Windows Setup Instructions (PowerShell)

### 1. Backend Setup & Startup
```powershell
cd "C:\Users\Atrik Samanta\ai-stock-platform\backend"
python -m venv venv
.\venv\Scripts\pip.exe install -r requirements.txt
.\venv\Scripts\python.exe -m pytest -v
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
```
The FastAPI backend runs on `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup & Startup
```powershell
cd "C:\Users\Atrik Samanta\ai-stock-platform\frontend"
npm install
npm test
npm run dev
```
The frontend starts on `http://localhost:3000` and automatically connects to the FastAPI backend at `http://127.0.0.1:8000`.

---

## Implementation Roadmap

- [x] **Stage 1:** Frontend dashboard with complete navigation, TradingView Lightweight Charts, and responsive layout.
- [x] **Stage 2:** FastAPI backend with market data provider interface, pandas/NumPy technical indicators, rule-based signal engine, and 26 pytest unit tests.
- [x] **Stage 3:** Full frontend-backend integration, centralized typed API client, debounced stock search modal (⌘K), real candle & indicator chart overlays, signal cards, loading/error states, and Vitest test suite.
- [x] **Stage 4:** Deterministic chronological backtesting engine with zero look-ahead bias, execution on bar $t+1$ Open with slippage & brokerage, conservative SL/TP tie-break, in-memory LRU caching, React UI integration, and 35 backend + 16 frontend unit tests.
- [x] **Stage 5:** Google Gemini AI Market Analyst with official `google-genai` Python SDK, structured Pydantic output, context grounding from live indicators/signals/backtests, safe error & rate limit handling, interactive React chat with markdown synthesis, and 46 backend + 22 frontend unit tests.
- [x] **Stage 6:** Persistent Paper Trading & Risk Management Simulator with SQLAlchemy 2.0 database persistence, Decimal financial arithmetic, mark-to-market position valuation, backend risk guardrails (order value, position size, daily loss limit, max open positions), account reset with explicit confirmation, and 59 backend + 31 frontend unit tests.
- [x] **Stage 7:** Final Project Audit, Security Hardening, Production Configuration & Deployment Preparation (Rate limiting, security headers, payload validation, account mutex locking, hot database backup/recovery, Docker & Vercel deployment configs, 68 backend + 33 frontend tests passing).
- [x] **Stage 8:** Strategy Doctor & Robustness Diagnostics (Chronological walk-forward splits, parameter stability grid, regime stress testing, transaction friction scaling, trade concentration/outliers, 0–100 heuristic robustness scoring, and Gemini strategy diagnosis).
- [x] **Stage 9:** Personal Risk Guardian & Pre-Trade Protection (Customizable Risk Profiles, pre-trade risk evaluation endpoint, mandatory server-side execution gate under mutex locks, stop-loss risk modeling, and reactive UI feedback; 83 backend + 36 frontend tests passing).

---

## Stage 5: AI Market Analyst & Google Gemini Integration

### 1. How to Obtain and Configure a Google Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account and click **Get API key**.
3. Create a free API key for your project.
4. In `backend/.env` (or OS environment variables), configure:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   ```
5. Restart the backend server. The API health endpoint `GET /api/ai/health` will report `{"status": "ready", "configured": true}`.

> [!NOTE]
> If `GEMINI_API_KEY` is not set, the platform operates in local mode without crashing. All charts, technical indicators, rule-based signals, and backtesting continue working with full functionality.

### 2. Contextual Grounding & Structured Separation Architecture
- **Non-Generative Factual Observations:** Real-time prices, 20/50 SMAs, RSI-14, MACD, and backtest metrics are passed as structured parameters to Gemini. The model is forbidden from recalculating or inventing numerical values.
- **Model Interpretation:** The LLM synthesizes market mechanics and explanations, strictly distinguished from observed facts.
- **Backtest Explanations:** Explains actual Stage 4 simulation results (Net Return, Gross Return, Max Drawdown, Sharpe ratio, Win Rate, Transaction Costs) based on the genuine backtest run ID without look-ahead bias.
- **Prompt Injection Defense:** External news headlines and user queries are treated as untrusted content; models run with strict non-advisory system instructions.
- **Rate Limiting & Caching:** Requests are cached in-memory with a 5-minute TTL to prevent redundant quota usage, backed by an in-memory rate limiter (30 RPM).

### 3. Available AI Endpoints
- `GET /api/ai/health`: Returns AI configuration status (`ready` or `not_configured`), active model, and provider name without revealing secrets.
- `POST /api/ai/analyze`: Accepts `{ question, symbol, backtest_id?, conversation_history? }` and returns validated `StructuredAIAnalysis` matching Pydantic schemas.

### 4. AI Accuracy & Financial Risk Limitations
- **No Order Execution:** The AI model is strictly informational and has no capability or authorization to submit trades or modify accounts.
- **Hallucination Prevention:** The model is bound to structured JSON outputs. If Gemini returns unstructured plain text, the parser safely normalizes it into the standard response schema.
- **SEBI Non-Advisory Notice:** MarketIQ outputs do not constitute investment advice or a guarantee of profits.

---

## Stage 4: Deterministic Backtesting Engine Specifications

### 1. Timing & Bias Prevention Conventions
- **Zero Look-Ahead Bias:** Signals are generated at the close of candle $t$ strictly utilizing data available up to $t$.
- **Next-Bar Execution:** Order fills strictly at candle $t+1$ **OPEN** price:
  - $\text{BUY Fill Price} = \text{Open}_{t+1} \times (1 + \text{slippage\_pct})$
  - $\text{SELL Fill Price} = \text{Open}_{t+1} \times (1 - \text{slippage\_pct})$
- **Realistic Transaction Costs:** Brokerage fees deducted on both entry and exit legs:
  - $\text{Brokerage Cost} = \text{Trade Value} \times \text{brokerage\_pct}$
- **Intra-Candle Conflict Resolution:** If both Stop-Loss and Take-Profit price thresholds are breached within the same candle (when High $\ge$ TP and Low $\le$ SL), the engine assumes the conservative stop-loss was triggered first.
- **Future Data Invariance:** Validated by unit tests demonstrating that extending the historical window with future bars never affects signals or trade executions in earlier sessions.

### 2. Available Endpoints
- `POST /api/backtests/run`: Executes backtest on requested equity (`symbol`, `strategy`, `fast_period`, `slow_period`, `initial_capital`, `brokerage_pct`, `slippage_pct`, `start_date`, `end_date`, `stop_loss_pct`, `take_profit_pct`).
- `GET /api/backtests/{backtest_id}`: Fetches cached backtest result from thread-safe in-memory LRU store (capacity: 100 runs).

---

## Stage 6: Persistent Paper Trading & Risk Management Architecture

### 1. Database Persistence & Financial Precision
- **SQLAlchemy 2.0 ORM & SQLite Persistence:** All accounts, holdings, order history, and trade fills are persisted to SQLite database (`paper_trading.db`) across server restarts.
- **Fixed-Precision Financial Arithmetic:** All balances, prices, fees, slippage, and P&L calculations utilize Python's `Decimal` module (`Decimal("0.01")` quantization), eliminating floating-point drift.
- **Persistent Daily Loss Counter:** Daily realized losses (`daily_realized_loss` and `daily_loss_date`) are stored in the database and automatically rollover at midnight UTC, ensuring risk limits cannot be circumvented by restarting the FastAPI process.

### 2. Execution Simulation & Cost Modeling
- **Realistic Transaction Costs:**
  - Brokerage: Configurable at `0.05%` of order value.
  - Slippage: Configurable at `0.02%` for Market orders (slippage is not applied to Limit orders when filled).
- **Execution Prices:**
  - BUY Market Order: $\text{Execution Price} = \text{Current Price} \times (1 + \text{slippage\_pct})$
  - SELL Market Order: $\text{Execution Price} = \text{Current Price} \times (1 - \text{slippage\_pct})$
  - Limit Orders: Evaluated against market quote; remain `PENDING` if conditions are not satisfied.
- **Weighted-Average Entry Price:** Multiple buys of the same stock dynamically update the average entry cost:
  $$\text{New Average} = \frac{(\text{Current Qty} \times \text{Average Price}) + \text{New Order Value}}{\text{Current Qty} + \text{New Qty}}$$
- **Mark-to-Market Valuation:** Open positions are valued against live or delayed Yahoo Finance quotes on every account query, displaying unrealized P&L and flagging stale prices.

### 3. Backend Risk Management Guardrails
All risk parameters are enforced strictly on the FastAPI backend prior to database commits (frontend validation is purely cosmetic):
1. **Max Single Order Value:** Rejects any order whose gross value exceeds ₹50,000 INR.
2. **Max Position Allocation:** Prohibits any single stock holding from exceeding 25% of the total portfolio equity.
3. **Daily Loss Limit:** If cumulative realized daily losses reach ₹5,000 INR, new BUY orders are strictly halted for the remainder of the session. Risk-reducing SELL orders remain permitted.
4. **Max Open Positions Limit:** Caps simultaneous active holdings to a maximum of 5 concurrent stocks.
5. **No Short Selling:** Long-only simulation model; sell orders require prior verified holdings in the account.

### 4. Account Reset Behavior
- Virtual portfolio can be reset to starting capital (₹100,000 INR) at any time.
- Requires explicit user confirmation (`confirm: true` in request body) to prevent accidental wipes.
- Liquidation cleans open positions, orders, and fills, restoring clean sandbox capital.

### 5. Available Paper Trading Endpoints
- `GET /api/paper/account`: Returns full account summary (equity, cash, invested, realized/unrealized P&L, daily loss limit tracking).
- `GET /api/paper/positions`: Returns list of open holdings marked to market with live prices and unrealized returns.
- `GET /api/paper/orders`: Returns complete historical audit log of simulated orders (executed, rejected, pending).
- `POST /api/paper/orders`: Places and executes simulated order with backend risk checks.
- `POST /api/paper/reset`: Resets account balance to ₹100,000 with explicit confirmation.

---

## Stage 7: Security Hardening, Reliability & Production Deployment Guide

### 1. Project Audit & Remediated Issues Log

| Category | Issue Discovered | Remediated Resolution |
| :--- | :--- | :--- |
| **Security / Git** | Missing root `.gitignore` & `backend/.gitignore`; `.env` exposed to accidental git commit | Created comprehensive root, backend, and frontend `.gitignore` rules strictly ignoring `.env*`, `*.db`, `backups/`, `venv/`, and `node_modules/`. |
| **Security / API** | Missing security headers (MIME sniffing, clickjacking vulnerability) | Implemented FastAPI middleware injecting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin`. |
| **Security / DoS** | No payload body size limit or general IP rate limiter | Added `Content-Length` enforcement (1 MB limit) returning HTTP 413, plus a thread-safe sliding-window IP rate limiter (120 req/min) returning HTTP 429. |
| **Security / Auth** | Arbitrary unvalidated `account_id` queries allowed cross-user account tampering | Added `validate_account_id` regex validation, `X-Account-ID` header resolution, and optional `API_SECRET_KEY` Bearer token authentication on paper trading endpoints. |
| **Data Integrity** | Potential concurrency race condition when multiple buy orders execute simultaneously | Added `AccountLockManager` providing thread-safe per-account mutual exclusion, re-verifying cash balance inside the critical section. |
| **Database** | Dangling transactions if unhandled exceptions occurred in session | Added explicit `db.rollback()` in `get_db()` dependency error handling and added `timeout: 30` to SQLite connections. |
| **Reliability** | Unbounded dictionary cache in `YFinanceProvider` causing memory leak over time | Implemented bounded cache management (capacity: 200 entries) with automatic eviction of expired entries and oldest-key purging. |
| **Frontend Hooks** | Cascading renders and missing dependencies in `StockSearchModal.tsx`, `BacktestPage.tsx`, and `App.tsx` | Re-ordered callbacks with `useCallback`, added `initialMountRef`, and used `useRef` for stock registry access to prevent infinite fetch cycles. |

---

### 2. Database Backup & Recovery Procedure

The platform includes a hot backup utility (`backend/app/db/backup.py`) capable of taking point-in-time snapshots while the application is actively serving requests.

#### A. SQLite Hot Backup
```powershell
cd "C:\Users\Atrik Samanta\ai-stock-platform\backend"
.\venv\Scripts\python -m app.db.backup backup
```
- Uses SQLite's online `VACUUM INTO` command to generate a clean, uncorrupted snapshot without locking readers or writers.
- Output: `backups/paper_trading_backup_YYYYMMDD_HHMMSS.db`.

#### B. SQLite Restoration
```powershell
cd "C:\Users\Atrik Samanta\ai-stock-platform\backend"
.\venv\Scripts\python -m app.db.backup restore backups/paper_trading_backup_20261026_162401.db
```
- Creates an automatic safety copy of the current database before replacing it with the backup snapshot.

#### C. Managed PostgreSQL Backup & Recovery
For production deployments using PostgreSQL:
```bash
# 1. Hot Backup (Custom Compressed Format)
pg_dump -Fc -h <HOST> -U <USER> -d marketiq_db > backups/db_backup_$(date +%Y%m%d_%H%M%S).dump

# 2. Database Restoration
pg_restore -h <HOST> -U <USER> -d marketiq_db --clean --if-exists backups/db_backup_20261026.dump
```

---

### 3. Production Deployment Architecture

```
                      ┌───────────────────────────────────────────────┐
                      │                 Client Web Browser            │
                      └───────────────────────┬───────────────────────┘
                                              │ HTTPS
                      ┌───────────────────────▼───────────────────────┐
                      │              Vercel / Static Host             │
                      │          React 19 + TypeScript + Vite         │
                      │        (Configured via vercel.json)           │
                      └───────────────────────┬───────────────────────┘
                                              │ REST API / CORS
                      ┌───────────────────────▼───────────────────────┐
                      │           Render / Cloud Host (FastAPI)       │
                      │         Uvicorn + Gunicorn (4 Workers)        │
                      │       Payload Guard + Rate Limiter (120 RPM)  │
                      └──────────────┬─────────────────┬──────────────┘
                                     │                 │
                  PostgreSQL / SQLite│                 │Google GenAI SDK
        ┌────────────────────────────▼──┐   ┌──────────▼───────────────┐
        │   Managed PostgreSQL Database │   │   Google Gemini Flash    │
        │   ACID Transactions + Locks   │   │   Non-Advisory AI Engine │
        └───────────────────────────────┘   └──────────────────────────┘
```

#### Recommended Cloud Providers:
- **Frontend:** Vercel (Free / Pro tier static hosting with edge caching and client-side routing).
- **Backend:** Render, Railway, or AWS ECS running containerized FastAPI.
- **Database:** Render PostgreSQL, Supabase, or AWS RDS PostgreSQL.

---

### 4. Step-by-Step Production Deployment

#### Step 1: Managed Database Provisioning
1. Create a PostgreSQL 16 database instance (e.g. on Render or Supabase).
2. Obtain the external connection string:
   `postgresql://dbuser:securepassword@dbhost.render.com/marketiq_db`
3. Verify network access and SSL mode (`sslmode=require`).

#### Step 2: Backend Deployment (Render / Railway / Docker)
1. In your cloud provider dashboard, create a new **Web Service** from your repository.
2. Set Root Directory to `backend` (or use the root `Dockerfile`).
3. Set the build and start commands:
   - **Build Command:** `pip install --upgrade pip && pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Configure Environment Variables in the provider's Secret Manager:
   ```bash
   ENVIRONMENT=production
   PORT=8000
   DATABASE_URL=postgresql://dbuser:securepassword@dbhost.render.com/marketiq_db
   CORS_ORIGINS=https://your-frontend.vercel.app
   GEMINI_API_KEY=your_gemini_api_key_from_ai_studio
   GEMINI_MODEL=gemini-2.5-flash
   API_SECRET_KEY=generate_a_random_64_character_hex_key
   ```
5. Deploy the backend and copy the assigned HTTPS URL (e.g. `https://marketiq-api.onrender.com`).
6. Verify health endpoints:
   - `GET https://marketiq-api.onrender.com/api/health` -> HTTP 200 `{"status": "ok"}`
   - `GET https://marketiq-api.onrender.com/api/health/ready` -> HTTP 200 `{"status": "ready", "database": "connected"}`

#### Step 3: Frontend Deployment (Vercel)
1. In Vercel, import your Git repository and select the `frontend` root directory.
2. Framework Preset: **Vite**.
3. Build Settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Set Environment Variable:
   ```bash
   VITE_API_BASE_URL=https://marketiq-api.onrender.com
   ```
5. Click **Deploy**. Vercel will build and assign your production domain (`https://your-frontend.vercel.app`).
6. Update the backend `CORS_ORIGINS` variable with your final Vercel domain.

---

### 5. Production Smoke-Test Checklist

- [ ] `GET /api/health` returns `200 OK` with `provider_status: "ready"`.
- [ ] `GET /api/health/ready` returns `200 OK` with `database: "connected"`.
- [ ] Frontend opens without console errors or broken stylesheets.
- [ ] Stock search (`⌘K`) returns verified Indian equities.
- [ ] Real-time chart loads OHLCV candles and indicators without delay errors.
- [ ] Backtest runs and generates equity curves with brokerage & slippage.
- [ ] Paper trading order executes and updates cash and position balances.
- [ ] Order exceeding ₹50,000 is rejected with HTTP 400 `RISK_LIMIT_VIOLATION`.
- [ ] Account reset modal requires explicit confirmation.
- [ ] Response headers include `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

---

### 6. Emergency Rollback Instructions

If a faulty release is detected in production:
1. **Frontend Rollback:** In the Vercel dashboard, navigate to **Deployments**, locate the last healthy deployment, click the three dots (`...`), and select **Promote to Production**. This instantaneously redirects traffic back to the previous stable static bundle without a rebuild.
2. **Backend Rollback:** In Render/Railway, select **Rollback to previous deployment** or redeploy the prior Git commit SHA.
3. **Database Rollback:** If a bad migration or corruption occurred, execute the restore procedure using the latest pre-release backup snapshot (`pg_restore` or `python -m app.db.backup restore <file>`).

---

## Stage 8: Strategy Doctor — Overfitting Detection & Quantitative Robustness Suite

Strategy Doctor audits trading strategies across historical market data to detect curve-fitting, fragile parameters, and hidden regime vulnerabilities before capital is committed to paper trading.

### 1. Chronological Walk-Forward Validation
- **Chronological Data Partitioning:** Historical daily candles are partitioned chronologically into three non-overlapping windows:
  - **Training Split (Default 60%):** Parameter optimization and sensitivity testing window.
  - **Validation Split (Default 20%):** Intermediate model checkpointing.
  - **Out-of-Sample Test Split (Default 20%):** Untouched, strictly out-of-sample forward evaluation.
- **Zero Look-Ahead Bias & Clean Indicator Warm-Up:** Historical data prior to the split start date is preserved strictly for indicator warm-up (e.g. 50-period SMA calculation), while order execution and trade accounting begin strictly at the split start date. Signals use bar $t$ close and fill at bar $t+1$ Open.
- **Sample Integrity:** Minimum required sample size is 60 trading bars; splits report exact start/end dates, total bars, and trade counts.

### 2. Multi-Dimensional Robustness Stress Tests
1. **Parameter Sensitivity Grid:** Tests 9 neighboring parameter pairs around the base configuration (e.g. fast $\pm 5$, slow $\pm 10$) **strictly on the Training partition**. Measures the percentage of profitable neighbors and flags cliff-edge fragility if the base configuration is an isolated spike.
2. **Market Regime Breakdown:** Categorizes performance across market regimes (Bull: Return $> +5\%$, Bear: Return $< -5\%$, Sideways: $|Return| \le 5\%$) to highlight regime-dependent vulnerability.
3. **Transaction Cost Friction Scaling:** Evaluates strategy resilience under varying friction multipliers:
   - **1x Base Friction:** Standard brokerage (0.05%) and slippage (0.02%).
   - **2x Elevated Friction:** High-volatility market conditions (0.10% brokerage, 0.04% slippage).
   - **4x Severe Friction:** Illiquid or stressed execution conditions (0.20% brokerage, 0.08% slippage).
4. **Trade Concentration & Outlier Analysis:**
   - Calculates the net return of top 3 trades relative to total strategy return.
   - Computes hypothetical strategy net return with the top 3 outlier winners removed.
   - Measures maximum single trade contribution percentage to detect strategies dependent on a single windfall.

### 3. Heuristic Robustness Score Formula (0–100 Scale)
The Strategy Doctor computes a deterministic heuristic score out of 100 with explicit transparent deduction categories:
$$\text{Score} = \max\left(0, \min\left(100, 100 - (\Delta_{\text{degradation}} + \Delta_{\text{drawdown}} + \Delta_{\text{fragility}} + \Delta_{\text{friction}} + \Delta_{\text{concentration}} + \Delta_{\text{sample}})\right)\right)$$

| Deduction Category | Condition | Max Penalty |
| :--- | :--- | :--- |
| **Out-of-Sample Degradation** | Drop in Sharpe ratio or return from Train to Test | Up to 25 pts |
| **Excessive Test Drawdown** | Test max drawdown $> 15\%$ | Up to 15 pts |
| **Parameter Fragility** | Neighboring parameter configurations in Train are unprofitable | Up to 20 pts |
| **Transaction Cost Fragility** | Strategy becomes net negative under 2x or 4x friction | Up to 15 pts |
| **Trade Concentration** | Top 3 trades contribute $> 60\%$ of total net profits | Up to 15 pts |
| **Low Sample Size** | Fewer than 10 total trades executed in the test window | Up to 10 pts |

**Score Classification:**
- **80 – 100:** Robust Strategy (Low Overfitting Risk)
- **60 – 79:** Moderate Robustness (Review Identified Caveats)
- **40 – 59:** Questionable Robustness (Moderate Overfitting Detected)
- **0 – 39:** Fragile / Overfitted (High Probability of Failure Live)

### 4. Gemini AI Strategy Diagnosis
- Gemini Flash synthesizes the computed metrics into an executive diagnosis without recalculating or fabricating data.
- Explains degradation, parameter stability, and regime exposure, ending with explicit actionable recommendations.

### 5. Available Endpoints
- `POST /api/strategy-doctor/analyze`: Runs walk-forward splits, parameter grids, regimes, stress tests, and scoring.
- `GET /api/strategy-doctor/{analysis_id}`: Retrieves cached diagnostic report.
- `POST /api/strategy-doctor/{analysis_id}/explain`: Generates structured Gemini LLM explanation of the quantitative findings.

---

## Stage 9: Personal Risk Guardian — Pre-Trade Risk Evaluation & Execution Enforcement

Personal Risk Guardian protects the trader from impulsive or out-of-parameter orders through pre-trade simulation checks and an unbypassable backend execution gate.

### 1. Persistent User Risk Profile
Persisted in the database via SQLAlchemy `RiskProfileModel`, configurable per account:
- `max_order_value`: Cap on single order gross value (Default: ₹50,000 INR).
- `max_position_allocation_pct`: Max percentage of portfolio equity allocated to a single equity (Default: 25.0%).
- `max_open_positions`: Maximum number of distinct concurrent stock holdings (Default: 5).
- `max_daily_loss_pct`: Daily realized loss threshold that triggers an automatic BUY halt (Default: 5.0%).
- `max_risk_per_trade_pct`: Maximum capital loss allowed on a single trade based on stop-loss distance (Default: 2.0%).
- `require_stop_loss`: Toggle requiring explicit stop-loss price on all new BUY orders (Default: `false`).
- `max_portfolio_concentration_pct`: Combined allocation cap across top 3 holdings (Default: 50.0%).

### 2. Pre-Trade Advisory Assessment (`POST /api/risk/assess-order`)
Before an order is placed, the frontend queries the advisory endpoint to inspect the trade without executing it:
- **Real-Time Data Integration:** Uses current live/delayed market quote, calculates order value, estimated brokerage (0.05%), and slippage (0.02%).
- **Projected Balances:** Shows post-trade remaining cash and projected single-stock allocation percentage.
- **Stop-Loss Downside Modeling:** If stop-loss is provided, calculates exact potential loss in INR and percentage of account equity.
- **Assessment Status:**
  - `APPROVED`: Passes all hard limits and soft risk guidelines.
  - `WARNING`: Permitted to execute, but flags cautions (e.g. missing stop-loss, large order $> 50\%$ limit, high concentration).
  - `BLOCKED`: Hard violation of account limits; submission button is disabled on the UI.

### 3. Mandatory Backend Order Execution Gate
To ensure security and prevent client-side bypass:
- All order placement requests (`POST /api/paper/orders`) call `RiskGuardianService.validate_order_execution_limits()` inside `PaperTradingService._place_order_internal` under an atomic per-account mutex lock (`AccountLockManager`).
- Any attempt to exceed the account's configured `max_order_value`, `max_position_allocation_pct`, `max_open_positions`, `daily_loss_limit`, or cash balance is rejected with HTTP 400 `RISK_LIMIT_VIOLATION`.

### 4. Available Endpoints
- `GET /api/risk/profile`: Fetches active account risk profile.
- `PUT /api/risk/profile`: Updates risk parameters with validation and version incrementing.
- `POST /api/risk/assess-order`: Computes instantaneous pre-trade impact and returns `APPROVED` / `WARNING` / `BLOCKED` status with explanation list.

---

## Statutory Disclaimer
*MarketIQ is developed strictly for simulation, quantitative analysis, and educational research. It does not execute real-money trades and is not registered with SEBI as an investment advisor. Past backtested performance is no guarantee of future market returns.*
