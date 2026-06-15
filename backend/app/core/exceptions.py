from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class BaseAPIException(HTTPException):
    """Base class for structured API exceptions."""

    def __init__(
        self,
        status_code: int,
        detail: Any,
        error_code: str,
        headers: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ):
        structured_detail: Dict[str, Any] = {}
        if isinstance(detail, str):
            structured_detail["message"] = detail
            structured_detail["error_code"] = error_code
            if kwargs:
                structured_detail["extras"] = kwargs
        else:
            # Fallback if someone passes a dict directly
            structured_detail = detail

        super().__init__(
            status_code=status_code, detail=structured_detail, headers=headers
        )


# ── 4xx Client Errors ────────────────────────────────────────────────────────


class BadRequestException(BaseAPIException):
    """400 — The request is malformed or contains invalid parameters."""

    def __init__(
        self,
        detail: Any = "Bad request",
        error_code: str = "BAD_REQUEST",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class UnauthorizedException(BaseAPIException):
    """401 — Missing or invalid authentication credentials."""

    def __init__(
        self,
        detail: Any = "Not authenticated",
        error_code: str = "UNAUTHORIZED",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code=error_code,
            headers={"WWW-Authenticate": "Bearer"},
            **kwargs,
        )


class ForbiddenException(BaseAPIException):
    """403 — Authenticated but not allowed to perform this action."""

    def __init__(
        self,
        detail: Any = "Not enough permissions",
        error_code: str = "FORBIDDEN",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class NotFoundException(BaseAPIException):
    """404 — The requested resource does not exist."""

    def __init__(
        self,
        detail: Any = "Resource not found",
        error_code: str = "NOT_FOUND",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class ConflictException(BaseAPIException):
    """409 — The request conflicts with the current state (e.g. duplicate email)."""

    def __init__(
        self,
        detail: Any = "Resource already exists",
        error_code: str = "CONFLICT",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class UnprocessableEntityException(BaseAPIException):
    """422 — The request is well-formed but contains semantic errors."""

    def __init__(
        self,
        detail: Any = "Unprocessable entity",
        error_code: str = "UNPROCESSABLE_ENTITY",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class TooManyRequestsException(BaseAPIException):
    """429 — The client has sent too many requests (rate limiting)."""

    def __init__(
        self,
        detail: Any = "Too many requests. Please slow down.",
        error_code: str = "TOO_MANY_REQUESTS",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


# ── 5xx Server Errors ────────────────────────────────────────────────────────


class InternalServerErrorException(BaseAPIException):
    """500 — An unexpected server-side error occurred."""

    def __init__(
        self,
        detail: Any = "An unexpected error occurred",
        error_code: str = "INTERNAL_SERVER_ERROR",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )


class ServiceUnavailableException(BaseAPIException):
    """503 — The server is temporarily unable to handle the request (e.g. DB down)."""

    def __init__(
        self,
        detail: Any = "Service temporarily unavailable",
        error_code: str = "SERVICE_UNAVAILABLE",
        **kwargs: Any,
    ):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
            error_code=error_code,
            **kwargs,
        )
