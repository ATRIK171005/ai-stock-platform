"""Custom domain exceptions and error handling."""

class MarketPlatformError(Exception):
    """Base exception for market platform."""
    def __init__(self, message: str, error_code: str = "MARKET_ERROR", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code


class InvalidSymbolError(MarketPlatformError):
    """Raised when an equity symbol is malformed or invalid."""
    def __init__(self, message: str):
        super().__init__(message, error_code="INVALID_SYMBOL", status_code=400)


class DataUnavailableError(MarketPlatformError):
    """Raised when historical market data is not found or empty."""
    def __init__(self, message: str):
        super().__init__(message, error_code="DATA_UNAVAILABLE", status_code=404)


class RateLimitOrTimeoutError(MarketPlatformError):
    """Raised when upstream market data provider times out or throttles."""
    def __init__(self, message: str):
        super().__init__(message, error_code="PROVIDER_TIMEOUT", status_code=504)


class InsufficientDataError(MarketPlatformError):
    """Raised when data has too few rows to compute indicators."""
    def __init__(self, message: str):
        super().__init__(message, error_code="INSUFFICIENT_DATA", status_code=422)


class ValidationError(MarketPlatformError):
    """Raised when input parameters (e.g. period, interval) are invalid."""
    def __init__(self, message: str):
        super().__init__(message, error_code="VALIDATION_ERROR", status_code=400)


class BacktestNotFoundError(MarketPlatformError):
    """Raised when requested backtest ID is not found in cache."""
    def __init__(self, message: str = "Backtest run not found."):
        super().__init__(message, error_code="BACKTEST_NOT_FOUND", status_code=404)


class AIKeyNotConfiguredError(MarketPlatformError):
    """Raised when GEMINI_API_KEY is not configured on the backend."""
    def __init__(
        self,
        message: str = "GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in backend/.env to enable the AI Market Analyst.",
    ):
        super().__init__(message, error_code="AI_KEY_NOT_CONFIGURED", status_code=503)


class AIRateLimitError(MarketPlatformError):
    """Raised when Gemini API quota or rate limits are reached."""
    def __init__(self, message: str = "Google Gemini rate limit exceeded. Please wait a moment before asking again."):
        super().__init__(message, error_code="AI_RATE_LIMIT", status_code=429)


class AITimeoutError(MarketPlatformError):
    """Raised when Gemini API request times out."""
    def __init__(self, message: str = "Google Gemini request timed out while analyzing market context."):
        super().__init__(message, error_code="AI_TIMEOUT", status_code=504)


class AIProviderError(MarketPlatformError):
    """Raised when Gemini returns an upstream error or malformed response."""
    def __init__(self, message: str = "Upstream Google Gemini provider error occurred."):
        super().__init__(message, error_code="AI_PROVIDER_ERROR", status_code=502)


class InsufficientCashError(MarketPlatformError):
    """Raised when paper trading cash is insufficient for the requested BUY order."""
    def __init__(self, message: str = "Insufficient virtual cash to execute simulated order."):
        super().__init__(message, error_code="INSUFFICIENT_CASH", status_code=400)


class InsufficientHoldingsError(MarketPlatformError):
    """Raised when attempting to SELL more shares than currently owned."""
    def __init__(self, message: str = "Insufficient shares held to execute simulated SELL order."):
        super().__init__(message, error_code="INSUFFICIENT_HOLDINGS", status_code=400)


class RiskLimitViolationError(MarketPlatformError):
    """Raised when a simulated order violates backend risk management rules."""
    def __init__(self, message: str):
        super().__init__(message, error_code="RISK_LIMIT_VIOLATION", status_code=400)


class DuplicateOrderError(MarketPlatformError):
    """Raised when an order with an existing idempotency key is submitted."""
    def __init__(self, message: str = "Duplicate order submission rejected."):
        super().__init__(message, error_code="DUPLICATE_ORDER", status_code=409)


class ResetConfirmationRequiredError(MarketPlatformError):
    """Raised when account reset request is submitted without explicit confirmation."""
    def __init__(self, message: str = "Account reset requires explicit confirm=true."):
        super().__init__(message, error_code="RESET_CONFIRMATION_REQUIRED", status_code=400)


class InvalidAccountError(MarketPlatformError):
    """Raised when an account ID fails validation format checks."""
    def __init__(self, message: str = "Invalid account ID format. Must contain 3-64 alphanumeric characters, underscores, or hyphens."):
        super().__init__(message, error_code="INVALID_ACCOUNT_ID", status_code=400)


class UnauthorizedAccountError(MarketPlatformError):
    """Raised when an unauthorized request attempts to access or modify a paper account."""
    def __init__(self, message: str = "Unauthorized account access. Valid authorization header or matching account token required."):
        super().__init__(message, error_code="UNAUTHORIZED_ACCOUNT", status_code=403)


class InvalidInputError(MarketPlatformError):
    """Raised when request parameters fail business logic or walk-forward requirements."""
    def __init__(self, message: str = "Invalid input parameters supplied."):
        super().__init__(message, error_code="INVALID_INPUT", status_code=400)


class AuthenticationError(MarketPlatformError):
    """Raised when authentication credentials or token are invalid."""
    def __init__(self, message: str = "Invalid credentials or expired session."):
        super().__init__(message, error_code="AUTHENTICATION_FAILED", status_code=401)


class UserAlreadyExistsError(MarketPlatformError):
    """Raised when registration username or email is already taken."""
    def __init__(self, message: str = "Username or email is already registered."):
        super().__init__(message, error_code="USER_ALREADY_EXISTS", status_code=409)


class UserNotFoundError(MarketPlatformError):
    """Raised when user account is not found."""
    def __init__(self, message: str = "User account not found."):
        super().__init__(message, error_code="USER_NOT_FOUND", status_code=404)





