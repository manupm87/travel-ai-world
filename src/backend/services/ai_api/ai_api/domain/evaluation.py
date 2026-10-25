"""Stored runs of the answer evaluation and the judge validation (ADR 0039).

The store keeps what it needs to list and guard runs (set, status, start) and
treats the rest as the admin API shows it: JSON-safe mappings it never reads.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

EvalSet = Literal["questions", "golden"]
"""`questions`: the 126 evaluation questions answered and judged; `golden`: the
judge alone over the labelled golden set."""

RunStatus = Literal["running", "done", "failed"]


@dataclass(frozen=True, slots=True)
class EvalRunRecord:
    run_id: str
    eval_set: EvalSet
    status: RunStatus
    started_at: datetime
    data: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class EvalItemRecord:
    """One graded question or golden case of a run, under `key` (`<city>/<id>`)."""

    key: str
    data: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class EvalRunDetail:
    run: EvalRunRecord
    items: list[EvalItemRecord]
