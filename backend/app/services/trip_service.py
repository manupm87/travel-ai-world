import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.trip import Trip
from app.schemas.trip import TripCreate, TripUpdate
from app.repositories.trip_repository import TripRepository


class TripService:
    def __init__(self, db: AsyncSession):
        self.repository = TripRepository(db)

    async def get_trip_by_id(self, trip_id: uuid.UUID | str) -> Optional[Trip]:
        return await self.repository.get_by_id(trip_id)

    async def get_trips(self, skip: int = 0, limit: int = 100) -> List[Trip]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_trip(self, trip_in: TripCreate, **kwargs: Any) -> Trip:
        """Create a Trip. Use kwargs to pass context-specific fields like user_id."""
        db_obj = Trip(**trip_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_trip(self, db_obj: Trip, trip_in: TripUpdate) -> Trip:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = trip_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_trip(self, db_obj: Trip) -> None:
        await self.repository.delete(db_obj)
