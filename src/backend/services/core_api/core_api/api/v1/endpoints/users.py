"""User endpoints: the caller manages their own account; admins see everyone."""

from fastapi import APIRouter, Depends, status

from core_api.api.deps import (
    get_current_admin_user,
    get_current_user,
    get_user_service,
    page_params,
)
from core_api.pagination import Page
from core_api.schemas.user import UserResponse, UserRoleUpdate, UserUpdate
from core_api.services.user_service import UserService
from travel_common.principal import Principal

router = APIRouter()

# Static routes (/me) MUST be declared before parameterized ones (/{user_id}),
# otherwise FastAPI tries to parse "me" as an int and returns 422.


@router.get("/", response_model=list[UserResponse])
async def read_users(
    page: Page = Depends(page_params),
    _admin: Principal = Depends(get_current_admin_user),
    service: UserService = Depends(get_user_service),
):
    """List users (paginated). Administrators only."""
    return await service.list(page)


@router.get("/me", response_model=UserResponse)
async def read_user_me(
    principal: Principal = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
):
    """Profile of the authenticated user."""
    return await service.get(principal.id)


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    _admin: Principal = Depends(get_current_admin_user),
    service: UserService = Depends(get_user_service),
):
    """Get a user by ID. Administrators only (profiles are not public)."""
    return await service.get(user_id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_in: UserUpdate,
    principal: Principal = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
):
    """Update an account. Only its owner may do so."""
    return await service.update(await service.get_owned(user_id, principal), user_in)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    principal: Principal = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
) -> None:
    """Delete an account. Only its owner may do so."""
    await service.delete(await service.get_owned(user_id, principal))


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role_in: UserRoleUpdate,
    _admin: Principal = Depends(get_current_admin_user),
    service: UserService = Depends(get_user_service),
):
    """Change a user's role. Administrators only."""
    return await service.update(await service.get(user_id), role_in)
