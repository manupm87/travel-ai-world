from core_api.models.trip import Trip
from core_api.repositories.base import BaseRepository


class TripRepository(BaseRepository[Trip]):
    model = Trip
