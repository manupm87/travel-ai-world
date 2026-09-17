"""The evaluation set: queries with the documents a good retriever must return.

`eval/budapest-queries.jsonl` is hand-written from the corpus (TRA-151) and is the
seed of the quality suite of TRA-148, so it lives in the repository, not in a
notebook. Expectations name entities, not wordings: several are phrased so that no
keyword matches the document ("somewhere to take children on a rainy afternoon"),
and four are in Spanish over English documents.

Caveat, stated in the report too: candidates were found with BM25 over the corpus,
so the set may lean slightly towards documents keyword search can reach.
"""

import json
from collections.abc import Iterator
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "eval" / "budapest-queries.jsonl"


class EvalQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    lang: str
    query: str
    expected: list[str] = Field(min_length=1)
    why: str


def load(path: Path = DEFAULT_PATH) -> list[EvalQuery]:
    return list(iter_queries(path))


def iter_queries(path: Path = DEFAULT_PATH) -> Iterator[EvalQuery]:
    with path.open(encoding="utf-8") as lines:
        for number, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                yield EvalQuery.model_validate(json.loads(line))
            except ValueError as exc:
                raise ValueError(f"{path}:{number}: {exc}") from exc
