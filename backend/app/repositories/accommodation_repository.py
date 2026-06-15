from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.accommodation import Accommodation


class AccommodationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, accommodation_id: int) -> Optional[Accommodation]:
        stmt = select(Accommodation).where(Accommodation.id == accommodation_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Accommodation]:
        stmt = select(Accommodation).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, accommodation: Accommodation) -> Accommodation:
        self.db.add(accommodation)
        await self.db.commit()
        await self.db.refresh(accommodation)
        return accommodation

    async def update(self, accommodation: Accommodation) -> Accommodation:
        await self.db.commit()
        await self.db.refresh(accommodation)
        return accommodation

    async def delete(self, accommodation: Accommodation) -> None:
        await self.db.delete(accommodation)
        await self.db.commit()
