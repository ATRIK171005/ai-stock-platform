"""API routes package."""
from .health import router as health_router
from .stocks import router as stocks_router
from .indicators import router as indicators_router

__all__ = ["health_router", "stocks_router", "indicators_router"]
