import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.itinerary_day import ItineraryDay
from app.schemas.itinerary_day import ItineraryDayCreate, ItineraryDayUpdate
from app.repositories.itinerary_day_repository import ItineraryDayRepository


class ItineraryDayService:
    def __init__(self, db: AsyncSession):
        self.repository = ItineraryDayRepository(db)

    async def get_itinerary_day_by_id(
        self, itinerary_day_id: uuid.UUID | str
    ) -> Optional[ItineraryDay]:
        return await self.repository.get_by_id(itinerary_day_id)

    async def get_itinerary_days(
        self, skip: int = 0, limit: int = 100
    ) -> List[ItineraryDay]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_itinerary_day(
        self, itinerary_day_in: ItineraryDayCreate, **kwargs: Any
    ) -> ItineraryDay:
        """Create an ItineraryDay. Use kwargs to pass context-specific fields like trip_id."""
        db_obj = ItineraryDay(**itinerary_day_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_itinerary_day(
        self, db_obj: ItineraryDay, itinerary_day_in: ItineraryDayUpdate
    ) -> ItineraryDay:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = itinerary_day_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_itinerary_day(self, db_obj: ItineraryDay) -> None:
        await self.repository.delete(db_obj)
