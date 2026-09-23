"""Admin reads across every account (ADR 0024). Administrators only.

Every route logs one audit line, `admin_read subject=… route=… target=…`,
before it reads anything.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from core_api.api.deps import (
    get_current_admin_user,
    get_trip_service,
    get_user_service,
)
from core_api.auth.principal import AccountPrincipal
from core_api.schemas.admin import AdminTripPage, AdminUserPage
from core_api.schemas.trip import TripResponse
from core_api.services.trip_service import TripService
from core_api.services.user_service import UserService

logger = logging.getLogger(__name__)

MAX_ADMIN_PAGE = 200


async def audit_admin_read(
    request: Request,
    principal: AccountPrincipal = Depends(get_current_admin_user),
) -> AccountPrincipal:
    """The admin behind the request, after one audit line for the read."""
    params = request.path_params
    target = params.get("trip_id") or params.get("user_id") or "-"
    logger.info(
        "admin_read subject=%s route=%s target=%s",
        principal.subject,
        request.url.path,
        target,
    )
    return principal


router = APIRouter(dependencies=[Depends(audit_admin_read)])


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
