"""The admin API's answer evaluation: its runs, their items and the stream events.

Definitions in `application/answer_eval.py` and `application/judge_validation.py`.
Nothing has a default, so the generated type marks none optional; a field of one
set only is `null` in the other.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from ai_api.domain.evaluation import EvalSet
from ai_api.schemas.planner_events import ErrorEvent

RunState = Literal["running", "done", "failed", "interrupted"]
"""`interrupted`: still `running` long after any run could have ended."""


class _FromAttributes(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AnswerEvalRequest(BaseModel):
    set: EvalSet


class VerdictResponse(_FromAttributes):
    groundedness: int
    relevance: int
    acknowledges_gap: bool
    unsupported_claims: list[str]
    reason: str


class ExpectedVerdictResponse(_FromAttributes):
    groundedness: int
    relevance: int
    acknowledges_gap: bool


class EvalItemResponse(BaseModel):
    """One graded question, or one golden case with the verdict expected of it."""

    key: str
    city: str
    id: str
    lang: str
    query: str
    answerable: bool
    passages: list[str]
    """The ids of the passages the answer was given, best first."""
    answer: str | None
    """`null` when the answer itself failed."""
    verdict: VerdictResponse | None
    error: str | None
    expected: ExpectedVerdictResponse | None
    origin: Literal["real", "perturbed"] | None
    defect: str | None
    why: str | None


class MeansResponse(_FromAttributes):
    label: str
    answers: int
    groundedness: float
    relevance: float
    low_share: float


class SpendResponse(_FromAttributes):
    model: str | None
    input_tokens: int
    output_tokens: int
    usd: float | None


class AnswerReportResponse(BaseModel):
    """The scores of a `questions` run; answerable questions only, but `unanswerable`."""

    overall: MeansResponse
    by_city: list[MeansResponse]
    by_language: list[MeansResponse]
    unanswerable: int
    unanswerable_acknowledged: int
    turned_down: list[str]
    """Keys of answerable questions whose answer said it could not tell."""
    worst: list[str]
    """Keys of the lowest-scored answers under the bad-answer line."""
    answering: SpendResponse
    judging: SpendResponse


class ScoreAgreementResponse(_FromAttributes):
    score: str
    exact: float
    within_one: float
    kappa: float | None
    confusion: list[list[int]]
    """Rows: the expected score 1-5; columns: the judge's."""
    mean_expected: float
    mean_judge: float


class AgreementReportResponse(BaseModel):
    """How a `golden` run's verdicts agree with the expected ones."""

    cases: int
    groundedness: ScoreAgreementResponse
    relevance: ScoreAgreementResponse
    low_kappa: float | None
    low_agreement: float
    gap_accuracy: float
    exact_real: float | None
    exact_perturbed: float | None
    disagreements: list[str]
    """Keys of the cases not graded as expected, widest gap first."""
    judging: SpendResponse


class EvalRunResponse(BaseModel):
    run_id: str
    set: EvalSet
    status: RunState
    started_at: datetime
    finished_at: datetime | None
    answer_model: str | None
    """The model that answered (`questions` only)."""
    judge_model: str
    judge_prompt: str
    """The version (`prompt_version`) of the judge prompt."""
    index: str | None
    total: int
    graded: int
    failed: int
    usd: float | None
    answers: AnswerReportResponse | None
    agreement: AgreementReportResponse | None
    error: str | None


class EvalRunPageResponse(BaseModel):
    items: list[EvalRunResponse]


class EvalRunDetailResponse(BaseModel):
    run: EvalRunResponse
    items: list[EvalItemResponse]


class EvalProgressEvent(BaseModel):
    """One item graded: `done` of `total` so far."""

    type: Literal["progress"]
    done: int
    total: int
    item: EvalItemResponse


class EvalReportEvent(BaseModel):
    """The run as stored once every item is graded; the last event before `[DONE]`."""

    type: Literal["report"]
    run: EvalRunResponse


AnswerEvalEvent = Annotated[
    EvalProgressEvent | EvalReportEvent | ErrorEvent, Field(discriminator="type")
]
