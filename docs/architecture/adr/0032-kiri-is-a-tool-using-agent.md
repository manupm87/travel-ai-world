# 0032 — Kiri is a tool-using agent in `ai_api`

**Status:** Accepted (amends [0015](0015-planner-sse-v2-stateless-orchestration.md))
**Date:** 2026-10-19

## Context

`ai_api/application/plan_trip.py` is a hand-written state machine. After the draft, `_classify` maps
the traveller's message to one of three intents (`find_options`, `change_stay`, `chat`). Before the
stay, regular expressions decide the flow (`GENERATE_WORDS`), and the state is read back from the
bot's own fixed sentences (`_neighbourhoods_offered`, `_hotels_offered_in`). The consequences:

- compound asks are impossible ("remove the museum on day 2 and put a thermal bath in the afternoon");
- nothing can move, remove, swap or redo a day from the chat;
- the voice is canned (`PLANNER_TEXTS`).

The model should choose **tools**, while the structural guarantee of ADR 0015 stays: a place reaches
the traveller only as a corpus document the server fetched.

## Decision

**The agent lives in `ai_api`, in process.** Tools are async Python functions over the existing
`PlanTrip` helpers; the loop runs on Bedrock Converse (`converse_stream` with `toolConfig`) through
the `LLMProvider` port. The service stays stateless: the client still carries the brief, the
itinerary snapshot and the transcript.

**Domain types** live in `ai_api/domain/agent.py`, frozen dataclasses: `ToolSpec`, `ToolCall`,
`ToolResult` (its `content` is JSON text), `AgentMessage` (a role, its text, the calls an assistant
turn made, the results a user turn carries) and the stream items `TextDelta`, `ToolCallReady` and
`StepEnd` (`end_turn`, `tool_use`, `max_tokens` or `other`). The text-only `Message` is untouched.

**The port.** `LLMProvider` gains `supports_tools` (a verified model set, like
`supports_structured_outputs`) and `converse(system, messages, tools, *, usage)`, which streams text
as it comes, one `ToolCallReady` once a call's input is complete and exactly one `StepEnd`. Retries
happen only before the first item. Bedrock sends `toolConfig` (input schema as a dict, `toolChoice`
auto) on every step, since Converse refuses a conversation holding `toolUse` / `toolResult` blocks
without it; it never sends a blank text block, parses the tool input streamed in pieces at
`contentBlockStop` (empty input is `{}`, input cut short by `max_tokens` is kept as `{"_raw": ...}`)
and maps the other stop reasons (`stop_sequence`, `guardrail_intervened`, `content_filtered`) to
`other`. NVIDIA (OpenAI-compatible) sends `tools`, assistant `tool_calls` and `tool` messages, and
assembles streamed `tool_calls` fragments by index. `FakeProvider` scripts steps.

**Tracing (ADR 0024).** Every agent step goes through `traced_converse`: one `llm` span with
`operation="agent"`, the usual token fields, the traveller's message as `input`, the tools offered,
the names of the calls (`tool_calls`) and the `stop_reason`. Every tool execution goes through
`tool_span`: a `tool` span named `tool:<name>` with `service="planner"`, `status`, `count` and its
`arguments` (JSON, clipped like `input`). Ids a write tool puts on the itinerary go through
`tracer.mark_used`; an unknown id is counted with `tracer.note_picks([], [id])`.

**The loop** (`application/agent/loop.py`) streams each step's text at once, runs the calls in
order, one at a time, and loops until a step makes no call. `AGENT_MAX_STEPS` (6) and
`AGENT_MAX_TOOL_CALLS` (12) bound a turn: past either, every further call is answered
`budget_exhausted` and one last step must answer the traveller; if it still calls tools, the turn
ends with a fixed sentence. An unknown tool, invalid arguments or a `DomainError` inside a tool
become an error result the model reads; any other exception is logged and answered
`{"error":"internal"}`; `ProviderUnavailable` propagates to the stream's `error` event.

**Tools** (`application/agent/tools.py`) each have a name, an English description of when to use
them, a Pydantic `Input` (its schema from `application/agent/schema.tool_schema`: `$defs` inlined,
titles dropped, optional fields optional, `additionalProperties: false`) and an async `run`. **Write
tools accept only ids the turn knows**: documents fetched or retrieved in this turn, plus the
itinerary's. Any other id is an error result, so the no-invented-places rule stays structural.
Itinerary edits reuse the existing ops (`put_activity`, `remove_activity`, `set_day_title`): the
wire contract does not change. Stays are never set by the agent; it offers the carousel and the
traveller's `select` keeps going through `_on_select`.

**Rollout.** `PLANNER_AGENT` is the switch; it defaults to on once the conversation evaluation shows
the agent at or above the baseline. The page's own alternatives message and the `select` / `remove`
actions stay deterministic. From the agent PRs on, a PR that changes the planner pastes
`just eval-conversations` next to the baseline in `docs/architecture/agent-evaluation.md` and may not
lower the pass rate of the safety checks.

## Alternatives rejected

- **One Lambda per tool.** A cold start and a network hop per step, the context serialised on every
  call, and the trace split across functions.
- **Bedrock Agents.** Its output is text, so the typed SSE contract (ADR 0015) would have to be
  translated back from prose, and the loop and its budgets would not be ours.
- **Bedrock AgentCore.** Not needed while the tools have one consumer. Revisit if the tools get other
  clients or the agent needs memory across trips.

## Consequences

- Good: compound asks and edits (move, remove, swap, redo a day) become possible without a new
  intent or a regex; the voice is the model's, not `PLANNER_TEXTS`.
- Good: no wire contract change; the page, the generated types and the reducer stay as they are.
- Good: every step and every tool call is a span, so a turn can be replayed from the admin console.
- Cost: input tokens per turn grow about 3-6×, since each step re-sends the prompt, the tool
  definitions and the history. The daily quota (ADR 0026) is reached sooner; the conversation
  evaluation reports tokens per scenario.
- Latency: a turn is several model calls. CloudFront's origin read timeout is 60 s and the SSE has no
  heartbeat, so each tool call also emits its progress phase (ADR 0025) and the stream is never
  silent for long.
- Rollback: until TRA-291 removes the old path, `PLANNER_AGENT=false` restores the state machine
  without a Terraform change. After TRA-291, the rollback is redeploying the previous image.
- Known gap: day-level warnings can go stale after an edit, since there is no op to clear them
  (TRA-290).
- Only verified models call tools: Bedrock's Haiku 4.5 EU profile and the NVIDIA models listed in
  `TOOL_USE_MODELS`, each checked by `tests/manual/converse_probe.py` (NVIDIA). That NVIDIA set
  ships empty: the probe of GLM-5.3-Flash, the default local model, read-timed out on every run, so
  local dev on NVIDIA keeps the state machine until a probe passes and GLM is added. A Bedrock run
  by a human after `just aws-login` is required before the deploy that ships the agent.
