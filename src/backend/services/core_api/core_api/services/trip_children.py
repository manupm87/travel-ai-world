"""The collections inside a trip, handled once for all of them.

Children live inside the trip's item (ADR 0023), so every child write is:
take the caller's editable trip (the API dependency already loaded it),
change the aggregate, save the whole trip. A lookup only ever searches the
caller's own trip, so another trip's child is simply not found.

A `ChildKind` says, for one resource, which dataclass it is, where its list
lives on the parent (the trip, or a day of it) and which field names the
parent. Lists keep insertion order and page in memory. A child's own
`updated_at` moves when it is patched; the trip's does not (it moves only
when the trip's own fields change).
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.domain.models import (
    Accommodation,
    Activity,
    Entity,
    ItineraryDay,
    Meal,
    Transportation,
    Trip,
)
from core_api.domain.ports import TripRepository
from core_api.pagination import Page
from core_api.services import apply_changes

Parent = Trip | ItineraryDay


@dataclass(frozen=True, slots=True)
class ChildKind:
    """One collection: its dataclass, its list on the parent, its parent field."""

    entity: type[Entity]
    collection: str
    parent_field: str

    @property
    def name(self) -> str:
        return self.entity.__name__

    def items(self, parent: Parent) -> list[Any]:
        return getattr(parent, self.collection)


ITINERARY_DAYS = ChildKind(ItineraryDay, "itinerary_days", "trip_id")
ACCOMMODATIONS = ChildKind(Accommodation, "accommodations", "trip_id")
TRANSPORTATIONS = ChildKind(Transportation, "transportations", "trip_id")
ACTIVITIES = ChildKind(Activity, "activities", "itinerary_day_id")
MEALS = ChildKind(Meal, "meals", "itinerary_day_id")


@dataclass(frozen=True, slots=True)
class Located:
    """Where a child collection lives: the trip to save, and the node inside
    it that holds the list (the trip itself, or one of its days)."""

    trip: Trip
    parent: Parent


def list_children(parent: Parent, kind: ChildKind, page: Page = Page()) -> list[Any]:
    return kind.items(parent)[page.skip : page.skip + page.limit]


def get_child(parent: Parent, kind: ChildKind, child_id: UUID) -> Any:
    for child in kind.items(parent):
        if child.id == child_id:
            return child
    raise EntityNotFound(kind.name, child_id)


async def create_child(
    trips: TripRepository, where: Located, kind: ChildKind, data: BaseModel
) -> Any:
    child = kind.entity(**data.model_dump(), **{kind.parent_field: where.parent.id})
    child.check_invariants()
    kind.items(where.parent).append(child)
    await trips.save(where.trip)
    return child


async def update_child(
    trips: TripRepository,
    where: Located,
    kind: ChildKind,
    child_id: UUID,
    data: BaseModel,
) -> Any:
    child = get_child(where.parent, kind, child_id)
    apply_changes(child, data)
    await trips.save(where.trip)
    return child


async def delete_child(
    trips: TripRepository, where: Located, kind: ChildKind, child_id: UUID
) -> None:
    child = get_child(where.parent, kind, child_id)
    kind.items(where.parent).remove(child)
    await trips.save(where.trip)
