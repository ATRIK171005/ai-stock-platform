"""FastAPI router for Personal Risk Guardian: Pre-trade assessments and user risk profiles."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...core.exceptions import (
    DataUnavailableError,
    InvalidInputError,
    RiskLimitViolationError,
)
from ...db.session import get_db
from ...schemas.risk_guardian import (
    PreTradeAssessmentRequest,
    PreTradeAssessmentResponse,
    RiskProfileSchema,
)
from ...services.risk_guardian import risk_guardian_service

logger = logging.getLogger("market_platform.risk")
router = APIRouter(prefix="/risk", tags=["Risk Guardian"])


@router.get(
    "/profile",
    response_model=RiskProfileSchema,
    status_code=status.HTTP_200_OK,
    summary="Get user risk profile configuration",
)
def get_user_risk_profile(
    account_id: str = Query("default_account", description="Target paper account ID"),
    db: Session = Depends(get_db),
) -> RiskProfileSchema:
    """Retrieves current user risk management parameters and guardrail thresholds."""
    try:
        profile = risk_guardian_service.get_or_create_risk_profile(db, account_id=account_id)
        return RiskProfileSchema(
            account_id=profile.account_id,
            max_order_value=float(profile.max_order_value),
            max_position_allocation_pct=float(profile.max_position_allocation_pct),
            max_open_positions=profile.max_open_positions,
            max_daily_loss_pct=float(profile.max_daily_loss_pct),
            max_risk_per_trade_pct=float(profile.max_risk_per_trade_pct),
            require_stop_loss=profile.require_stop_loss,
            max_portfolio_concentration_pct=float(profile.max_portfolio_concentration_pct),
            version=profile.version,
        )
    except Exception as exc:
        logger.error("Error retrieving risk profile: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user risk profile.",
        )


@router.put(
    "/profile",
    response_model=RiskProfileSchema,
    status_code=status.HTTP_200_OK,
    summary="Update user risk profile configuration",
)
def update_user_risk_profile(
    req: RiskProfileSchema,
    account_id: str = Query("default_account", description="Target paper account ID"),
    db: Session = Depends(get_db),
) -> RiskProfileSchema:
    """Updates user risk parameters with bounds validation and version incrementing."""
    try:
        updated = risk_guardian_service.update_risk_profile(db, account_id=account_id, new_settings=req)
        return RiskProfileSchema(
            account_id=updated.account_id,
            max_order_value=float(updated.max_order_value),
            max_position_allocation_pct=float(updated.max_position_allocation_pct),
            max_open_positions=updated.max_open_positions,
            max_daily_loss_pct=float(updated.max_daily_loss_pct),
            max_risk_per_trade_pct=float(updated.max_risk_per_trade_pct),
            require_stop_loss=updated.require_stop_loss,
            max_portfolio_concentration_pct=float(updated.max_portfolio_concentration_pct),
            version=updated.version,
        )
    except InvalidInputError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except Exception as exc:
        logger.error("Error updating risk profile: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update risk profile: {str(exc)}",
        )


@router.post(
    "/assess-order",
    response_model=PreTradeAssessmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate proposed trade order against active risk profile before submission",
)
def assess_pre_trade_order(
    req: PreTradeAssessmentRequest,
    db: Session = Depends(get_db),
) -> PreTradeAssessmentResponse:
    """Runs deterministic pre-trade risk checks and returns APPROVED, WARNING, or BLOCKED status."""
    try:
        assessment = risk_guardian_service.assess_pre_trade_risk(db, req)
        return assessment
    except (DataUnavailableError, InvalidInputError, RiskLimitViolationError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except Exception as exc:
        logger.error("Error evaluating pre-trade risk: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating order risk: {str(exc)}",
        )
