import uuid

from core_api.pagination import Page
from core_api.models.trip import Trip
from core_api.repositories.trip_repository import TripRepository
from core_api.schemas.trip import TripCreate, TripUpdate
from core_api.services.base import BaseService
from travel_common.exceptions import Forbidden
from travel_common.principal import Principal


class TripService(BaseService[Trip, TripCreate, TripUpdate]):
    repository: TripRepository

    async def list_for(self, principal: Principal, page: Page = Page()) -> list[Trip]:
        return await self.repository.list(page, user_id=principal.id)

    async def get_owned(self, trip_id: uuid.UUID, principal: Principal) -> Trip:
        """A trip is only visible to the user who owns it."""
        trip = await self.get(trip_id)
        if trip.user_id != principal.id:
            raise Forbidden()
        return trip
