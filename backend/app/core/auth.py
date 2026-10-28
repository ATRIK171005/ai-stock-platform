"""Authentication, security hashing, token signing, and session dependencies."""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db.models import UserModel
from ..db.session import get_db

logger = logging.getLogger("market_platform.auth")

AUTH_SECRET_KEY = settings.api_secret_key or "marketiq_production_jwt_hmac_secret_2026_key"
PBKDF2_ITERATIONS = 100_000


def hash_password(password: str) -> str:
    """Hashes plain password using PBKDF2-HMAC-SHA256 with 100,000 rounds and random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"{salt}:{key.hex()}"


def verify_password(plain_password: str, hashed: str) -> bool:
    """Verifies plain password against stored salt and key in constant time."""
    try:
        salt, key_hex = hashed.split(":", 1)
        computed_key = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
        )
        return secrets.compare_digest(computed_key.hex(), key_hex)
    except Exception:
        return False


def create_access_token(
    user_id: str, email: str, username: str, expires_in_sec: int = 86400 * 7
) -> str:
    """Creates a tamper-proof HMAC-SHA256 signed bearer session token."""
    payload = {
        "sub": user_id,
        "email": email,
        "username": username,
        "exp": int(time.time()) + expires_in_sec,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")
    signature = hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and validates HMAC-SHA256 bearer session token."""
    try:
        payload_b64, signature = token.split(".", 1)
        expected_sig = hmac.new(
            AUTH_SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not secrets.compare_digest(signature, expected_sig):
            return None

        # Add base64 padding
        padding = len(payload_b64) % 4
        if padding:
            payload_b64 += "=" * (4 - padding)

        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    """Extracts authenticated user from Authorization header if present, otherwise returns None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization[7:].strip()
    payload = decode_access_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    return db.query(UserModel).filter(UserModel.id == user_id).first()


def get_current_user(
    current_user: Optional[UserModel] = Depends(get_current_user_optional),
) -> UserModel:
    """Enforces authentication dependency; raises HTTP 401 if unauthenticated."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in or provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user
