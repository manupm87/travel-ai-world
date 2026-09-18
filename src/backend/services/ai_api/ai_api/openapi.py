"""Put the planner's stream events into the OpenAPI document (TRA-142).

A streaming response has no response model, so FastAPI never sees the event
types and `just contracts` would not generate them for the frontend. This
wraps `app.openapi()` and adds them to `components.schemas`, in serialization
mode (what the server writes), under the names the frontend imports:
`PlannerEvent` and `ItineraryOp` for the two unions, and one entry per model.
The request, `PlannerTurn`, is added in validation mode (what the server
reads) so the frontend can type it before the endpoint exists.
"""

from typing import Any, Literal

from fastapi import FastAPI
from pydantic import TypeAdapter
from pydantic.json_schema import GenerateJsonSchema

from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import ItineraryOp, PlannerEvent

REF_TEMPLATE = "#/components/schemas/{model}"

JsonSchemaMode = Literal["validation", "serialization"]

PLANNER_SCHEMAS: tuple[tuple[str, Any, JsonSchemaMode], ...] = (
    ("PlannerEvent", PlannerEvent, "serialization"),
    ("ItineraryOp", ItineraryOp, "serialization"),
    ("PlannerTurn", PlannerTurn, "validation"),
)


def stream_components() -> dict[str, Any]:
    """`components.schemas` entries for the planner: the unions, the request
    and every model they mention."""
    components: dict[str, Any] = {}
    for name, annotation, mode in PLANNER_SCHEMAS:
        schema = TypeAdapter(annotation).json_schema(
            mode=mode, ref_template=REF_TEMPLATE, schema_generator=GenerateJsonSchema
        )
        for model, definition in schema.pop("$defs", {}).items():
            components.setdefault(model, definition)
        components[name] = schema
    return components


def register_stream_schemas(app: FastAPI) -> None:
    """Make `app.openapi()` include the stream's models, once."""
    original = app.openapi

    def with_stream_schemas() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        document = original()
        schemas = document.setdefault("components", {}).setdefault("schemas", {})
        for name, schema in stream_components().items():
            schemas.setdefault(name, schema)
        app.openapi_schema = document
        return document

    app.openapi = with_stream_schemas  # type: ignore[method-assign]
