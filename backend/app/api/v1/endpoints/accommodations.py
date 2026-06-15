from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_accommodation_service
from app.core.exceptions import NotFoundException
from app.schemas.accommodation import (
    AccommodationResponse,
    AccommodationCreate,
    AccommodationUpdate,
)
from app.services.accommodation_service import AccommodationService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[AccommodationResponse])
async def read_accommodations(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    accommodation_service: AccommodationService = Depends(get_accommodation_service),
):
    """Retrieve accommodations (paginated)."""
    return await accommodation_service.get_accommodations(skip=skip, limit=limit)


@router.post(
    "/", response_model=AccommodationResponse, status_code=status.HTTP_201_CREATED
)
async def create_accommodation(
    accommodation_in: AccommodationCreate,
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    accommodation_service: AccommodationService = Depends(get_accommodation_service),
):
    """Creates a new accommodation."""
    return await accommodation_service.create_accommodation(
        accommodation_in=accommodation_in, trip_id=trip_id
    )


@router.get("/{accommodation_id}", response_model=AccommodationResponse)
async def read_accommodation(
    accommodation_id: UUID,
    current_user: User = Depends(get_current_user),
    accommodation_service: AccommodationService = Depends(get_accommodation_service),
):
    """Get a specific accommodation by ID."""
    accommodation = await accommodation_service.get_accommodation_by_id(
        accommodation_id=accommodation_id
    )
    if not accommodation:
        raise NotFoundException(detail="Accommodation not found")
    return accommodation


@router.put("/{accommodation_id}", response_model=AccommodationResponse)
async def update_accommodation(
    accommodation_id: UUID,
    accommodation_in: AccommodationUpdate,
    current_user: User = Depends(get_current_user),
    accommodation_service: AccommodationService = Depends(get_accommodation_service),
):
    """Update an accommodation."""
    accommodation = await accommodation_service.get_accommodation_by_id(
        accommodation_id=accommodation_id
    )
    if not accommodation:
        raise NotFoundException(detail="Accommodation not found")
    return await accommodation_service.update_accommodation(
        db_obj=accommodation, accommodation_in=accommodation_in
    )


@router.delete("/{accommodation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_accommodation(
    accommodation_id: UUID,
    current_user: User = Depends(get_current_user),
    accommodation_service: AccommodationService = Depends(get_accommodation_service),
):
    """Delete an accommodation."""
    accommodation = await accommodation_service.get_accommodation_by_id(
        accommodation_id=accommodation_id
    )
    if not accommodation:
        raise NotFoundException(detail="Accommodation not found")
    await accommodation_service.delete_accommodation(db_obj=accommodation)
    return None
