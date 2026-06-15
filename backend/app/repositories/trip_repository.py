from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.trip import Trip


class TripRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, trip_id: int) -> Optional[Trip]:
        stmt = select(Trip).where(Trip.id == trip_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Trip]:
        stmt = select(Trip).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, trip: Trip) -> Trip:
        self.db.add(trip)
        await self.db.commit()
        await self.db.refresh(trip)
        return trip

    async def update(self, trip: Trip) -> Trip:
        await self.db.commit()
        await self.db.refresh(trip)
        return trip

    async def delete(self, trip: Trip) -> None:
        await self.db.delete(trip)
        await self.db.commit()
