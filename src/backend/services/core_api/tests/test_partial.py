"""`partial()` derives the PATCH body from the base schema, field by field."""

from typing import Annotated

import pytest
from core_api.schemas._partial import partial
from core_api.schemas.trip import TripUpdate, TripWrite
from pydantic import BaseModel, Field, StringConstraints, ValidationError


class Thing(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5)]
    size: int = Field(default=3, ge=1)
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


def test_constraints_and_normalisation_still_apply():
    assert ThingUpdate.model_validate({"name": " ab "}).name == "ab"
    for body in ({"name": "too long"}, {"size": 0}):
        with pytest.raises(ValidationError):
            ThingUpdate.model_validate(body)


def test_null_is_refused_where_the_base_refuses_it():
    for body in ({"name": None}, {"size": None}):
        with pytest.raises(ValidationError):
            ThingUpdate.model_validate(body)


def test_trip_update_tracks_what_a_client_writes():
    assert set(TripUpdate.model_fields) == set(TripWrite.model_fields)
    assert TripUpdate.__name__ == "TripUpdate"
