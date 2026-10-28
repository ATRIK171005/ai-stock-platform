from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Service health status")
    version: str = Field(default="1.0.0", description="API version")
    environment: str = Field(default="development", description="Runtime environment")
    data_provider: str = Field(default="yfinance", description="Active market data provider")
    provider_status: str = Field(default="ready", description="Status of the market data engine")
    timestamp: str = Field(description="ISO 8601 current server timestamp")
