# pyright: reportInvalidTypeForm=false
# Endpoint signatures are built from `ChildResource` fields at runtime; FastAPI
# reads them, a static checker cannot.
"""Declarative CRUD routers for the entities that live inside a trip.

Every child resource (itinerary days, accommodations, ..., meals) gets the
same five endpoints, nested under its owner: the caller's trip, or a day of
it. Adding an entity is one `ChildResource` entry, not a new endpoint module.

Children are stored inside the trip (ADR 0023): a write changes the
aggregate and saves the whole trip (`services/trip_children.py`). Reads go
through the owned parent, writes through the editable one: a trip that is
ongoing or past refuses every write inside it with `TripLocked` (ADR 0019),
and no endpoint here has to know that.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel

from core_api.api.deps import (
    get_editable_itinerary_day,
    get_editable_trip_node,
    get_owned_itinerary_day,
    get_owned_trip_node,
    get_trip_repository,
    page_params,
)
from core_api.domain.ports import TripRepository
from core_api.pagination import Page
from core_api.schemas.accommodation import (
    AccommodationCreate,
    AccommodationResponse,
    AccommodationUpdate,
)
from core_api.schemas.activity import ActivityCreate, ActivityResponse, ActivityUpdate
from core_api.schemas.itinerary_day import (
    ItineraryDayCreate,
    ItineraryDayResponse,
    ItineraryDayUpdate,
)
from core_api.schemas.meal import MealCreate, MealResponse, MealUpdate
from core_api.schemas.transportation import (
    TransportationCreate,
    TransportationResponse,
    TransportationUpdate,
)
from core_api.services.trip_children import (
    ACCOMMODATIONS,
    ACTIVITIES,
    ITINERARY_DAYS,
    MEALS,
    TRANSPORTATIONS,
    ChildKind,
    Located,
    create_child,
    delete_child,
    get_child,
    list_children,
    update_child,
)

TRIP = "/trips/{trip_id}"
DAY = f"{TRIP}/itinerary-days/{{itinerary_day_id}}"


@dataclass(frozen=True, slots=True)
class ChildResource:
    """One nested collection: `<parent_prefix>/<path>/{<singular>_id}`."""

    path: str
    singular: str
    tag: str
    kind: ChildKind
    create_schema: type[BaseModel]
    update_schema: type[BaseModel]
    response_schema: type[BaseModel]
    parent: Callable[..., Awaitable[Located]]
    # The same parent, resolved for a write: it refuses a locked trip.
    writable_parent: Callable[..., Awaitable[Located]]
    parent_prefix: str = TRIP

    @property
    def prefix(self) -> str:
        return f"{self.parent_prefix}/{self.path}"


CHILD_RESOURCES: tuple[ChildResource, ...] = (
    ChildResource(
        "itinerary-days", "itinerary_day", "Itinerary Days", ITINERARY_DAYS,
        ItineraryDayCreate, ItineraryDayUpdate, ItineraryDayResponse,
        get_owned_trip_node, get_editable_trip_node,
    ),
    ChildResource(
        "accommodations", "accommodation", "Accommodations", ACCOMMODATIONS,
        AccommodationCreate, AccommodationUpdate, AccommodationResponse,
        get_owned_trip_node, get_editable_trip_node,
    ),
    ChildResource(
        "transportations", "transportation", "Transportations", TRANSPORTATIONS,
        TransportationCreate, TransportationUpdate, TransportationResponse,
        get_owned_trip_node, get_editable_trip_node,
    ),
    ChildResource(
        "activities", "activity", "Activities", ACTIVITIES,
        ActivityCreate, ActivityUpdate, ActivityResponse,
        get_owned_itinerary_day, get_editable_itinerary_day,
        parent_prefix=DAY,
    ),
    ChildResource(
        "meals", "meal", "Meals", MEALS,
        MealCreate, MealUpdate, MealResponse,
        get_owned_itinerary_day, get_editable_itinerary_day,
        parent_prefix=DAY,
    ),
)  # fmt: skip


def child_router(res: ChildResource) -> APIRouter:
    router = APIRouter(prefix=res.prefix, tags=[res.tag])
    kind = res.kind
    item_id = f"{res.singular}_id"
    item_path = f"/{{{item_id}}}"
    # Lowercase on purpose: these are per-call aliases, not module-level types.
    item_id_t = Annotated[UUID, Path(alias=item_id)]
    parent_t = Annotated[Located, Depends(res.parent)]
    writable_parent_t = Annotated[Located, Depends(res.writable_parent)]
    trips_t = Annotated[TripRepository, Depends(get_trip_repository)]

    @router.get("/", response_model=list[res.response_schema], name=f"list_{res.path}")
    async def list_items(where: parent_t, page: Page = Depends(page_params)):
        return list_children(where.parent, kind, page)

    @router.post(
        "/",
        response_model=res.response_schema,
        status_code=status.HTTP_201_CREATED,
        name=f"create_{res.singular}",
    )
    async def create_item(
        body: res.create_schema, where: writable_parent_t, trips: trips_t
    ):
        return await create_child(trips, where, kind, body)

    @router.get(
        item_path,
        response_model=res.response_schema,
        name=f"read_{res.singular}",
    )
    async def read_item(obj_id: item_id_t, where: parent_t):
        return get_child(where.parent, kind, obj_id)

    @router.patch(
        item_path,
        response_model=res.response_schema,
        name=f"update_{res.singular}",
    )
    async def update_item(
        obj_id: item_id_t,
        body: res.update_schema,
        where: writable_parent_t,
        trips: trips_t,
    ):
        return await update_child(trips, where, kind, obj_id, body)

    @router.delete(
        item_path,
        status_code=status.HTTP_204_NO_CONTENT,
        name=f"delete_{res.singular}",
    )
    async def delete_item(
        obj_id: item_id_t, where: writable_parent_t, trips: trips_t
    ) -> None:
        await delete_child(trips, where, kind, obj_id)

    return router
