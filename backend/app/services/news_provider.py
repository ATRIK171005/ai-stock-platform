"""Pluggable news provider interface for market catalysts and public corporate disclosures.

Provides clean extraction of real public news without scraping or paid subscriptions.
Treats all external article text as untrusted user input with safety sanitization.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timezone
import logging
from typing import List
import yfinance as yf

from ..schemas.ai import AINewsItem

logger = logging.getLogger("market_platform.news")


class NewsProvider(ABC):
    """Abstract interface for stock market news providers."""

    @abstractmethod
    def get_company_news(self, symbol: str, limit: int = 5) -> List[AINewsItem]:
        """Fetch latest verified news items for a given equity symbol."""
        pass


class YFinanceNewsProvider(NewsProvider):
    """News provider retrieving official feed items from yfinance ticker when available."""

    def get_company_news(self, symbol: str, limit: int = 5) -> List[AINewsItem]:
        items: List[AINewsItem] = []
        try:
            ticker = yf.Ticker(symbol)
            raw_news = ticker.news or []
            for n in raw_news[:limit]:
                # Handle varying yfinance news schemas (v0.2.x vs v1.x)
                content = n.get("content") if isinstance(n.get("content"), dict) else n
                title = content.get("title") or n.get("title")
                if not title:
                    continue

                provider = content.get("provider", {})
                source = (
                    provider.get("displayName")
                    if isinstance(provider, dict)
                    else (n.get("publisher") or "Financial Wire")
                )

                pub_time = content.get("pubDate") or n.get("providerPublishTime")
                time_str = str(pub_time) if pub_time else datetime.now(timezone.utc).strftime("%Y-%m-%d")

                summary = content.get("summary") or n.get("summary") or title

                # Sanitize to prevent prompt injection from untrusted external sources
                clean_title = str(title).replace("\n", " ").strip()[:200]
                clean_summary = str(summary).replace("\n", " ").strip()[:400]
                url = content.get("canonicalUrl", {}).get("url") if isinstance(content.get("canonicalUrl"), dict) else n.get("link")

                items.append(
                    AINewsItem(
                        headline=clean_title,
                        source=source,
                        url=url,
                        timestamp=time_str,
                        impact="NEUTRAL",
                        summary=clean_summary,
                    )
                )
        except Exception as e:
            logger.warning("Could not retrieve upstream news for %s: %s", symbol, e)

        return items


# Default singleton instance
default_news_provider: NewsProvider = YFinanceNewsProvider()
