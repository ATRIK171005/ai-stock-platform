"""FastAPI routes for user registration, authentication, session profile, and demo login."""
import logging
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ...db.models import PaperAccountModel, UserModel
from ...db.session import get_db
from ...schemas.auth import (
    AccountSummaryItem,
    AuthResponse,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
)
from ...services.paper_trading import default_paper_service

logger = logging.getLogger("market_platform.auth_routes")

router = APIRouter(prefix="/auth", tags=["User Authentication & Accounts"])


def _build_account_summaries(db: Session, user_id: str) -> List[AccountSummaryItem]:
    accounts = default_paper_service.get_user_accounts(db=db, user_id=user_id)
    summaries = []
    for acc in accounts:
        acc_summary = default_paper_service.get_account_summary(db=db, account_id=acc.id)
        summaries.append(
            AccountSummaryItem(
                id=acc.id,
                name=acc.name,
                user_id=acc.user_id,
                cash_balance=acc_summary.cash_balance,
                total_equity=acc_summary.total_equity,
                realized_pnl=acc_summary.realized_pnl,
                currency=acc.currency,
                created_at=acc.created_at.isoformat() if acc.created_at else "",
            )
        )
    return summaries


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Registers a new user account, creates a default paper portfolio, and issues an access token."""
    # Check for existing email or username
    existing_user = (
        db.query(UserModel)
        .filter((UserModel.email == req.email) | (UserModel.username == req.username))
        .first()
    )
    if existing_user:
        if existing_user.email == req.email:
            raise HTTPException(status_code=400, detail="An account with this email address already exists.")
        raise HTTPException(status_code=400, detail="Username is already taken. Please choose another.")

    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    user = UserModel(
        id=user_id,
        email=req.email,
        username=req.username,
        full_name=req.full_name or "Trader",
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Automatically provision initial paper trading portfolio
    primary_acc = default_paper_service.create_account(
        db=db,
        name="Primary Portfolio",
        initial_balance=100000.0,
        user_id=user.id,
    )

    token = create_access_token(user_id=user.id, email=user.email, username=user.username)
    accounts = _build_account_summaries(db, user.id)

    logger.info("New user registered: %s (%s)", user.username, user.email)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            created_at=user.created_at.isoformat(),
        ),
        active_account_id=primary_acc.id,
        accounts=accounts,
    )


@router.post("/login", response_model=AuthResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Authenticates username/email and password, returning an access token and user portfolios."""
    ident = req.username_or_email.strip().lower()
    user = (
        db.query(UserModel)
        .filter((UserModel.email == ident) | (UserModel.username == req.username_or_email.strip()))
        .first()
    )

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user_id=user.id, email=user.email, username=user.username)
    accounts = _build_account_summaries(db, user.id)
    active_account_id = accounts[0].id if accounts else "default_account"

    logger.info("User logged in successfully: %s", user.username)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            created_at=user.created_at.isoformat(),
        ),
        active_account_id=active_account_id,
        accounts=accounts,
    )


@router.get("/me", response_model=AuthResponse)
def get_current_user_profile(
    user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)
) -> AuthResponse:
    """Returns profile and trading accounts for the authenticated session."""
    token = create_access_token(user_id=user.id, email=user.email, username=user.username)
    accounts = _build_account_summaries(db, user.id)
    active_account_id = accounts[0].id if accounts else "default_account"

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            created_at=user.created_at.isoformat(),
        ),
        active_account_id=active_account_id,
        accounts=accounts,
    )


@router.post("/demo", response_model=AuthResponse)
def login_demo_user(db: Session = Depends(get_db)) -> AuthResponse:
    """1-Click Demo Login: instantly connects as the demo trader with a funded simulated portfolio."""
    demo_user = db.query(UserModel).filter(UserModel.username == "demotrader").first()
    if not demo_user:
        demo_user = UserModel(
            id="usr_demo_trader",
            email="demo@marketiq.in",
            username="demotrader",
            full_name="Demo Trader",
            password_hash=hash_password("Password123!"),
        )
        db.add(demo_user)
        db.commit()
        db.refresh(demo_user)

    accounts = default_paper_service.get_user_accounts(db, demo_user.id)
    if not accounts:
        default_paper_service.create_account(
            db=db,
            name="Demo Primary Portfolio",
            initial_balance=100000.0,
            user_id=demo_user.id,
        )

    token = create_access_token(user_id=demo_user.id, email=demo_user.email, username=demo_user.username)
    account_summaries = _build_account_summaries(db, demo_user.id)

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=demo_user.id,
            email=demo_user.email,
            username=demo_user.username,
            full_name=demo_user.full_name,
            created_at=demo_user.created_at.isoformat(),
        ),
        active_account_id=account_summaries[0].id,
        accounts=account_summaries,
    )
