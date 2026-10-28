"""API routes for AI Market Analyst powered by Google Gemini."""
import logging
from fastapi import APIRouter

from ...config import settings
from ...schemas.ai import (
    AIAnalysisRequest,
    AIAnalysisResponse,
    AIHealthResponse,
)
from ...services.ai_analyst import default_ai_service

logger = logging.getLogger("market_platform.ai_routes")

router = APIRouter(prefix="/ai", tags=["AI Market Analyst"])


@router.get("/health", response_model=AIHealthResponse)
def get_ai_health() -> AIHealthResponse:
    """Reports configuration status of active AI provider (Groq or Gemini) without exposing secrets."""
    is_conf = default_ai_service.is_configured()
    return AIHealthResponse(
        status="ready" if is_conf else "not_configured",
        configured=is_conf,
        model=default_ai_service.get_active_model(),
        provider=default_ai_service.get_active_provider_name(),
    )


@router.post("/analyze", response_model=AIAnalysisResponse)
def analyze_stock_with_ai(req: AIAnalysisRequest) -> AIAnalysisResponse:
    """Executes grounded, contextual stock research synthesis using Gemini Flash model.

    Validates input parameters, checks short-lived in-memory caches, enforces rate limits,
    and returns structured facts, interpretations, evidence, risks, and disclaimers.
    """
    logger.info("AI Analysis requested for %s: %s", req.symbol, req.question[:60])
    return default_ai_service.analyze(req)
