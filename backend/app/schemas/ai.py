"""Pydantic schemas for Google Gemini AI Market Analyst."""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatSender(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class AIChatMessage(BaseModel):
    sender: ChatSender
    text: str = Field(max_length=2000, description="Chat message text")
    timestamp: Optional[str] = None


class AINewsItem(BaseModel):
    headline: str = Field(description="Article headline")
    source: str = Field(description="News publisher or source")
    url: Optional[str] = Field(default=None, description="Article URL if available")
    timestamp: Optional[str] = Field(default=None, description="Publication timestamp")
    impact: str = Field(default="NEUTRAL", description="Market sentiment impact: POSITIVE, NEUTRAL, or NEGATIVE")
    summary: str = Field(description="Factual summary of news content")


class AIAnalysisRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000, description="User question or research prompt")
    symbol: str = Field(default="RELIANCE.NS", description="Stock symbol (e.g., RELIANCE.NS, TCS.NS)")
    backtest_id: Optional[str] = Field(default=None, description="Optional ID of backtest to explain")
    conversation_history: Optional[List[AIChatMessage]] = Field(
        default=None,
        description="Recent conversation history for conversational context (max 10 turns)",
    )


class StructuredAIAnalysis(BaseModel):
    """Structured response schema enforced via Gemini model JSON output."""

    summary: str = Field(description="Direct executive summary answering the user's specific query")
    observed_facts: Dict[str, Any] = Field(
        default_factory=dict,
        description="Strictly observed quantitative metrics, prices, and indicator values directly from supplied data",
    )
    interpretation: str = Field(
        description="Model hypothesis and qualitative analysis clearly distinguishing interpretation from facts",
    )
    supporting_evidence: List[str] = Field(
        default_factory=list,
        description="Factual evidence points from the supplied market data that substantiate the interpretation",
    )
    key_risks: List[str] = Field(
        default_factory=list,
        description="Key risk factors, volatility triggers, and downside threats",
    )
    uncertainties: List[str] = Field(
        default_factory=list,
        description="Data freshness limitations, missing metrics, or market uncertainties",
    )
    news_analysis: Optional[List[AINewsItem]] = Field(
        default=None,
        description="Synthesized news items if relevant to the query and context",
    )
    data_timestamp: str = Field(
        default="",
        description="Timestamp of the underlying historical market data",
    )
    disclaimer: str = Field(
        default="AI Market Analyst output is synthesized for simulation and quantitative research only. It does not constitute SEBI registered investment advice.",
        description="Statutory non-advisory disclaimer",
    )


class AIAnalysisResponse(BaseModel):
    """Full API response wrapper returned to frontend."""

    symbol: str
    question: str
    model: str
    analysis: StructuredAIAnalysis
    backtest_id: Optional[str] = None
    cached: bool = False
    timestamp: str


class AIHealthResponse(BaseModel):
    status: str = Field(description="'ready' if configured, 'not_configured' otherwise")
    configured: bool = Field(description="True if GEMINI_API_KEY is present")
    model: str = Field(description="Configured Gemini model ID")
    provider: str = Field(default="Google Gemini")
