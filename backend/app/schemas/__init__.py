"""Pydantic schemas for MarketIQ API."""
from .health import HealthResponse
from .stock import OHLCVCandle, StockHistoryResponse, StockSearchResult, StockSearchResponse
from .indicators import IndicatorValues, CandleWithIndicators, StockIndicatorsResponse
from .signals import SignalType, StockSignalResponse
from .backtest import (
    BacktestMetrics,
    BacktestRequest,
    BacktestResponse,
    BacktestTrade,
    EquityPoint,
    StrategyType,
)
from .ai import (
    AIChatMessage,
    AIAnalysisRequest,
    AIAnalysisResponse,
    AIHealthResponse,
    AINewsItem,
    ChatSender,
    StructuredAIAnalysis,
)
from .paper import (
    OrderSide,
    OrderStatus,
    OrderType,
    PaperAccountResponse,
    PaperOrderCreateRequest,
    PaperOrderResponse,
    PaperPositionResponse,
    PaperResetRequest,
    PaperResetResponse,
)

__all__ = [
    "HealthResponse",
    "OHLCVCandle",
    "StockHistoryResponse",
    "StockSearchResult",
    "StockSearchResponse",
    "IndicatorValues",
    "CandleWithIndicators",
    "StockIndicatorsResponse",
    "SignalType",
    "StockSignalResponse",
    "StrategyType",
    "BacktestRequest",
    "BacktestTrade",
    "EquityPoint",
    "BacktestMetrics",
    "BacktestResponse",
    "AIChatMessage",
    "AIAnalysisRequest",
    "AIAnalysisResponse",
    "AIHealthResponse",
    "AINewsItem",
    "ChatSender",
    "StructuredAIAnalysis",
    "OrderSide",
    "OrderType",
    "OrderStatus",
    "PaperOrderCreateRequest",
    "PaperOrderResponse",
    "PaperPositionResponse",
    "PaperAccountResponse",
    "PaperResetRequest",
    "PaperResetResponse",
]
