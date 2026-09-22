"""Business layer: use cases over the domain entities and the repository ports.

Services never import FastAPI or storage; they raise
`travel_common.exceptions.*`. `trip_children.py` covers every collection
inside a trip; `TripService` and `UserService` add the rules that make trips
and accounts special.
"""

from typing import Any

from pydantic import BaseModel

from core_api.domain.models import utc_now


def apply_changes(entity: Any, data: BaseModel, *, touch: bool = True) -> None:
    """Set the fields the client sent (PATCH), then re-check the entity's rules.

    `touch` moves `updated_at` for entities that carry one.
    """
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entity, field, value)
    entity.check_invariants()
    if touch and hasattr(entity, "updated_at"):
        entity.updated_at = utc_now()
