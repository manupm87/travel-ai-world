"""Domain errors.

Services raise these; they carry no HTTP knowledge. The API layer maps them
to status codes and the structured JSON body in `core/error_handlers.py`.
"""

from typing import Any


class DomainError(Exception):
    """Base class for every error the application raises on purpose."""

    error_code: str = "DOMAIN_ERROR"
    default_message: str = "Domain error"

    def __init__(self, message: str | None = None, **extras: Any) -> None:
        self.message = message or self.default_message
        self.extras = extras
        super().__init__(self.message)


class BadRequest(DomainError):
    error_code = "BAD_REQUEST"
    default_message = "Bad request"


class Unauthorized(DomainError):
    error_code = "UNAUTHORIZED"
    default_message = "Not authenticated"


class Forbidden(DomainError):
    error_code = "FORBIDDEN"
    default_message = "Not enough permissions"


class EntityNotFound(DomainError):
    error_code = "NOT_FOUND"
    default_message = "Resource not found"

    def __init__(self, entity: str = "Resource", entity_id: Any = None) -> None:
        extras = {"id": str(entity_id)} if entity_id is not None else {}
        super().__init__(f"{entity} not found", **extras)


class Conflict(DomainError):
    error_code = "CONFLICT"
    default_message = "Resource already exists"


class TripLocked(Conflict):
    """A trip that is happening now or already over cannot be changed.

    Its phase is derived from its dates, so the lock comes and goes on its
    own; `extras["phase"]` says which one refused the write.
    """

    error_code = "TRIP_LOCKED"
    default_message = "Trip is locked: it is ongoing or past"


class UnprocessableEntity(DomainError):
    error_code = "UNPROCESSABLE_ENTITY"
    default_message = "Unprocessable entity"


class TooManyRequests(DomainError):
    error_code = "TOO_MANY_REQUESTS"
    default_message = "Too many requests. Please slow down."


class ProviderUnavailable(DomainError):
    """An upstream dependency (database, AI provider, ...) cannot serve us."""

    error_code = "SERVICE_UNAVAILABLE"
    default_message = "Service temporarily unavailable"
