import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.transportation import Transportation
from app.schemas.transportation import TransportationCreate, TransportationUpdate
from app.repositories.transportation_repository import TransportationRepository


class TransportationService:
    def __init__(self, db: AsyncSession):
        self.repository = TransportationRepository(db)

    async def get_transportation_by_id(
        self, transportation_id: uuid.UUID | str
    ) -> Optional[Transportation]:
        return await self.repository.get_by_id(transportation_id)

    async def get_transportations(
        self, skip: int = 0, limit: int = 100
    ) -> List[Transportation]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_transportation(
        self, transportation_in: TransportationCreate, **kwargs: Any
    ) -> Transportation:
        """Create a Transportation record. Use kwargs to pass context-specific fields like trip_id."""
        db_obj = Transportation(**transportation_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_transportation(
        self, db_obj: Transportation, transportation_in: TransportationUpdate
    ) -> Transportation:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = transportation_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_transportation(self, db_obj: Transportation) -> None:
        await self.repository.delete(db_obj)
