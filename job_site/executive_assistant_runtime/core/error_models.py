"""
error_models.py — EXEC-AI-RAPID-002 / S2.1

Standard error types for the executive assistant runtime.
Channel wrappers translate their own exceptions into these types before
passing anything to assistant_core. No channel-specific details leak here.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ErrorCode(str, Enum):
    # Input / validation
    EMPTY_INPUT = "EMPTY_INPUT"
    INVALID_INPUT = "INVALID_INPUT"
    SESSION_MISSING = "SESSION_MISSING"

    # Routing
    UNKNOWN_INTENT = "UNKNOWN_INTENT"
    NO_HANDLER = "NO_HANDLER"
    ROUTING_FAILED = "ROUTING_FAILED"

    # Backend / action
    BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE"
    ACTION_FAILED = "ACTION_FAILED"
    DEMO_MODE_LIMIT = "DEMO_MODE_LIMIT"

    # Dialog
    CONTEXT_LOST = "CONTEXT_LOST"
    CONFIRMATION_TIMEOUT = "CONFIRMATION_TIMEOUT"

    # Fallback
    UNHANDLED = "UNHANDLED"


@dataclass
class AssistantError(Exception):
    """Base error for all assistant runtime failures."""
    code: ErrorCode
    message: str = ""
    detail: Optional[str] = None
    recoverable: bool = True

    def __str__(self) -> str:
        parts = [f"[{self.code}] {self.message}"]
        if self.detail:
            parts.append(f"detail={self.detail!r}")
        return " | ".join(parts)


@dataclass
class InputValidationError(AssistantError):
    """Raised when incoming input cannot be processed."""
    code: ErrorCode = field(default=ErrorCode.INVALID_INPUT)
    recoverable: bool = True


@dataclass
class ActionRoutingError(AssistantError):
    """Raised when the action router cannot find or run a handler."""
    code: ErrorCode = field(default=ErrorCode.ROUTING_FAILED)
    recoverable: bool = True


@dataclass
class BackendUnavailableError(AssistantError):
    """Raised when a downstream service or provider is unreachable."""
    code: ErrorCode = field(default=ErrorCode.BACKEND_UNAVAILABLE)
    recoverable: bool = True  # demo-mode fallback may still produce output


@dataclass
class DemoModeLimitError(AssistantError):
    """Raised when a requested operation exceeds what demo mode can fake."""
    code: ErrorCode = field(default=ErrorCode.DEMO_MODE_LIMIT)
    recoverable: bool = True


@dataclass
class ContextLostError(AssistantError):
    """Raised when required dialog context cannot be restored."""
    code: ErrorCode = field(default=ErrorCode.CONTEXT_LOST)
    recoverable: bool = False


@dataclass
class UnhandledError(AssistantError):
    """Catch-all for truly unexpected failures — triggers fallback path."""
    code: ErrorCode = field(default=ErrorCode.UNHANDLED)
    recoverable: bool = True


# ---------------------------------------------------------------------------
# Error response envelope — used by assistant_core to surface errors to
# callers in a uniform shape regardless of the originating channel.
# ---------------------------------------------------------------------------

@dataclass
class ErrorResponse:
    code: ErrorCode
    user_message: str          # safe, user-facing text
    internal_detail: Optional[str] = None
    recoverable: bool = True

    @classmethod
    def from_error(cls, error: AssistantError, user_message: str) -> "ErrorResponse":
        return cls(
            code=error.code,
            user_message=user_message,
            internal_detail=str(error),
            recoverable=error.recoverable,
        )

    @classmethod
    def generic_fallback(cls) -> "ErrorResponse":
        return cls(
            code=ErrorCode.UNHANDLED,
            user_message=(
                "I ran into an unexpected issue. "
                "Please try again or type 'help' for options."
            ),
            recoverable=True,
        )
