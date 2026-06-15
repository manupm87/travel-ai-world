from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.transportation import Transportation


class TransportationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, transportation_id: int) -> Optional[Transportation]:
        stmt = select(Transportation).where(Transportation.id == transportation_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Transportation]:
        stmt = select(Transportation).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, transportation: Transportation) -> Transportation:
        self.db.add(transportation)
        await self.db.commit()
        await self.db.refresh(transportation)
        return transportation

    async def update(self, transportation: Transportation) -> Transportation:
        await self.db.commit()
        await self.db.refresh(transportation)
        return transportation

    async def delete(self, transportation: Transportation) -> None:
        await self.db.delete(transportation)
        await self.db.commit()
