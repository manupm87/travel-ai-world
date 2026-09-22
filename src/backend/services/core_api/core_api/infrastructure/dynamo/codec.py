"""Entities to DynamoDB items and back.

`encode` turns a dataclass into plain values (children become lists of maps)
and `travel_common.dynamodb.to_item` types them; `decode` reads
`from_item`'s plain values back into the dataclass, driven by its type
hints: ISO strings become `date`/`datetime`/`UUID`, numbers become the
`int`, `float` or `Decimal` the field declares (money is quantised to cents,
as the `NUMERIC(…, 2)` columns were).

Opaque JSON (a planner `card`, a message's `sources`) is stored as a JSON
string: DynamoDB would drop its `null`s and turn its floats into `Decimal`s,
and core_api promises to hand it back exactly as it arrived.

There are no migrations (ADR 0023): a schema change is a change here, and
items written before it must stay readable — a field missing from an old
item takes the dataclass default.
"""

import json
import types
import uuid
from dataclasses import MISSING, fields, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from functools import cache
from typing import Any, Union, get_args, get_origin, get_type_hints

from travel_common.dynamodb import from_item, to_item

JSON_FIELDS = frozenset({"card", "sources"})
"""Fields kept as a JSON string, untouched by DynamoDB's type mapping."""

CENTS = Decimal("0.01")


def encode(entity: Any) -> dict[str, Any]:
    """The entity's fields as plain values; nested entities become maps."""
    data: dict[str, Any] = {}
    for f in fields(entity):
        value = getattr(entity, f.name)
        if value is None:
            continue
        if f.name in JSON_FIELDS:
            value = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        elif isinstance(value, list) and value and is_dataclass(value[0]):
            value = [encode(child) for child in value]
        data[f.name] = value
    return data


def entity_to_item(entity: Any, **attributes: Any) -> dict[str, dict[str, Any]]:
    """A typed DynamoDB item: the entity's fields plus keys and extras."""
    return to_item({**encode(entity), **attributes})


def item_to_entity[E](cls: type[E], item: dict[str, Any]) -> E:
    return decode(cls, from_item(item))


@cache
def _hints(cls: type) -> dict[str, Any]:
    return get_type_hints(cls)


def decode[E](cls: type[E], data: dict[str, Any]) -> E:
    """Build `cls` from plain values; unknown keys (PK, SK, ...) are ignored."""
    hints = _hints(cls)
    kwargs: dict[str, Any] = {}
    for f in fields(cls):  # type: ignore[arg-type]
        if f.name not in data:
            if f.default is MISSING and f.default_factory is MISSING:
                kwargs[f.name] = None  # an old item without a newer field
            continue
        value = data[f.name]
        if f.name in JSON_FIELDS and isinstance(value, str):
            kwargs[f.name] = json.loads(value)
        else:
            kwargs[f.name] = _convert(hints[f.name], value)
    return cls(**kwargs)


def _convert(annotation: Any, value: Any) -> Any:
    if value is None:
        return None
    origin = get_origin(annotation)
    if origin in (Union, types.UnionType):
        options = [arg for arg in get_args(annotation) if arg is not type(None)]
        return _convert(options[0], value) if len(options) == 1 else value
    if origin is list:
        (item_type,) = get_args(annotation)
        return [_convert(item_type, item) for item in value]
    if is_dataclass(annotation) and isinstance(annotation, type):
        return decode(annotation, value)
    if annotation is uuid.UUID:
        return uuid.UUID(value)
    if annotation is datetime:
        return datetime.fromisoformat(value)
    if annotation is date:
        return date.fromisoformat(value)
    if annotation is Decimal:
        return Decimal(str(value)).quantize(CENTS)
    if annotation is float:
        return float(value)
    if annotation is int:
        return int(value)
    if isinstance(annotation, type) and issubclass(annotation, Enum):
        return annotation(value)
    return value


def json_size(entity: Any) -> int:
    """Bytes of the entity as JSON: close enough to its item size for a guard."""
    return len(json.dumps(encode(entity), default=str).encode())
