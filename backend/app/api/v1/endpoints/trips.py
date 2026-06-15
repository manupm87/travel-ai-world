from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_trip_service
from app.core.exceptions import NotFoundException, ForbiddenException
from app.schemas.trip import TripResponse, TripCreate, TripUpdate
from app.services.trip_service import TripService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[TripResponse])
async def read_trips(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    trip_service: TripService = Depends(get_trip_service),
):
    """Retrieve trips (paginated)."""
    return await trip_service.get_trips(skip=skip, limit=limit)


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    trip_in: TripCreate,
    current_user: User = Depends(get_current_user),
    trip_service: TripService = Depends(get_trip_service),
):
    """Creates a new trip."""
    return await trip_service.create_trip(trip_in=trip_in, user_id=current_user.id)


@router.get("/{trip_id}", response_model=TripResponse)
async def read_trip(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    trip_service: TripService = Depends(get_trip_service),
):
    """Get a specific trip by ID."""
    trip = await trip_service.get_trip_by_id(trip_id=trip_id)
    if not trip:
        raise NotFoundException(detail="Trip not found")
    if trip.user_id != current_user.id:
        raise ForbiddenException(detail="Not enough permissions")
    return trip


@router.put("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: UUID,
    trip_in: TripUpdate,
    current_user: User = Depends(get_current_user),
    trip_service: TripService = Depends(get_trip_service),
):
    """Update a trip."""
    trip = await trip_service.get_trip_by_id(trip_id=trip_id)
    if not trip:
        raise NotFoundException(detail="Trip not found")
    if trip.user_id != current_user.id:
        raise ForbiddenException(detail="Not enough permissions")
    return await trip_service.update_trip(db_obj=trip, trip_in=trip_in)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    trip_service: TripService = Depends(get_trip_service),
):
    """Delete a trip."""
    trip = await trip_service.get_trip_by_id(trip_id=trip_id)
    if not trip:
        raise NotFoundException(detail="Trip not found")
    if trip.user_id != current_user.id:
        raise ForbiddenException(detail="Not enough permissions")
    await trip_service.delete_trip(db_obj=trip)
    return None
