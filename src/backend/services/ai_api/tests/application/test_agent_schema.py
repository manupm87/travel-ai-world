"""`application.agent.schema.tool_schema`: what a provider is told a tool takes."""

from typing import Literal

from ai_api.application.agent.schema import tool_schema
from pydantic import BaseModel, Field


class Slot(BaseModel):
    day: int = Field(ge=1, description="Day number, from 1.")
    part: Literal["morning", "afternoon", "evening"]


class MoveInput(BaseModel):
    """Move a place to another slot."""

    card_id: str
    to: Slot
    title: str | None = Field(default=None, description="New day title.")
    tags: dict[str, str] = Field(default_factory=dict)


def test_inlines_defs_drops_titles_and_closes_objects():
    schema = tool_schema(MoveInput)

    assert "$defs" not in schema
    assert "title" not in schema
    assert schema["additionalProperties"] is False
    properties = schema["properties"]
    assert isinstance(properties, dict)
    # A property called `title` is data and stays; its own title keyword goes.
    assert set(properties) == {"card_id", "to", "title", "tags"}
    assert properties["to"] == {
        "type": "object",
        "properties": {
            "day": {
                "type": "integer",
                "minimum": 1,
                "description": "Day number, from 1.",
            },
            "part": {"type": "string", "enum": ["morning", "afternoon", "evening"]},
        },
        "required": ["day", "part"],
        "additionalProperties": False,
    }
    assert "title" not in properties["title"]
    assert properties["title"]["description"] == "New day title."


def test_optional_fields_stay_optional():
    schema = tool_schema(MoveInput)

    assert schema["required"] == ["card_id", "to"]


def test_a_mapping_keeps_its_value_schema():
    properties = tool_schema(MoveInput)["properties"]
    assert isinstance(properties, dict)

    assert properties["tags"]["additionalProperties"] == {"type": "string"}


def test_the_model_docstring_is_kept_as_its_description():
    assert tool_schema(MoveInput)["description"] == "Move a place to another slot."
