"""Trip endpoints — every trip is private to the user who owns it."""

from fastapi import APIRouter, Depends, status
from travel_common.principal import Principal

from core_api.api.deps import (
    get_current_user,
    get_owned_trip,
    get_trip_service,
    page_params,
)
from core_api.models.trip import Trip
from core_api.pagination import Page
from core_api.schemas.trip import TripCreate, TripResponse, TripUpdate
from core_api.services.trip_service import TripService

router = APIRouter()


@router.get("/", response_model=list[TripResponse])
async def read_trips(
    page: Page = Depends(page_params),
    principal: Principal = Depends(get_current_user),
    service: TripService = Depends(get_trip_service),
):
    """The caller's trips (paginated)."""
    return await service.list_for(principal, page)


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    trip_in: TripCreate,
    principal: Principal = Depends(get_current_user),
    service: TripService = Depends(get_trip_service),
):
    """Create a trip owned by the caller."""
    return await service.create(trip_in, user_id=principal.id)


@router.get("/{trip_id}", response_model=TripResponse)
async def read_trip(trip: Trip = Depends(get_owned_trip)):
    """Get one of the caller's trips, children included."""
    return trip


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_in: TripUpdate,  # type: ignore[valid-type]
    trip: Trip = Depends(get_owned_trip),
    service: TripService = Depends(get_trip_service),
):
    """Partially update one of the caller's trips."""
    return await service.update(trip, trip_in)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip: Trip = Depends(get_owned_trip),
    service: TripService = Depends(get_trip_service),
) -> None:
    """Delete one of the caller's trips and everything in it."""
    await service.delete(trip)
