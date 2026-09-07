"""Derive the all-optional PATCH body from a base schema.

Every field becomes `T | None = None`; `model_dump(exclude_unset=True)` then
tells the service exactly which fields the client sent.
"""

from typing import Any

from pydantic import BaseModel, create_model


def partial[T: BaseModel](base: type[T], name: str) -> type[BaseModel]:
    fields: dict[str, Any] = {
        field: (annotation | None, None)
        for field, info in base.model_fields.items()
        if (annotation := info.annotation) is not None
    }
    return create_model(name, __doc__=f"Partial update of {base.__name__}.", **fields)
