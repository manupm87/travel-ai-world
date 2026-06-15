from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.itinerary_day import ItineraryDay


class ItineraryDayRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, itinerary_day_id: int) -> Optional[ItineraryDay]:
        stmt = select(ItineraryDay).where(ItineraryDay.id == itinerary_day_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[ItineraryDay]:
        stmt = select(ItineraryDay).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, itinerary_day: ItineraryDay) -> ItineraryDay:
        self.db.add(itinerary_day)
        await self.db.commit()
        await self.db.refresh(itinerary_day)
        return itinerary_day

    async def update(self, itinerary_day: ItineraryDay) -> ItineraryDay:
        await self.db.commit()
        await self.db.refresh(itinerary_day)
        return itinerary_day

    async def delete(self, itinerary_day: ItineraryDay) -> None:
        await self.db.delete(itinerary_day)
        await self.db.commit()
