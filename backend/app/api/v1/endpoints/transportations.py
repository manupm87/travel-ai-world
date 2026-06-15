from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_transportation_service
from app.core.exceptions import NotFoundException
from app.schemas.transportation import (
    TransportationResponse,
    TransportationCreate,
    TransportationUpdate,
)
from app.services.transportation_service import TransportationService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[TransportationResponse])
async def read_transportations(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    transportation_service: TransportationService = Depends(get_transportation_service),
):
    """Retrieve transportations (paginated)."""
    return await transportation_service.get_transportations(skip=skip, limit=limit)


@router.post(
    "/", response_model=TransportationResponse, status_code=status.HTTP_201_CREATED
)
async def create_transportation(
    transportation_in: TransportationCreate,
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    transportation_service: TransportationService = Depends(get_transportation_service),
):
    """Creates a new transportation."""
    return await transportation_service.create_transportation(
        transportation_in=transportation_in, trip_id=trip_id
    )


@router.get("/{transportation_id}", response_model=TransportationResponse)
async def read_transportation(
    transportation_id: UUID,
    current_user: User = Depends(get_current_user),
    transportation_service: TransportationService = Depends(get_transportation_service),
):
    """Get a specific transportation by ID."""
    transportation = await transportation_service.get_transportation_by_id(
        transportation_id=transportation_id
    )
    if not transportation:
        raise NotFoundException(detail="Transportation not found")
    return transportation


@router.put("/{transportation_id}", response_model=TransportationResponse)
async def update_transportation(
    transportation_id: UUID,
    transportation_in: TransportationUpdate,
    current_user: User = Depends(get_current_user),
    transportation_service: TransportationService = Depends(get_transportation_service),
):
    """Update a transportation."""
    transportation = await transportation_service.get_transportation_by_id(
        transportation_id=transportation_id
    )
    if not transportation:
        raise NotFoundException(detail="Transportation not found")
    return await transportation_service.update_transportation(
        db_obj=transportation, transportation_in=transportation_in
    )


@router.delete("/{transportation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transportation(
    transportation_id: UUID,
    current_user: User = Depends(get_current_user),
    transportation_service: TransportationService = Depends(get_transportation_service),
):
    """Delete a transportation."""
    transportation = await transportation_service.get_transportation_by_id(
        transportation_id=transportation_id
    )
    if not transportation:
        raise NotFoundException(detail="Transportation not found")
    await transportation_service.delete_transportation(db_obj=transportation)
    return None
