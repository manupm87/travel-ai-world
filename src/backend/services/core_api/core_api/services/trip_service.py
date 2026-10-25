"""Trip use cases: a user's trips (create, read, update, delete), admin reads."""

import logging
import uuid
from collections.abc import Callable

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.auth.principal import AccountPrincipal
from core_api.domain.models import Trip, TripSummary
from core_api.domain.ports import TripRepository
from core_api.pagination import Page
from core_api.schemas.trip import TripCreate
from core_api.services import apply_changes

logger = logging.getLogger(__name__)


class TripService:
    """A user's trips: private to their owner, read-only once under way."""

    def __init__(
        self,
        trips: TripRepository,
        on_trip_created: Callable[[Trip], None] | None = None,
    ) -> None:
        self.trips = trips
        self.on_trip_created = on_trip_created

    async def list_for(
        self, principal: AccountPrincipal, page: Page = Page()
    ) -> list[Trip]:
        trips = await self.trips.list_for(principal.id)
        return trips[page.skip : page.skip + page.limit]

    async def get_owned(self, trip_id: uuid.UUID, principal: AccountPrincipal) -> Trip:
        """The caller's trip; anyone else's is a 404, as the key includes the owner."""
        trip = await self.trips.get(principal.id, trip_id)
        if trip is None:
            raise EntityNotFound("Trip", trip_id)
        return trip

    async def list_all(
        self, cursor: str | None, limit: int
    ) -> tuple[list[TripSummary], str | None]:
        """Every user's trips, newest first (admins only, ADR 0024)."""
        return await self.trips.list_all(cursor, limit)

    async def get_any(self, owner_id: uuid.UUID, trip_id: uuid.UUID) -> Trip:
        """Any user's trip, read by its owner and id (admins only, ADR 0024)."""
        trip = await self.trips.get(owner_id, trip_id)
        if trip is None:
            raise EntityNotFound("Trip", trip_id)
        return trip

    async def create(self, data: TripCreate, *, user_id: uuid.UUID) -> Trip:
        trip = Trip(**data.model_dump(), user_id=user_id)
        trip.check_invariants()
        saved = await self.trips.add(trip)
        if self.on_trip_created is not None:
            try:
                self.on_trip_created(saved)
            except Exception:
                # observability must not turn a committed write into a failed request
                logger.exception("Could not record trip creation metric")
        return saved

    async def update(self, trip: Trip, data: BaseModel) -> Trip:
        """Apply a PATCH to a trip that is still ahead.

        Raises:
            TripLocked: the trip is ongoing or past (ADR 0019).
        """
        trip.ensure_editable()
        apply_changes(trip, data)
        return await self.trips.save(trip)

    async def delete(self, trip: Trip) -> None:
        """Delete the trip in any phase: removing a past trip is not changing it."""
        await self.trips.delete(trip)
