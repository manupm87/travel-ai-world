from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.activity import Activity


class ActivityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, activity_id: int) -> Optional[Activity]:
        stmt = select(Activity).where(Activity.id == activity_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Activity]:
        stmt = select(Activity).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, activity: Activity) -> Activity:
        self.db.add(activity)
        await self.db.commit()
        await self.db.refresh(activity)
        return activity

    async def update(self, activity: Activity) -> Activity:
        await self.db.commit()
        await self.db.refresh(activity)
        return activity

    async def delete(self, activity: Activity) -> None:
        await self.db.delete(activity)
        await self.db.commit()
