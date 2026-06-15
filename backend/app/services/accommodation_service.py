import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.accommodation import Accommodation
from app.schemas.accommodation import AccommodationCreate, AccommodationUpdate
from app.repositories.accommodation_repository import AccommodationRepository


class AccommodationService:
    def __init__(self, db: AsyncSession):
        self.repository = AccommodationRepository(db)

    async def get_accommodation_by_id(
        self, accommodation_id: uuid.UUID | str
    ) -> Optional[Accommodation]:
        return await self.repository.get_by_id(accommodation_id)

    async def get_accommodations(
        self, skip: int = 0, limit: int = 100
    ) -> List[Accommodation]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_accommodation(
        self, accommodation_in: AccommodationCreate, **kwargs: Any
    ) -> Accommodation:
        """Create an Accommodation. Use kwargs to pass context-specific fields like trip_id."""
        db_obj = Accommodation(**accommodation_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_accommodation(
        self, db_obj: Accommodation, accommodation_in: AccommodationUpdate
    ) -> Accommodation:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = accommodation_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_accommodation(self, db_obj: Accommodation) -> None:
        await self.repository.delete(db_obj)
