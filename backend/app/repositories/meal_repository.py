from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.meal import Meal


class MealRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, meal_id: int) -> Optional[Meal]:
        stmt = select(Meal).where(Meal.id == meal_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Meal]:
        stmt = select(Meal).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, meal: Meal) -> Meal:
        self.db.add(meal)
        await self.db.commit()
        await self.db.refresh(meal)
        return meal

    async def update(self, meal: Meal) -> Meal:
        await self.db.commit()
        await self.db.refresh(meal)
        return meal

    async def delete(self, meal: Meal) -> None:
        await self.db.delete(meal)
        await self.db.commit()
