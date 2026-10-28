"""FastAPI routes for simulated paper trading, portfolio management, and risk controls."""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from ...config import settings
from ...core.auth import get_current_user_optional
from ...core.exceptions import UnauthorizedAccountError
from ...db.models import UserModel
from ...db.session import get_db
from ...schemas.paper import (
    AccountListItem,
    CreateAccountRequest,
    PaperAccountResponse,
    PaperOrderCreateRequest,
    PaperOrderResponse,
    PaperPositionResponse,
    PaperResetRequest,
    PaperResetResponse,
)
from ...services.paper_trading import default_paper_service

logger = logging.getLogger("market_platform.paper_routes")

router = APIRouter(prefix="/paper", tags=["Paper Trading & Simulation"])


def resolve_account_id(
    account_id: Optional[str] = Query(default=None, description="Paper trading account ID"),
    x_account_id: Optional[str] = Header(default=None, alias="X-Account-ID", description="Account ID header"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> str:
    """Extracts, validates, and authorizes the paper trading account ID."""
    # Check server API secret if configured in production
    if settings.api_secret_key:
        token = None
        if authorization and authorization.startswith("Bearer "):
            token = authorization[7:].strip()
        elif x_api_key:
            token = x_api_key.strip()

        if token != settings.api_secret_key:
            raise UnauthorizedAccountError("Invalid or missing API secret key for paper trading operation.")

    effective_id = x_account_id or account_id or "default_account"
    return effective_id


@router.get("/account", response_model=PaperAccountResponse)
def get_paper_account(
    account_id: str = Depends(resolve_account_id),
    db: Session = Depends(get_db),
) -> PaperAccountResponse:
    """Retrieves current virtual balance, total equity, invested value, and P&L metrics."""
    return default_paper_service.get_account_summary(db=db, account_id=account_id)


@router.get("/positions", response_model=List[PaperPositionResponse])
def get_paper_positions(
    account_id: str = Depends(resolve_account_id),
    db: Session = Depends(get_db),
) -> List[PaperPositionResponse]:
    """Retrieves active equity holdings marked to market with real-time unrealized P&L."""
    return default_paper_service.get_positions(db=db, account_id=account_id)


@router.get("/orders", response_model=List[PaperOrderResponse])
def get_paper_orders(
    account_id: str = Depends(resolve_account_id),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum order history records"),
    db: Session = Depends(get_db),
) -> List[PaperOrderResponse]:
    """Retrieves historical simulated orders and execution ledger."""
    return default_paper_service.get_orders(db=db, account_id=account_id, limit=limit)


@router.post("/orders", response_model=PaperOrderResponse)
def place_paper_order(
    req: PaperOrderCreateRequest,
    account_id: str = Depends(resolve_account_id),
    db: Session = Depends(get_db),
) -> PaperOrderResponse:
    """Executes a simulated BUY or SELL order with backend risk controls and Decimal accounting."""
    logger.info("Placing simulated %s order for %d shares of %s on account %s", req.side.value, req.quantity, req.symbol, account_id)
    return default_paper_service.place_order(db=db, req=req, account_id=account_id)


@router.post("/reset", response_model=PaperResetResponse)
def reset_paper_account(
    req: PaperResetRequest,
    account_id: str = Depends(resolve_account_id),
    db: Session = Depends(get_db),
) -> PaperResetResponse:
    """Resets the virtual cash balance and wipes positions and order history with confirmation."""
    logger.info("Resetting paper account '%s' (confirm=%s)", account_id, req.confirm)
    return default_paper_service.reset_account(
        db=db,
        account_id=account_id,
        confirm=req.confirm,
        initial_balance=req.initial_balance or 100000.0,
    )


@router.get("/accounts", response_model=List[AccountListItem])
def list_paper_accounts(
    user: Optional[UserModel] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> List[AccountListItem]:
    """Lists all paper trading portfolio accounts belonging to the current user (or default user)."""
    user_id = user.id if user else "default_user"
    accounts = default_paper_service.get_user_accounts(db=db, user_id=user_id)
    items = []
    for acc in accounts:
        summary = default_paper_service.get_account_summary(db=db, account_id=acc.id)
        items.append(
            AccountListItem(
                id=acc.id,
                name=acc.name,
                user_id=acc.user_id,
                initial_balance=summary.initial_balance,
                cash_balance=summary.cash_balance,
                total_equity=summary.total_equity,
                realized_pnl=summary.realized_pnl,
                open_positions_count=summary.open_positions_count,
                currency=acc.currency,
                created_at=acc.created_at.isoformat() if acc.created_at else "",
            )
        )
    return items


@router.post("/accounts", response_model=PaperAccountResponse)
def create_paper_account(
    req: CreateAccountRequest,
    user: Optional[UserModel] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> PaperAccountResponse:
    """Creates a new isolated paper trading portfolio account for the current user."""
    user_id = user.id if user else "default_user"
    new_acc = default_paper_service.create_account(
        db=db,
        name=req.name,
        initial_balance=req.initial_balance,
        user_id=user_id,
    )
    return default_paper_service.get_account_summary(db=db, account_id=new_acc.id)
