from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_activity_service
from app.core.exceptions import NotFoundException
from app.schemas.activity import ActivityResponse, ActivityCreate, ActivityUpdate
from app.services.activity_service import ActivityService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[ActivityResponse])
async def read_activities(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service),
):
    """Retrieve activities (paginated)."""
    return await activity_service.get_activities(skip=skip, limit=limit)


@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity_in: ActivityCreate,
    itinerary_day_id: UUID,
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service),
):
    """Creates a new activity."""
    return await activity_service.create_activity(
        activity_in=activity_in, itinerary_day_id=itinerary_day_id
    )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def read_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service),
):
    """Get a specific activity by ID."""
    activity = await activity_service.get_activity_by_id(activity_id=activity_id)
    if not activity:
        raise NotFoundException(detail="Activity not found")
    return activity


@router.put("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: UUID,
    activity_in: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service),
):
    """Update an activity."""
    activity = await activity_service.get_activity_by_id(activity_id=activity_id)
    if not activity:
        raise NotFoundException(detail="Activity not found")
    return await activity_service.update_activity(
        db_obj=activity, activity_in=activity_in
    )


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service),
):
    """Delete an activity."""
    activity = await activity_service.get_activity_by_id(activity_id=activity_id)
    if not activity:
        raise NotFoundException(detail="Activity not found")
    await activity_service.delete_activity(db_obj=activity)
    return None
