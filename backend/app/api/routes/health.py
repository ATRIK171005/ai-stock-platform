"""Health and readiness diagnostics endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...config import settings
from ...db.session import get_db
from ...schemas.health import HealthResponse

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Returns application health, version, and provider status."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        environment=settings.environment,
        data_provider=settings.data_provider,
        provider_status="ready",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/ready")
def get_readiness(db: Session = Depends(get_db)):
    """Readiness probe checking database connectivity and subsystem operational state."""
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "database": f"error: {str(e)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    return {
        "status": "ready",
        "database": db_status,
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
