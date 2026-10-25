"""The admin's runs of the answer evaluation and the judge validation (ADR 0039).

A run takes the store's lock and is stored as `running` before its stream
starts, its items as they are graded and the run again, `done` or `failed`,
before the stream's last event: Lambda may freeze the process once the response
ends. Whatever stops a run (an error, the client leaving) marks it failed and
gives the lock back, under a shield the cancellation cannot interrupt.
"""

import logging
import uuid
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Sequence
from contextlib import aclosing
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import anyio
from travel_common.exceptions import (
    Conflict,
    DomainError,
    EntityNotFound,
    ProviderUnavailable,
)

from ai_api.application import answer_eval, judge_validation, retrieval_eval
from ai_api.domain.evaluation import EvalItemRecord, EvalRunRecord, EvalSet
from ai_api.domain.ports import EvalStore, LLMProvider, Retriever
from ai_api.prompts import JUDGE_PROMPT, prompt_version
from ai_api.schemas.answer_eval import (
    AgreementReportResponse,
    AnswerReportResponse,
    EvalItemResponse,
    EvalProgressEvent,
    EvalReportEvent,
    EvalRunDetailResponse,
    EvalRunResponse,
    ExpectedVerdictResponse,
    MeansResponse,
    ScoreAgreementResponse,
    SpendResponse,
    VerdictResponse,
)

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)
"""The function's timeout: a run still `running` after it was cut off."""

WRITE_EVERY = 10
"""Items kept in memory before they are written."""


Result = (
    answer_eval.Graded
    | answer_eval.Failure
    | judge_validation.Judged
    | judge_validation.CaseFailure
)


@dataclass(frozen=True, slots=True)
class StartedRun:
    run: EvalRunResponse
    questions: list[answer_eval.Item]
    cases: list[judge_validation.Case]


