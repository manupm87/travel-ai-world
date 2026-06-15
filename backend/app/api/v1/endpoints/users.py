from typing import List
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_current_admin_user, get_user_service
from app.core.exceptions import ForbiddenException, NotFoundException
from app.schemas.user import UserResponse, UserUpdate, UserRoleUpdate
from app.services.user_service import UserService
from app.models.user import User

router = APIRouter()

# IMPORTANT: Static routes (e.g. /me) MUST be declared before parameterized routes
# (e.g. /{user_id}), otherwise FastAPI will try to parse "me" as an int and return 422.


@router.get("/", response_model=List[UserResponse])
async def read_users(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service),
):
    """
    Retrieve users (paginated). Max 500 per request.
    """
    return await user_service.get_users(skip=skip, limit=limit)


@router.get("/me", response_model=UserResponse)  # Declared BEFORE /{user_id}
async def read_user_me(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the profile of the currently authenticated user.
    """
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service),
):
    """
    Get a specific user by ID.
    """
    user = await user_service.get_user_by_id(user_id=user_id)
    if not user:
        raise NotFoundException(detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service),
):
    """
    Update a user. Only the owner of the account can update it.
    """
    user = await user_service.get_user_by_id(user_id=user_id)
    if not user:
        raise NotFoundException(detail="User not found")
    if current_user.id != user.id:
        raise ForbiddenException(detail="Not enough permissions")
    return await user_service.update_user(db_obj=user, user_in=user_in)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service),
):
    """
    Delete a user. Only the owner of the account can delete it.
    """
    user = await user_service.get_user_by_id(user_id=user_id)
    if not user:
        raise NotFoundException(detail="User not found")
    if current_user.id != user.id:
        raise ForbiddenException(detail="Not enough permissions")
    await user_service.delete_user(db_obj=user)
    return None


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role_in: UserRoleUpdate,
    current_user: User = Depends(get_current_admin_user),
    user_service: UserService = Depends(get_user_service),
):
    """
    Update a user's role. Only Administrators can perform this action.
    """
    user = await user_service.get_user_by_id(user_id=user_id)
    if not user:
        raise NotFoundException(detail="User not found")
    return await user_service.update_user(db_obj=user, user_in=role_in)
