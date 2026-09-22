import uuid

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.auth.principal import AccountPrincipal
from core_api.domain.models import Trip
from core_api.domain.ports import TripRepository
from core_api.pagination import Page
from core_api.schemas.trip import TripCreate
from core_api.services import apply_changes


class TripService:
    """A user's trips: private to their owner, read-only once under way."""

    def __init__(self, trips: TripRepository) -> None:
        self.trips = trips

    async def list_for(
        self, principal: AccountPrincipal, page: Page = Page()
    ) -> list[Trip]:
        trips = await self.trips.list_for(principal.id)
        return trips[page.skip : page.skip + page.limit]

    async def get_owned(self, trip_id: uuid.UUID, principal: AccountPrincipal) -> Trip:
        """Only the owner's trips exist for the caller: anyone else's is a 404
        (the key includes the owner, ADR 0023)."""
        trip = await self.trips.get(principal.id, trip_id)
        if trip is None:
            raise EntityNotFound("Trip", trip_id)
        return trip

    async def create(self, data: TripCreate, *, user_id: uuid.UUID) -> Trip:
        trip = Trip(**data.model_dump(), user_id=user_id)
        trip.check_invariants()
        return await self.trips.add(trip)

    async def update(self, trip: Trip, data: BaseModel) -> Trip:
        """Only a trip still ahead can be changed (`TripLocked`, ADR 0019).

        Deleting is not an update: a traveller may remove a past trip.
        """
        trip.ensure_editable()
        apply_changes(trip, data)
        return await self.trips.save(trip)

    async def delete(self, trip: Trip) -> None:
        await self.trips.delete(trip)