class EvalRuns:
    def __init__(
        self,
        store: EvalStore,
        *,
        judge: LLMProvider,
        judge_model: str,
        answerer: LLMProvider | None = None,
        answer_model: str | None = None,
        retriever: Retriever | None = None,
        index: str | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._store = store
        self._judge = judge
        self._judge_model = judge_model
        self._answerer = answerer
        self._answer_model = answer_model
        self._retriever = retriever
        self._index = index
        self._clock = clock

    async def start(self, eval_set: EvalSet) -> StartedRun:
        """Store a new run as `running`, before anything is graded.

        Raises:
            Conflict: another run is still in progress.
            ProviderUnavailable: a `questions` run without retrieval.
        """
        now = self._clock()
        questions: list[answer_eval.Item] = []
        cases: list[judge_validation.Case] = []
        if eval_set == "questions":
            self._answering()
            questions = answer_eval.load_items(retrieval_eval.cities_with_questions())
        else:
            cases = judge_validation.load_cases()
        run_id = uuid.uuid4().hex
        if not await self._store.claim(run_id, now, now - STALE_AFTER):
            raise Conflict("An evaluation is already running")
        run = EvalRunResponse(
            run_id=run_id,
            set=eval_set,
            status="running",
            started_at=now,
            finished_at=None,
            answer_model=self._answer_model if eval_set == "questions" else None,
            judge_model=self._judge_model,
            judge_prompt=prompt_version(JUDGE_PROMPT),
            index=self._index if eval_set == "questions" else None,
            total=len(questions) or len(cases),
            graded=0,
            failed=0,
            usd=None,
            answers=None,
            agreement=None,
            error=None,
        )
        try:
            await self._store.save_run(_record(run))
        except BaseException:
            await self._shielded(self._store.release(run_id))
            raise
        return StartedRun(run, questions, cases)

    async def events(
        self, started: StartedRun
    ) -> AsyncIterator[EvalProgressEvent | EvalReportEvent]:
        """Grade the run's items, streaming each, then store and send the report."""
        run = started.run
        results: list[Result] = []
        pending: list[EvalItemRecord] = []
        try:
            async with aclosing(self._results(started)) as graded:
                async for result in graded:
                    results.append(result)
                    item = item_response(result)
                    pending.append(
                        EvalItemRecord(item.key, item.model_dump(mode="json"))
                    )
                    if len(pending) >= WRITE_EVERY:
                        await self._store.add_items(run.run_id, pending)
                        pending = []
                    yield EvalProgressEvent(
                        type="progress", done=len(results), total=run.total, item=item
                    )
            if pending:
                await self._store.add_items(run.run_id, pending)
                pending = []
            finished = self._finish(run, results)
            await self._store.save_run(_record(finished))
        except BaseException as exc:
            # an error, or the client leaving (a cancellation, a closed stream)
            await self._shielded(self._fail(run, results, pending, _reason(exc)))
            raise
        await self._shielded(self._store.release(run.run_id))
        yield EvalReportEvent(type="report", run=finished)

    async def history(self, limit: int) -> list[EvalRunResponse]:
        """The latest runs, newest first."""
        return [self.view(r) for r in await self._store.list_runs(limit)]

    async def detail(self, run_id: str) -> EvalRunDetailResponse:
        """One run with its items, in the order of their keys.

        Raises:
            EntityNotFound: there is no such run.
        """
        found = await self._store.get(run_id)
        if found is None:
            raise EntityNotFound("Evaluation run", run_id)
        return EvalRunDetailResponse(
            run=self.view(found.run),
            items=sorted(
                (EvalItemResponse.model_validate(i.data) for i in found.items),
                key=lambda item: item.key,
            ),
        )

    def view(self, record: EvalRunRecord) -> EvalRunResponse:
        """The run as the admin API shows it; a stale `running` one is `interrupted`."""
        run = EvalRunResponse.model_validate(record.data)
        if run.status == "running" and self._clock() - run.started_at > STALE_AFTER:
            return run.model_copy(update={"status": "interrupted"})
        return run

    def _results(self, started: StartedRun) -> AsyncGenerator[Result]:
        if started.run.set == "questions":
            retriever, answerer = self._answering()
            return answer_eval.stream(
                started.questions, retriever, answerer, self._judge
            )
        return judge_validation.stream(started.cases, self._judge)

    def _answering(self) -> tuple[Retriever, LLMProvider]:
        """What a `questions` run answers with.

        Raises:
            ProviderUnavailable: retrieval is off.
        """
        if self._retriever is None or self._answerer is None:
            raise ProviderUnavailable("Retrieval is off (RETRIEVAL_ENABLED)")
        return self._retriever, self._answerer

    def _finish(
        self, run: EvalRunResponse, results: Sequence[Result]
    ) -> EvalRunResponse:
        counted = _counted(run, results, self._clock())
        try:
            if run.set == "questions":
                answers = answers_response(
                    answer_eval.summarize(
                        [
                            r
                            for r in results
                            if isinstance(r, answer_eval.Graded | answer_eval.Failure)
                        ]
                    )
                )
                return counted.model_copy(
                    update={
                        "status": "done",
                        "answers": answers,
                        "usd": _usd(answers.answering, answers.judging),
                    }
                )
            agreement = agreement_response(
                judge_validation.summarize(
                    [
                        r
                        for r in results
                        if isinstance(
                            r, judge_validation.Judged | judge_validation.CaseFailure
                        )
                    ]
                )
            )
            return counted.model_copy(
                update={
                    "status": "done",
                    "agreement": agreement,
                    "usd": _usd(agreement.judging),
                }
            )
        except ValueError as exc:
            return counted.model_copy(update={"status": "failed", "error": str(exc)})

    async def _fail(
        self,
        run: EvalRunResponse,
        results: Sequence[Result],
        pending: Sequence[EvalItemRecord],
        error: str,
    ) -> None:
        """Keep what was graded, mark the run failed and give the lock back."""
        failed = _counted(run, results, self._clock()).model_copy(
            update={"status": "failed", "error": error}
        )
        try:
            if pending:
                await self._store.add_items(run.run_id, pending)
        except Exception:
            logger.warning("Evaluation run %s lost its last items", run.run_id)
        try:
            await self._store.save_run(_record(failed))
        except Exception:
            logger.warning("Evaluation run %s not marked failed", run.run_id)
        finally:
            await self._store.release(run.run_id)

    @staticmethod
    async def _shielded(work: Awaitable[None]) -> None:
        """Await `work` to the end even when the caller is being cancelled."""
        with anyio.CancelScope(shield=True):
            try:
                await work
            except Exception:
                logger.warning("Evaluation store write failed", exc_info=True)


def _reason(exc: BaseException) -> str:
    if isinstance(exc, DomainError):
        return exc.message
    if isinstance(exc, Exception):
        return "The run failed unexpectedly"
    return "Cancelled: the client left before the end"


def _counted(
    run: EvalRunResponse, results: Sequence[Result], now: datetime
) -> EvalRunResponse:
    failed = sum(
        isinstance(r, answer_eval.Failure | judge_validation.CaseFailure)
        for r in results
    )
    return run.model_copy(
        update={
            "finished_at": now,
            "graded": len(results) - failed,
            "failed": failed,
        }
    )


def _record(run: EvalRunResponse) -> EvalRunRecord:
    return EvalRunRecord(
        run_id=run.run_id,
        eval_set=run.set,
        status="running" if run.status == "interrupted" else run.status,
        started_at=run.started_at,
        data=run.model_dump(mode="json"),
    )


def _usd(*spends: SpendResponse) -> float | None:
    known = [s.usd for s in spends if s.usd is not None]
    return round(sum(known), 4) if known else None


def _verdict(verdict: answer_eval.Verdict) -> VerdictResponse:
    return VerdictResponse.model_validate(verdict.model_dump())


def item_response(result: Result) -> EvalItemResponse:
    """One result as the stream and the run detail show it."""
    if isinstance(result, answer_eval.Graded | answer_eval.Failure):
        item = result.item
        graded = isinstance(result, answer_eval.Graded)
        return EvalItemResponse(
            key=f"{item.city}/{item.id}",
            city=item.city,
            id=item.id,
            lang=item.lang,
            query=item.query,
            answerable=item.answerable,
            passages=list(result.passages) if graded else [],
            answer=result.answer if graded else None,
            verdict=_verdict(result.verdict) if graded else None,
            error=None if graded else result.error,
            expected=None,
            origin=None,
            defect=None,
            why=None,
        )
    case = result.case
    judged = isinstance(result, judge_validation.Judged)
    return EvalItemResponse(
        key=case.id,
        city=case.city,
        id=case.id.split("/", 1)[-1],
        lang=case.lang,
        query=case.query,
        answerable=case.answerable,
        passages=list(case.passages),
        answer=case.answer,
        verdict=_verdict(result.verdict) if judged else None,
        error=None if judged else result.error,
        expected=ExpectedVerdictResponse.model_validate(case.expected),
        origin=case.origin,
        defect=case.defect,
        why=case.why,
    )


def _key(graded: answer_eval.Graded) -> str:
    return f"{graded.item.city}/{graded.item.id}"


def answers_response(report: answer_eval.AnswerReport) -> AnswerReportResponse:
    return AnswerReportResponse(
        overall=MeansResponse.model_validate(report.overall),
        by_city=[MeansResponse.model_validate(m) for m in report.by_city],
        by_language=[MeansResponse.model_validate(m) for m in report.by_language],
        unanswerable=len(report.unanswerable),
        unanswerable_acknowledged=sum(
            g.verdict.acknowledges_gap for g in report.unanswerable
        ),
        turned_down=[_key(g) for g in report.turned_down],
        worst=[_key(g) for g in report.worst],
        answering=SpendResponse.model_validate(report.answering),
        judging=SpendResponse.model_validate(report.judging),
    )


def agreement_response(
    report: judge_validation.AgreementReport,
) -> AgreementReportResponse:
    return AgreementReportResponse(
        cases=report.cases,
        groundedness=ScoreAgreementResponse.model_validate(report.groundedness),
        relevance=ScoreAgreementResponse.model_validate(report.relevance),
        low_kappa=report.low_kappa,
        low_agreement=report.low_agreement,
        gap_accuracy=report.gap_accuracy,
        exact_real=report.exact_real,
        exact_perturbed=report.exact_perturbed,
        disagreements=[j.case.id for j in report.disagreements],
        judging=SpendResponse.model_validate(report.judging),
    )
