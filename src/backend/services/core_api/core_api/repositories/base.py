"""Generic persistence for a single SQLAlchemy model.

A repository is bound to one model, either by subclassing (`model = Trip`,
plus entity-specific queries) or by instantiation (`BaseRepository(db, Meal)`)
when the entity needs nothing beyond the generic operations. Repositories
never import Pydantic schemas and never manage transactions themselves.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core_api.pagination import Page
from core_api.models.base import Base


class BaseRepository[ModelT: Base]:
    model: type[ModelT]

    def __init__(self, db: AsyncSession, model: type[ModelT] | None = None) -> None:
        self.db = db
        if model is not None:
            self.model = model

    async def get_by_id(self, obj_id: Any) -> ModelT | None:
        return await self.db.get(self.model, obj_id)

    async def list(self, page: Page = Page(), **filters: Any) -> list[ModelT]:
        """Rows matching every `column == value` filter, in insertion order."""
        stmt = (
            select(self.model).filter_by(**filters).offset(page.skip).limit(page.limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: ModelT) -> ModelT:
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.db.delete(obj)
        await self.db.commit()
