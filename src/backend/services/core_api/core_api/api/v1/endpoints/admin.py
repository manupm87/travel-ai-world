"""Admin routes (ADR 0024, ADR 0026). Administrators only: reads across every
account, and the access list, which they also write.

Every route logs one audit line before it does anything:
`admin_read subject=… route=… target=…` for a GET, `admin_write …` for a
PUT or DELETE.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status
from pydantic import EmailStr

from core_api.api.deps import (
    get_access_service,
    get_current_admin_user,
    get_trip_service,
    get_user_service,
)
from core_api.auth.principal import AccountPrincipal
from core_api.schemas.access import (
    AccessGrantPage,
    AccessGrantResponse,
    AccessGrantWrite,
)
from core_api.schemas.admin import AdminTripPage, AdminUserPage
from core_api.schemas.trip import TripResponse
from core_api.services.access_service import AccessService
from core_api.services.trip_service import TripService
from core_api.services.user_service import UserService

logger = logging.getLogger(__name__)

MAX_ADMIN_PAGE = 200


GrantEmail = Annotated[EmailStr, Path(description="The invited email")]


async def audit_admin(
    request: Request,
    principal: AccountPrincipal = Depends(get_current_admin_user),
) -> AccountPrincipal:
    """The admin behind the request, after one audit line: `admin_read` for a
    GET, `admin_write` for anything that changes the access list."""
    params = request.path_params
    target = (
        params.get("trip_id") or params.get("user_id") or params.get("email") or "-"
    )
    event = "admin_read" if request.method in ("GET", "HEAD") else "admin_write"
    logger.info(
        "%s subject=%s route=%s target=%s",
        event,
        principal.subject,
        request.url.path,
        target,
    )
    return principal


router = APIRouter(dependencies=[Depends(audit_admin)])


@router.get("/trips", response_model=AdminTripPage)
async def list_all_trips(
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=MAX_ADMIN_PAGE),
    trips: TripService = Depends(get_trip_service),
):
    """Every user's trips, newest first, a page at a time."""
    items, next_cursor = await trips.list_all(cursor, limit)
    return AdminTripPage.model_validate(
        {"items": items, "next_cursor": next_cursor}, from_attributes=True
    )


@router.get("/trips/{user_id}/{trip_id}", response_model=TripResponse)
async def read_any_trip(
    user_id: UUID,
    trip_id: UUID,
    trips: TripService = Depends(get_trip_service),
):
    """One trip, whole, whoever owns it."""
    return await trips.get_any(user_id, trip_id)


@router.get("/users", response_model=AdminUserPage)
async def list_all_users(
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=MAX_ADMIN_PAGE),
    users: UserService = Depends(get_user_service),
):
    """Every account by email, with the `subject` the AI traces name it by."""
    items, next_cursor = await users.list_page(cursor, limit)
    return AdminUserPage.model_validate(
        {"items": items, "next_cursor": next_cursor}, from_attributes=True
    )


# ── Access list (ADR 0026) ───────────────────────────────────────────────────


@router.get("/access", response_model=AccessGrantPage)
async def list_access_grants(
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=MAX_ADMIN_PAGE),
    access: AccessService = Depends(get_access_service),
):
    """Every invited email, in order, a page at a time."""
    items, next_cursor = await access.list_page(cursor, limit)
    return AccessGrantPage.model_validate(
        {"items": items, "next_cursor": next_cursor}, from_attributes=True
    )


@router.put("/access/{email}", response_model=AccessGrantResponse)
async def put_access_grant(
    email: GrantEmail,
    grant_in: AccessGrantWrite,
    admin: AccountPrincipal = Depends(get_current_admin_user),
    access: AccessService = Depends(get_access_service),
):
    """Invite an email, or change its daily limit and note (an upsert)."""
    return await access.upsert(email, grant_in.daily_token_limit, grant_in.note, admin)


@router.delete("/access/{email}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_access_grant(
    email: GrantEmail,
    access: AccessService = Depends(get_access_service),
) -> None:
    """Take an email off the list; 404 when it was not on it."""
    await access.remove(email)
