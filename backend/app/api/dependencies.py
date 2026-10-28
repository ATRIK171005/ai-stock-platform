"""FastAPI dependency providers for authentication, active user session, and account authorization."""
import logging
from typing import Optional
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from ..core.exceptions import AuthenticationError
from ..core.security import decode_access_token
from ..db.models import UserModel
from ..db.session import get_db

logger = logging.getLogger("market_platform.auth_deps")


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    """Extracts and verifies JWT token from Authorization header if present. Returns None if unauthenticated."""
    if not authorization:
        return None

    token = None
    if authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif authorization.startswith("bearer "):
        token = authorization[7:].strip()
    else:
        token = authorization.strip()

    if not token:
        return None

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None

    user_id = payload["sub"]
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    return user


def get_current_user(
    user: Optional[UserModel] = Depends(get_current_user_optional),
) -> UserModel:
    """Enforces authentication. Raises 401 AuthenticationError if not logged in."""
    if not user:
        raise AuthenticationError("Authentication required. Please sign in.")
    return user
