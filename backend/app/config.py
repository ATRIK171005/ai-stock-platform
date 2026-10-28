import json
from typing import Any, List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MarketIQ Stock API"
    environment: str = "development"
    port: int = 8000
    host: str = "0.0.0.0"
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    cache_ttl_seconds: int = 300  # 5 minutes in-memory cache
    request_timeout_seconds: int = 15
    default_exchange: str = "NSE"
    data_provider: str = "YAHOO_FINANCE"

    # Security & Rate Limiting
    api_secret_key: Optional[str] = None  # If set, requires auth header on protected endpoints
    jwt_secret_key: str = "marketiq-jwt-secret-key-change-in-production-random-secure-string"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 10080  # 7 days default
    rate_limit_per_minute: int = 120  # General API requests per minute per IP
    max_request_body_size_bytes: int = 1048576  # 1 MB max payload

    # AI Model Configuration (Google Gemini & Groq)
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: Optional[str] = None
    groq_model: str = "openai/gpt-oss-120b"
    ai_provider: str = "AUTO"  # "AUTO", "GROQ", or "GEMINI"
    ai_request_timeout_seconds: int = 20
    ai_max_history_messages: int = 10

    # Database & Paper Trading Configuration
    database_url: str = "sqlite:///./paper_trading.db"
    paper_initial_capital: float = 100000.0
    paper_default_brokerage_pct: float = 0.05
    paper_default_slippage_pct: float = 0.02
    paper_max_position_size_pct: float = 25.0
    paper_max_order_value: float = 50000.0
    paper_daily_loss_limit: float = 5000.0
    paper_max_open_positions: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    return json.loads(v_trimmed)
                except Exception:
                    pass
            return [origin.strip() for origin in v_trimmed.split(",") if origin.strip()]
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            v_trimmed = v.strip()
            # Convert legacy postgres:// to postgresql:// for SQLAlchemy 2.0
            if v_trimmed.startswith("postgres://"):
                return v_trimmed.replace("postgres://", "postgresql://", 1)
            return v_trimmed
        return v


settings = Settings()
