from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_itinerary_day_service
from app.core.exceptions import NotFoundException
from app.schemas.itinerary_day import (
    ItineraryDayResponse,
    ItineraryDayCreate,
    ItineraryDayUpdate,
)
from app.services.itinerary_day_service import ItineraryDayService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[ItineraryDayResponse])
async def read_itinerary_days(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    itinerary_day_service: ItineraryDayService = Depends(get_itinerary_day_service),
):
    """Retrieve itinerary days (paginated)."""
    return await itinerary_day_service.get_itinerary_days(skip=skip, limit=limit)


@router.post(
    "/", response_model=ItineraryDayResponse, status_code=status.HTTP_201_CREATED
)
async def create_itinerary_day(
    itinerary_day_in: ItineraryDayCreate,
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    itinerary_day_service: ItineraryDayService = Depends(get_itinerary_day_service),
):
    """Creates a new itinerary day."""
    return await itinerary_day_service.create_itinerary_day(
        itinerary_day_in=itinerary_day_in, trip_id=trip_id
    )


@router.get("/{itinerary_day_id}", response_model=ItineraryDayResponse)
async def read_itinerary_day(
    itinerary_day_id: UUID,
    current_user: User = Depends(get_current_user),
    itinerary_day_service: ItineraryDayService = Depends(get_itinerary_day_service),
):
    """Get a specific itinerary day by ID."""
    itinerary_day = await itinerary_day_service.get_itinerary_day_by_id(
        itinerary_day_id=itinerary_day_id
    )
    if not itinerary_day:
        raise NotFoundException(detail="Itinerary day not found")
    return itinerary_day


@router.put("/{itinerary_day_id}", response_model=ItineraryDayResponse)
async def update_itinerary_day(
    itinerary_day_id: UUID,
    itinerary_day_in: ItineraryDayUpdate,
    current_user: User = Depends(get_current_user),
    itinerary_day_service: ItineraryDayService = Depends(get_itinerary_day_service),
):
    """Update an itinerary day."""
    itinerary_day = await itinerary_day_service.get_itinerary_day_by_id(
        itinerary_day_id=itinerary_day_id
    )
    if not itinerary_day:
        raise NotFoundException(detail="Itinerary day not found")
    return await itinerary_day_service.update_itinerary_day(
        db_obj=itinerary_day, itinerary_day_in=itinerary_day_in
    )


@router.delete("/{itinerary_day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary_day(
    itinerary_day_id: UUID,
    current_user: User = Depends(get_current_user),
    itinerary_day_service: ItineraryDayService = Depends(get_itinerary_day_service),
):
    """Delete an itinerary day."""
    itinerary_day = await itinerary_day_service.get_itinerary_day_by_id(
        itinerary_day_id=itinerary_day_id
    )
    if not itinerary_day:
        raise NotFoundException(detail="Itinerary day not found")
    await itinerary_day_service.delete_itinerary_day(db_obj=itinerary_day)
    return None
