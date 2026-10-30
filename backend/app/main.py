"""MarketIQ FastAPI Application Entrypoint.

Hardened with security headers, payload validation, sliding-window rate limiting,
graceful lifespan management, and safe structured error responses.
"""
from contextlib import asynccontextmanager
import logging
import threading
import time
from typing import Dict, List

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from .api.routes.health import router as health_router
from .api.routes.stocks import router as stocks_router
from .api.routes.indicators import router as indicators_router
from .api.routes.backtest import router as backtest_router
from .api.routes.ai import router as ai_router
from .api.routes.paper import router as paper_router
from .api.routes.strategy_doctor import router as strategy_doctor_router
from .api.routes.risk import router as risk_router
from .api.routes.hft import router as hft_router
from .api.routes.auth import router as auth_router
from .config import settings
from .core.exceptions import MarketPlatformError
from .db import models as _db_models
from .db.session import Base, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("market_platform")


# In-memory sliding-window IP rate limiter
class IPRateLimiter:
    def __init__(self, limit_per_minute: int = 120):
        self._limit = limit_per_minute
        self._requests: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window_start = now - 60.0
        with self._lock:
            # Clean old timestamps for this IP
            timestamps = self._requests.get(client_ip, [])
            timestamps = [t for t in timestamps if t > window_start]
            if len(timestamps) >= self._limit:
                self._requests[client_ip] = timestamps
                return False
            timestamps.append(now)
            self._requests[client_ip] = timestamps
            return True


rate_limiter = IPRateLimiter(limit_per_minute=settings.rate_limit_per_minute)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for safe database initialization and resource disposal."""
    logger.info("Initializing MarketIQ backend (environment: %s)...", settings.environment)
    Base.metadata.create_all(bind=engine)
    logger.info("Database schemas verified.")

    # Lightweight column migration for existing SQLite database
    if "sqlite" in settings.database_url:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                res = conn.execute(text("PRAGMA table_info(paper_accounts)"))
                cols = [r[1] for r in res.fetchall()]
                if cols and "name" not in cols:
                    conn.execute(text("ALTER TABLE paper_accounts ADD COLUMN name VARCHAR(128) DEFAULT 'Primary Portfolio'"))
                    conn.commit()
                    logger.info("Added 'name' column to paper_accounts table.")

                orders_res = conn.execute(text("PRAGMA table_info(paper_orders)"))
                orders_cols = [r[1] for r in orders_res.fetchall()]
                if orders_cols and "stop_loss_price" not in orders_cols:
                    conn.execute(text("ALTER TABLE paper_orders ADD COLUMN stop_loss_price NUMERIC(12, 2)"))
                    conn.commit()
                    logger.info("Added 'stop_loss_price' column to paper_orders table.")
        except Exception as e:
            logger.debug("SQLite table migration check: %s", e)

    yield
    logger.info("Disposing database connection pool...")
    engine.dispose()
    logger.info("MarketIQ backend shut down cleanly.")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Backend API for AI-Powered Indian Stock Trading & Quantitative Research Platform",
    lifespan=lifespan,
)

# Safe CORS Middleware Configuration
is_wildcard = "*" in settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=not is_wildcard,  # Wildcard cannot have allow_credentials=True per CORS spec
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Security & Rate Limiting Middleware
@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    # 1. Enforce payload size limit
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_body_size_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "detail": f"Request payload exceeds max limit of {settings.max_request_body_size_bytes} bytes.",
                "error_code": "PAYLOAD_TOO_LARGE",
            },
        )

    # 2. Rate limit check (bypass for health check probe)
    if not request.url.path.startswith("/api/health"):
        client_ip = request.client.host if request.client else "unknown"
        if not rate_limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please wait a minute before sending further requests.",
                    "error_code": "RATE_LIMIT_EXCEEDED",
                },
            )

    # 3. Process request
    response: Response = await call_next(request)

    # 4. Inject Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response


# Domain Exception Handler
@app.exception_handler(MarketPlatformError)
async def handle_market_platform_error(request: Request, exc: MarketPlatformError):
    """Handles domain-level errors with structured error payloads."""
    logger.warning("MarketPlatformError on %s: %s (code: %s)", request.url.path, exc.message, exc.error_code)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "error_code": exc.error_code,
        },
    )


# Generic Fallback Error Handler (prevents leaking secrets or traces in production)
@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    """Catches unhandled server errors safely without leaking internal stack traces."""
    logger.error("Unhandled error on %s: %s", request.url.path, str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred while processing the market request.",
            "error_code": "INTERNAL_SERVER_ERROR",
        },
    )


# Register routes under /api
app.include_router(health_router, prefix="/api")
app.include_router(stocks_router, prefix="/api")
app.include_router(indicators_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(paper_router, prefix="/api")
app.include_router(strategy_doctor_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
app.include_router(hft_router, prefix="/api")
app.include_router(auth_router, prefix="/api")


@app.get("/")
def root():
    return {
        "message": "MarketIQ Quantitative API is running.",
        "docs_url": "/docs",
        "health_url": "/api/health",
        "ready_url": "/api/health/ready",
    }
