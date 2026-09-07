"""`partial()` derives the PATCH body from the base schema, field by field."""

from core_api.schemas._partial import partial
from core_api.schemas.trip import TripBase, TripUpdate
from pydantic import BaseModel


class Thing(BaseModel):
    name: str
    size: int = 3
    tags: list[str] | None = None


ThingUpdate = partial(Thing, "ThingUpdate")


def test_every_field_becomes_optional_with_no_default():
    assert set(ThingUpdate.model_fields) == set(Thing.model_fields)
    assert ThingUpdate().model_dump() == {"name": None, "size": None, "tags": None}


def test_only_sent_fields_are_reported():
    assert ThingUpdate(size=5).model_dump(exclude_unset=True) == {"size": 5}
    assert ThingUpdate(tags=None).model_dump(exclude_unset=True) == {"tags": None}


def test_validation_still_applies():
    assert ThingUpdate.model_validate({"size": "7"}).size == 7


def test_trip_update_tracks_trip_base():
    assert set(TripUpdate.model_fields) == set(TripBase.model_fields)
    assert TripUpdate.__name__ == "TripUpdate"
