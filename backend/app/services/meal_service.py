import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.meal import Meal
from app.schemas.meal import MealCreate, MealUpdate
from app.repositories.meal_repository import MealRepository


class MealService:
    def __init__(self, db: AsyncSession):
        self.repository = MealRepository(db)

    async def get_meal_by_id(self, meal_id: uuid.UUID | str) -> Optional[Meal]:
        return await self.repository.get_by_id(meal_id)

    async def get_meals(self, skip: int = 0, limit: int = 100) -> List[Meal]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_meal(self, meal_in: MealCreate, **kwargs: Any) -> Meal:
        """Create a Meal. Use kwargs to pass context-specific fields like itinerary_day_id."""
        db_obj = Meal(**meal_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_meal(self, db_obj: Meal, meal_in: MealUpdate) -> Meal:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = meal_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_meal(self, db_obj: Meal) -> None:
        await self.repository.delete(db_obj)
