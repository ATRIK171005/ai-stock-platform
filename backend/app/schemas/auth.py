"""Pydantic schemas for user registration, authentication, and session payloads."""
import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class UserRegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=128, description="User email address")
    username: str = Field(min_length=3, max_length=32, description="Alphanumeric username")
    password: str = Field(min_length=6, max_length=128, description="User password")
    full_name: Optional[str] = Field(default="Trader", max_length=128, description="Display name")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", clean):
            raise ValueError("Invalid email format.")
        return clean

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[a-zA-Z0-9_]{3,32}$", clean):
            raise ValueError("Username must be 3-32 alphanumeric characters or underscores.")
        return clean


class UserLoginRequest(BaseModel):
    username_or_email: str = Field(min_length=3, max_length=128, description="Username or email")
    password: str = Field(min_length=1, max_length=128, description="Password")


class UserProfileResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    created_at: str


class AccountSummaryItem(BaseModel):
    id: str
    name: str
    user_id: str
    cash_balance: float
    total_equity: float
    realized_pnl: float
    currency: str = "INR"
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse
    active_account_id: str
    accounts: List[AccountSummaryItem]
