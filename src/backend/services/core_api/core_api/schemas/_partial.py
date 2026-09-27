"""Derive the all-optional PATCH body from a base schema.

Every field may be left out (`= None`); `model_dump(exclude_unset=True)` then
tells the service exactly which fields the client sent. A field that is sent is
validated as the base validates it: its type (so `null` only where the base
allows it) and its constraints (`max_length`, `ge`, a normalising validator),
which Pydantic keeps in `FieldInfo.metadata`, apart from the annotation.
PATCH must refuse what POST refuses: a value saved past the schema is re-read
through the response model on every GET, and fails there.
"""

from typing import Annotated, Any

from pydantic import BaseModel, create_model


def partial[T: BaseModel](base: type[T], name: str) -> type[BaseModel]:
    fields: dict[str, Any] = {}
    for field, info in base.model_fields.items():
        annotation = info.annotation
        if annotation is None:
            continue
        if info.metadata:
            annotation = Annotated[annotation, *info.metadata]
        fields[field] = (annotation, None)
    return create_model(name, __doc__=f"Partial update of {base.__name__}.", **fields)
