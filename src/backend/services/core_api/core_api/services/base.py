"""Generic business layer over a repository.

Services receive an already-built repository (dependency inversion) and
raise domain errors; they never know about HTTP.
"""

from typing import Any

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.models.base import Base
from core_api.pagination import Page
from core_api.repositories.base import BaseRepository


class BaseService[ModelT: Base, CreateT: BaseModel, UpdateT: BaseModel]:
    entity_name: str | None = None

    def __init__(self, repository: BaseRepository[ModelT]) -> None:
        self.repository = repository

    @property
    def _entity(self) -> str:
        return self.entity_name or self.repository.model.__name__

    async def get(self, obj_id: Any) -> ModelT:
        obj = await self.repository.get_by_id(obj_id)
        if obj is None:
            raise EntityNotFound(self._entity, obj_id)
        return obj

    async def get_in(self, obj_id: Any, **parent: Any) -> ModelT:
        """Fetch a child that must belong to the given parent(s).

        A row that exists under another parent is reported as not found, so
        callers learn nothing about other users' data.
        """
        obj = await self.get(obj_id)
        if any(getattr(obj, field) != value for field, value in parent.items()):
            raise EntityNotFound(self._entity, obj_id)
        return obj

    async def list(self, page: Page = Page(), **filters: Any) -> list[ModelT]:
        return await self.repository.list(page, **filters)

    async def create(self, data: CreateT, **context: Any) -> ModelT:
        """Create from a schema; `context` carries server-side fields (owner ids)."""
        obj = self.repository.model(**data.model_dump(), **context)
        obj.check_invariants()
        return await self.repository.create(obj)

    async def update(self, obj: ModelT, data: UpdateT) -> ModelT:
        """Apply the fields the client sent, then re-check the entity's rules."""
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.check_invariants()
        return await self.repository.update(obj)

    async def delete(self, obj: ModelT) -> None:
        await self.repository.delete(obj)
