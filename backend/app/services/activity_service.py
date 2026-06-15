import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityUpdate
from app.repositories.activity_repository import ActivityRepository


class ActivityService:
    def __init__(self, db: AsyncSession):
        self.repository = ActivityRepository(db)

    async def get_activity_by_id(
        self, activity_id: uuid.UUID | str
    ) -> Optional[Activity]:
        return await self.repository.get_by_id(activity_id)

    async def get_activities(self, skip: int = 0, limit: int = 100) -> List[Activity]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_activity(
        self, activity_in: ActivityCreate, **kwargs: Any
    ) -> Activity:
        """Create an Activity. Use kwargs to pass context-specific fields like itinerary_day_id."""
        db_obj = Activity(**activity_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_activity(
        self, db_obj: Activity, activity_in: ActivityUpdate
    ) -> Activity:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = activity_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_activity(self, db_obj: Activity) -> None:
        await self.repository.delete(db_obj)
