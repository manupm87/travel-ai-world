# 0039 — The answer judge in the admin console, validated by a golden set

**Status:** Accepted
**Date:** 2026-10-25

## Context

The answer evaluation (`ai_api/application/answer_eval.py`) answers the 126 evaluation questions
the way the planner's chat does, with the production model (Claude Haiku 4.5), and has a model of
another family (Amazon Nova Pro, temperature 0) grade groundedness, relevance and whether a gap is
admitted. It ran only from a laptop with an AWS session (`just eval-answers`): about 0.6 USD and
a few minutes a run. The results lived in a terminal and in `rag-evaluation.md`.

Two things were missing for the project's defence and for anyone checking quality after a change:

- running it, and reading past runs, from `/admin/`, like the retrieval evaluation;
- a measure of the judge itself. Eleven verdicts were checked by hand (8 agreed), and the report
  left a validation against about 50 labelled answers, with Cohen's kappa, as future work.

The admin console only read (the access list aside). The retrieval evaluation stores nothing
because it takes seconds and costs nothing. A run of the answer judge takes minutes and spends
tokens, so throwing the result away means paying again to show it.

## Decision

- **A streamed admin route.** `POST /api/v1/ai/admin/answer-eval` with `{set}`:
  - `questions`: the 126 questions answered and judged.
  - `golden`: the judge alone over `ai_api/data/eval_judge_golden.jsonl`.

  It answers an SSE stream (`progress` per item, then `report`, then `[DONE]`) through the same
  `sse_events` framing as the planner. CloudFront's 60-second read timeout and the 15-minute
  function timeout allow a stream of a few minutes, not a request that waits for its JSON.
- **Runs are stored** (`application/eval_runs.py`, port `EvalStore`, adapter
  `infrastructure/dynamo_eval.py`) in the interactions table, in partitions no trace or counter
  query reads:
  - the run: `EVAL#<run_id>` / `RUN`, listed by GSI1 `EVAL_RUNS`;
  - its items: `EVAL#<run_id>` / `ITEM#<key>`.

  Every item carries the table's 90-day TTL. A run is written `running` before its stream
  starts, its items as they are graded and the run again, `done` or `failed`, before the last
  event, because Lambda may freeze once the response ends. A run still `running` after the
  function's timeout reads as `interrupted`. While a run is in progress, a new one is refused with
  409: a conditional put on one lock item (`EVAL#LOCK`), released when the run ends or stale after
  the function's timeout, so two starts at once cannot both win. That guard does the work of a
  budget: one run at a time, an administrator's click each.
  `GET /answer-evals` and `GET /answer-evals/{run_id}` read them back.

  This is the admin console's second write after the access list, and it writes only its own
  evaluation runs.
- **The judge is a setting** (`JUDGE_MODEL`, `JUDGE_TEMPERATURE`; Terraform
  `bedrock_judge_model`). The function's role may invoke that inference profile as it does the
  chat's, and no other model.
- **The golden set validates the judge.** Each case freezes:
  - a question;
  - the passages exactly as the judge reads them;
  - an answer;
  - the verdict a careful reader gives it under the judge's rubric.

  Some answers are real answers of the production model. Others have a known defect put in on
  purpose (an invented price or time, a wrong currency, an answer to another question, a false "I
  don't know"): without them almost every score is 5 and kappa says nothing. The labels are
  proposed by Claude, which reads each case against its passages, checked blind by a second
  reviewer and reviewed by the team. `application/judge_validation.py` reports:
  - exact and within-one agreement per score;
  - Cohen's kappa with quadratic weights per score;
  - Cohen's kappa of "either score under 3", the report's bad-answer line;
  - the gap flag's accuracy;
  - the disagreements.

  Only the judge is called, so a check costs cents and does not move with the index or the
  answering model.

## Consequences

- An administrator can spend about 0.6 USD with one click. There is no budget beyond one run at a
  time. Repeated runs show in the history and in the Bedrock dashboard (ADR 0037).
- The golden set is a fixed instrument. A change to the judge prompt or model is compared on it
  before it is trusted on the 126 questions. A change to the rubric changes what the labels mean,
  so the set is relabelled with it.
- The labels are not independent human judgments. Agreement with them bounds how far the judge
  follows the rubric as written, not how a traveller would rate an answer. A user study is still
  the measure of that.
- Runs expire with the table (90 days). A result worth keeping goes into `rag-evaluation.md`.
