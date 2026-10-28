"""API routes for historical backtesting simulation."""
import re
from datetime import datetime, timezone
import logging
from fastapi import APIRouter

from ...core.exceptions import BacktestNotFoundError, InsufficientDataError
from ...schemas.backtest import BacktestRequest, BacktestResponse
from ...services.backtest_engine import BacktestEngine, backtest_store
from ...services.market_data import default_market_provider

logger = logging.getLogger("market_platform.backtest")

router = APIRouter(prefix="/backtests", tags=["Historical Backtesting"])


@router.post("/run", response_model=BacktestResponse)
def run_backtest(req: BacktestRequest) -> BacktestResponse:
    """Executes a chronological, bias-free quantitative backtest on Indian equities."""
    clean_sym, _ = default_market_provider.normalize_symbol(req.symbol)

    # Determine period required if start_date is provided
    period_to_fetch = req.period
    if req.start_date:
        try:
            start_dt = datetime.strptime(req.start_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            days_diff = (now_dt - start_dt).days
            if days_diff > 365 * 2:
                period_to_fetch = "5y"
            elif days_diff > 365:
                period_to_fetch = "2y"
        except Exception:
            pass

    # Fetch historical OHLCV data
    df = default_market_provider.fetch_history(clean_sym, period=period_to_fetch, interval=req.interval)

    min_required_bars = max(req.slow_period + 2, 20)
    if len(df) < min_required_bars:
        raise InsufficientDataError(
            f"Symbol '{clean_sym}' has only {len(df)} bars, but at least {min_required_bars} bars are required for slow period {req.slow_period}."
        )

    # Clone request with clean symbol
    normalized_req = req.model_copy(update={"symbol": clean_sym})

    logger.info("Executing backtest for %s with strategy %s", clean_sym, req.strategy.value)
    engine = BacktestEngine(df=df, request=normalized_req)
    result = engine.run()
    return result


@router.get("/{backtest_id}", response_model=BacktestResponse)
def get_backtest_by_id(backtest_id: str) -> BacktestResponse:
    """Retrieves an executed backtest result from in-memory cache by backtest_id."""
    if not backtest_id or not re.match(r"^[A-Za-z0-9_\-]{6,64}$", backtest_id):
        raise BacktestNotFoundError(f"Invalid backtest ID '{backtest_id}'.")
    result = backtest_store.get(backtest_id)
    if not result:
        raise BacktestNotFoundError(f"Backtest run with id '{backtest_id}' not found or has expired.")
    return result
