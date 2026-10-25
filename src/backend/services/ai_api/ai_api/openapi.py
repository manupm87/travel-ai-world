"""Put the stream events (planner, evaluation runs) into the OpenAPI document.

A streaming response has no response model, so FastAPI never sees the event types
and `just contracts` could not generate them for the frontend.
"""

from typing import Any, Literal

from fastapi import FastAPI
from pydantic import TypeAdapter
from pydantic.json_schema import GenerateJsonSchema

from ai_api.schemas.answer_eval import AnswerEvalEvent
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import ItineraryOp, PlannerEvent

REF_TEMPLATE = "#/components/schemas/{model}"

JsonSchemaMode = Literal["validation", "serialization"]

STREAM_SCHEMAS: tuple[tuple[str, Any, JsonSchemaMode], ...] = (
    ("PlannerEvent", PlannerEvent, "serialization"),
    ("ItineraryOp", ItineraryOp, "serialization"),
    ("PlannerTurn", PlannerTurn, "validation"),
    ("AnswerEvalEvent", AnswerEvalEvent, "serialization"),
)


def stream_components() -> dict[str, Any]:
    """The streams' `components.schemas`: the unions, the request and their models."""
    components: dict[str, Any] = {}
    for name, annotation, mode in STREAM_SCHEMAS:
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
