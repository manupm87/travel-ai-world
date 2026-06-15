from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_destination_service
from app.core.exceptions import NotFoundException
from app.schemas.destination import (
    DestinationResponse,
    DestinationCreate,
    DestinationUpdate,
)
from app.services.destination_service import DestinationService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[DestinationResponse])
async def read_destinations(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    destination_service: DestinationService = Depends(get_destination_service),
):
    """Retrieve destinations (paginated)."""
    return await destination_service.get_destinations(skip=skip, limit=limit)


@router.post(
    "/", response_model=DestinationResponse, status_code=status.HTTP_201_CREATED
)
async def create_destination(
    destination_in: DestinationCreate,
    trip_id: UUID,  # Or passed within the body, doing query param here for simplicity if not in schema.
    current_user: User = Depends(get_current_user),
    destination_service: DestinationService = Depends(get_destination_service),
):
    """Creates a new destination."""
    return await destination_service.create_destination(
        destination_in=destination_in, trip_id=trip_id
    )


@router.get("/{destination_id}", response_model=DestinationResponse)
async def read_destination(
    destination_id: UUID,
    current_user: User = Depends(get_current_user),
    destination_service: DestinationService = Depends(get_destination_service),
):
    """Get a specific destination by ID."""
    destination = await destination_service.get_destination_by_id(
        destination_id=destination_id
    )
    if not destination:
        raise NotFoundException(detail="Destination not found")
    return destination


@router.put("/{destination_id}", response_model=DestinationResponse)
async def update_destination(
    destination_id: UUID,
    destination_in: DestinationUpdate,
    current_user: User = Depends(get_current_user),
    destination_service: DestinationService = Depends(get_destination_service),
):
    """Update a destination."""
    destination = await destination_service.get_destination_by_id(
        destination_id=destination_id
    )
    if not destination:
        raise NotFoundException(detail="Destination not found")
    return await destination_service.update_destination(
        db_obj=destination, destination_in=destination_in
    )


@router.delete("/{destination_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_destination(
    destination_id: UUID,
    current_user: User = Depends(get_current_user),
    destination_service: DestinationService = Depends(get_destination_service),
):
    """Delete a destination."""
    destination = await destination_service.get_destination_by_id(
        destination_id=destination_id
    )
    if not destination:
        raise NotFoundException(detail="Destination not found")
    await destination_service.delete_destination(db_obj=destination)
    return None
