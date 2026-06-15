import uuid
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.destination import Destination
from app.schemas.destination import DestinationCreate, DestinationUpdate
from app.repositories.destination_repository import DestinationRepository


class DestinationService:
    def __init__(self, db: AsyncSession):
        self.repository = DestinationRepository(db)

    async def get_destination_by_id(
        self, destination_id: uuid.UUID | str
    ) -> Optional[Destination]:
        return await self.repository.get_by_id(destination_id)

    async def get_destinations(
        self, skip: int = 0, limit: int = 100
    ) -> List[Destination]:
        return await self.repository.get_all(skip=skip, limit=limit)

    async def create_destination(
        self, destination_in: DestinationCreate, **kwargs: Any
    ) -> Destination:
        """Create a Destination. Use kwargs to pass context-specific fields like trip_id."""
        db_obj = Destination(**destination_in.model_dump(), **kwargs)
        return await self.repository.create(db_obj)

    async def update_destination(
        self, db_obj: Destination, destination_in: DestinationUpdate
    ) -> Destination:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = destination_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        return await self.repository.update(db_obj)

    async def delete_destination(self, db_obj: Destination) -> None:
        await self.repository.delete(db_obj)
