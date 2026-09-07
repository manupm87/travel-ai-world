"""Declarative CRUD routers for the entities that live inside a trip.

Every child resource (destinations, accommodations, ..., meals) gets the same
five endpoints, nested under its owner: the caller's trip, or a day of it.
Adding an entity is one `ChildResource` entry, not a new endpoint module.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel

from core_api.api.deps import (
    get_accommodation_service,
    get_activity_service,
    get_destination_service,
    get_itinerary_day_service,
    get_meal_service,
    get_owned_itinerary_day,
    get_owned_trip,
    get_transportation_service,
    page_params,
)
from core_api.models.base import Base
from core_api.pagination import Page
from core_api.schemas.accommodation import (
    AccommodationCreate,
    AccommodationResponse,
    AccommodationUpdate,
)
from core_api.schemas.activity import ActivityCreate, ActivityResponse, ActivityUpdate
from core_api.schemas.destination import (
    DestinationCreate,
    DestinationResponse,
    DestinationUpdate,
)
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
from core_api.services.base import BaseService

TRIP = "/trips/{trip_id}"
DAY = f"{TRIP}/itinerary-days/{{itinerary_day_id}}"


@dataclass(frozen=True, slots=True)
class ChildResource:
    """One nested collection: `<parent_prefix>/<path>/{<singular>_id}`."""

    path: str
    singular: str
    tag: str
    service: Callable[..., BaseService[Any, Any, Any]]
    create_schema: type[BaseModel]
    update_schema: type[BaseModel]
    response_schema: type[BaseModel]
    parent: Callable[..., Base]
    parent_field: str
    parent_prefix: str = TRIP

    @property
    def prefix(self) -> str:
        return f"{self.parent_prefix}/{self.path}"


CHILD_RESOURCES: tuple[ChildResource, ...] = (
    ChildResource(
        "destinations", "destination", "Destinations", get_destination_service,
        DestinationCreate, DestinationUpdate, DestinationResponse,
        get_owned_trip, "trip_id",
    ),
    ChildResource(
        "itinerary-days", "itinerary_day", "Itinerary Days",
        get_itinerary_day_service,
        ItineraryDayCreate, ItineraryDayUpdate, ItineraryDayResponse,
        get_owned_trip, "trip_id",
    ),
    ChildResource(
        "accommodations", "accommodation", "Accommodations",
        get_accommodation_service,
        AccommodationCreate, AccommodationUpdate, AccommodationResponse,
        get_owned_trip, "trip_id",
    ),
    ChildResource(
        "transportations", "transportation", "Transportations",
        get_transportation_service,
        TransportationCreate, TransportationUpdate, TransportationResponse,
        get_owned_trip, "trip_id",
    ),
    ChildResource(
        "activities", "activity", "Activities", get_activity_service,
        ActivityCreate, ActivityUpdate, ActivityResponse,
        get_owned_itinerary_day, "itinerary_day_id", parent_prefix=DAY,
    ),
    ChildResource(
        "meals", "meal", "Meals", get_meal_service,
        MealCreate, MealUpdate, MealResponse,
        get_owned_itinerary_day, "itinerary_day_id", parent_prefix=DAY,
    ),
)  # fmt: skip


def child_router(res: ChildResource) -> APIRouter:
    router = APIRouter(prefix=res.prefix, tags=[res.tag])
    item_id = f"{res.singular}_id"
    ItemId = Annotated[UUID, Path(alias=item_id)]
    Parent = Annotated[Base, Depends(res.parent)]
    Service = Annotated[BaseService[Any, Any, Any], Depends(res.service)]

    @router.get("/", response_model=list[res.response_schema], name=f"list_{res.path}")
    async def list_items(
        parent: Parent, service: Service, page: Page = Depends(page_params)
    ):
        return await service.list(page, **{res.parent_field: parent.id})

    @router.post(
        "/",
        response_model=res.response_schema,
        status_code=status.HTTP_201_CREATED,
        name=f"create_{res.singular}",
    )
    async def create_item(body: res.create_schema, parent: Parent, service: Service):  # type: ignore[valid-type]
        return await service.create(body, **{res.parent_field: parent.id})

    @router.get(
        "/{%s}" % item_id,
        response_model=res.response_schema,
        name=f"read_{res.singular}",
    )
    async def read_item(obj_id: ItemId, parent: Parent, service: Service):
        return await service.get_in(obj_id, **{res.parent_field: parent.id})

    @router.patch(
        "/{%s}" % item_id,
        response_model=res.response_schema,
        name=f"update_{res.singular}",
    )
    async def update_item(
        obj_id: ItemId, body: res.update_schema, parent: Parent, service: Service
    ):  # type: ignore[valid-type]
        obj = await service.get_in(obj_id, **{res.parent_field: parent.id})
        return await service.update(obj, body)

    @router.delete(
        "/{%s}" % item_id,
        status_code=status.HTTP_204_NO_CONTENT,
        name=f"delete_{res.singular}",
    )
    async def delete_item(obj_id: ItemId, parent: Parent, service: Service) -> None:
        obj = await service.get_in(obj_id, **{res.parent_field: parent.id})
        await service.delete(obj)

    return router
