"""Translate domain errors into HTTP responses.

Body shape is stable and shared by every service:

    {"detail": {"message": "...", "error_code": "...", "extras": {...}}}
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette import status

from travel_common.exceptions import (
    BadRequest,
    Conflict,
    DomainError,
    EntityNotFound,
    Forbidden,
    ProviderUnavailable,
    TooManyRequests,
    Unauthorized,
    UnprocessableEntity,
)

_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    BadRequest: status.HTTP_400_BAD_REQUEST,
    Unauthorized: status.HTTP_401_UNAUTHORIZED,
    Forbidden: status.HTTP_403_FORBIDDEN,
    EntityNotFound: status.HTTP_404_NOT_FOUND,
    Conflict: status.HTTP_409_CONFLICT,
    UnprocessableEntity: 422,
    TooManyRequests: status.HTTP_429_TOO_MANY_REQUESTS,
    ProviderUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE,
}


def status_for(exc: DomainError) -> int:
    for cls in type(exc).__mro__:
        if cls in _STATUS_BY_ERROR:
            return _STATUS_BY_ERROR[cls]
    return status.HTTP_500_INTERNAL_SERVER_ERROR


async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    detail: dict[str, object] = {"message": exc.message, "error_code": exc.error_code}
    if exc.extras:
        detail["extras"] = exc.extras
    headers = {"WWW-Authenticate": "Bearer"} if isinstance(exc, Unauthorized) else None
    return JSONResponse(
        status_code=status_for(exc), content={"detail": detail}, headers=headers
    )


def register_error_handlers(app: FastAPI) -> None:
    # Starlette types handlers for a plain Exception; this one takes the subclass
    app.add_exception_handler(DomainError, domain_error_handler)  # type: ignore[arg-type]
