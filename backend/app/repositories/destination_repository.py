from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.destination import Destination


class DestinationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, destination_id: int) -> Optional[Destination]:
        stmt = select(Destination).where(Destination.id == destination_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Destination]:
        stmt = select(Destination).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, destination: Destination) -> Destination:
        self.db.add(destination)
        await self.db.commit()
        await self.db.refresh(destination)
        return destination

    async def update(self, destination: Destination) -> Destination:
        await self.db.commit()
        await self.db.refresh(destination)
        return destination

    async def delete(self, destination: Destination) -> None:
        await self.db.delete(destination)
        await self.db.commit()
