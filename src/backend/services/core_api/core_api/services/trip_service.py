import uuid

from pydantic import BaseModel
from travel_common.exceptions import Forbidden

from core_api.auth.principal import AccountPrincipal
from core_api.models.trip import Trip
from core_api.pagination import Page
from core_api.repositories.trip_repository import TripRepository
from core_api.schemas.trip import TripCreate, TripUpdate
from core_api.services.base import BaseService


class TripService(BaseService[Trip, TripCreate, TripUpdate]):
    repository: TripRepository

    async def list_for(
        self, principal: AccountPrincipal, page: Page = Page()
    ) -> list[Trip]:
        return await self.repository.list(page, user_id=principal.id)

    async def get_owned(self, trip_id: uuid.UUID, principal: AccountPrincipal) -> Trip:
        """A trip is only visible to the user who owns it."""
        trip = await self.get(trip_id)
        if trip.user_id != principal.id:
            raise Forbidden()
        return trip

    async def update(self, obj: Trip, data: BaseModel) -> Trip:
        """Only a trip still ahead can be changed (`TripLocked`, ADR 0019).

        Deleting is not an update: a traveller may remove a past trip, and
        `delete` stays as `BaseService` defines it.
        """
        obj.ensure_editable()
        return await super().update(obj, data)
