"""A tool's input model as the JSON Schema a provider is handed (ADR 0032).

Not the structured-output cleaning of `structured.py`, which makes every
field required: a tool's optional arguments stay optional. Pydantic still
validates the arguments the model sends against the whole model.
"""

from typing import Any

from pydantic import BaseModel


def tool_schema(model: type[BaseModel]) -> dict[str, object]:
    """`model`'s JSON Schema with `$defs` inlined, `title`s dropped and
    `additionalProperties: false` on every object with fixed properties."""
    raw = model.model_json_schema()
    defs: dict[str, Any] = raw.pop("$defs", {})
    return _clean(raw, defs)


def _clean(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, list):
        return [_clean(item, defs) for item in node]
    if not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        target = _clean(defs[ref.removeprefix("#/$defs/")], defs)
        # Keywords beside the reference (a description, a default) win.
        siblings = {k: v for k, v in node.items() if k != "$ref"}
        return {**target, **_clean(siblings, defs)}
    cleaned: dict[str, Any] = {}
    for key, value in node.items():
        if key == "title":
            continue
        if key == "properties" and isinstance(value, dict):
            # Property names are data, not keywords: a field called `title` stays.
            cleaned[key] = {name: _clean(sub, defs) for name, sub in value.items()}
        else:
            cleaned[key] = _clean(value, defs)
    # A `dict[str, X]` field keeps its own `additionalProperties` schema.
    if "properties" in cleaned and "additionalProperties" not in cleaned:
        cleaned["additionalProperties"] = False
    return cleaned
