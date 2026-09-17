"""The corpus as the stores see it.

`city_corpus` writes `documents.jsonl`; this mirrors the fields the spike needs
instead of importing it, the same boundary `ai_api.indexing` keeps (TRA-152).
"""

import json
from collections.abc import Iterator
from pathlib import Path

from pydantic import BaseModel, ConfigDict

# Metadata a query can filter on, as decided in ADR 0014 (plus the tour fields of
# TRA-154). Everything else only ever travels back with a hit.
FILTERABLE = (
    "city",
    "category",
    "district",
    "kind",
    "lang",
    "source",
    "price_tier",
    "tour_type",
    "price_model",
    "lat",
    "lon",
)


class Document(BaseModel):
    """One line of `documents.jsonl`; unknown fields are kept in `extra`."""

    model_config = ConfigDict(extra="allow", frozen=True)

    doc_id: str
    city: str
    category: str
    kind: str
    text: str
    heading_path: str
    source: str
    source_url: str
    lang: str
    name: str | None = None
    district: str | None = None
    price_tier: int | None = None
    tour_type: str | None = None
    price_model: str | None = None
    lat: float | None = None
    lon: float | None = None

    def filterable(self) -> dict[str, str | float | int]:
        values = self.model_dump(include=set(FILTERABLE), exclude_none=True)
        return {k: v for k, v in values.items() if isinstance(v, str | float | int)}


def load(path: Path) -> list[Document]:
    return list(iter_documents(path))


def iter_documents(path: Path) -> Iterator[Document]:
    with path.open(encoding="utf-8") as lines:
        for number, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                yield Document.model_validate(json.loads(line))
            except ValueError as exc:
                raise ValueError(f"{path}:{number}: {exc}") from exc
