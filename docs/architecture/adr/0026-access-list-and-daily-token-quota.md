# 0026 — An access list in `core_api`, and a daily token quota per person

**Status:** Accepted
**Date:** 2026-10-01

Amends [ADR 0024](0024-turn-traces-and-admin-access.md) ("no service reads a list at request
time"). TRA-257 (the access list) and TRA-258 (the quota).

**What is in force:** both parts. TRA-257 gates `core_api`'s routes; TRA-258 makes `ai_api`
refuse the same accounts, count every turn's tokens and enforce the daily limit, wherever it runs
with `ACCESS_CONTROL_ENABLED=true` (AWS and Compose; off in plain local development).

## Context

The app is public: anyone with a Google account can sign in, and every planner turn spends LLM
tokens that we pay for. Two things were missing before more people get the link:

- **A closed beta.** Only the people we invite should be able to use the app. The invitation has
  to work *before* the person's first sign-in (we know an email, not a Cognito username) and has
  to be editable by an administrator in a minute, without a deploy.
- **Cost control.** One account must not be able to spend an unbounded number of tokens in a day,
  and the bound has to be adjustable per person (the team needs more than a guest).

ADR 0024 made administrators a Cognito group filled from Terraform and stated that no service
reads a list at request time. That is right for a list of two that changes twice a year and must
be code-reviewed. It does not fit travellers: a Cognito group needs the account to exist (so a
first sign-in) and a `terraform apply` per invitation.

## Decision

### The access list (TRA-257)

- **Scope: `core_api`.** This part gates `core_api`'s routes. `ai_api` honours the list through
  the quota's check (below).
- **`core_api` keeps the list in its table.** An `AccessGrant` is keyed by email (trimmed,
  lower-cased): `PK = ACCESS#<email>`, `SK = ACCESS`, listed through GSI1 under its own partition
  (`GSI1PK = ACCESS`, `GSI1SK = <email>`), so the accounts list (`GSI1PK = USERS`) never sees it
  and no table or index changes. It carries `daily_token_limit` (`null` = the default applies,
  `0` = unlimited), a `note`, `added_by` (the admin's token subject) and its timestamps.
- **`ACCESS_MODE`** (`open` | `allowlist`) decides whether the list gates anything. `open` is the
  default of the code, so local development, Compose and the tests need no grant; Terraform sets
  `allowlist` on AWS (`access_mode`). In `allowlist` mode an account gets in when it is an
  administrator (the Cognito group of ADR 0024 — admins never need a grant) or when a grant
  exists for its email.
- **The gate is the default dependency.** `api/deps.py::get_current_user` is now
  `get_authenticated_user` (token → account, as before) plus `AccessService.ensure_allowed`,
  which raises `AccessDenied` — a `Forbidden` with its own code: **403 `ACCESS_DENIED`**. Every
  route that already depended on `get_current_user` is gated without being touched, and a new
  route is gated unless it opts out. Two routes opt out, with `get_authenticated_user`:
  `GET /users/me` and `GET /users/me/access`. Sign-in itself is not gated, so a not-yet-invited
  person can sign in and be told why nothing works.
- **`GET /api/v1/users/me/access`** → `{ allowed, daily_token_limit }` answers for any signed-in
  account. `daily_token_limit` is the grant's limit when it has one, else
  `DEFAULT_DAILY_TOKEN_LIMIT` (300 000); a resulting `0` is reported as `null` = unlimited. The
  grant's limit applies in `open` mode and to administrators too.
- **Administrators edit the list** under the existing admin router: `GET /admin/access`
  (cursor pages), `PUT /admin/access/{email}` (an upsert of limit and note; the first admin and
  the creation time are kept) and `DELETE /admin/access/{email}` (404 when it was not there).
  These are the console's first writes: the router's audit line is `admin_read` for a GET and
  `admin_write` for the rest, with the email as target.
- **The frontend says it once.** `AuthContext` reads `/users/me/access` next to the role, once
  per signed-in account, and exposes `access: unknown | allowed | denied` (never stored with the
  session). `ProtectedRoute` shows `NoAccess` instead of the page when it is `denied`; `unknown`
  (no API, a failed read) behaves as allowed, because the backend refuses anyway. The console
  gains `/admin/access/`.

### The daily token quota (TRA-258)

- **`ai_api` counts, `core_api` says how many.** `ai_api` stays stateless about accounts: before
  a turn it asks `core_api` for `GET /users/me/access` with the caller's token (the same
  service-to-service call as every other, ADR 0002) and gets both answers at once — may this
  account use the app, and its limit.
- **What counts** is `input_tokens + output_tokens` of the turn's model calls, as its trace
  reports them. Embedding tokens are stored beside them and not counted. The day is the UTC date
  the turn started.
- **The counter is one item per token subject and UTC day in the interactions table** (ADR 0024):
  `PK = USAGE#<subject>`, `SK = DAY#<YYYY-MM-DD>`, listed per day through GSI1
  (`GSI1PK = USAGE_DAY#<day>`, `GSI1SK = <subject>`), with `input_tokens`, `output_tokens`,
  `embed_tokens`, `turns`, `item = "usage"` and `expires_at`. It is written when the turn's trace
  is, by one `UpdateItem` with `ADD`: atomic, nothing is read to write, so concurrent turns lose
  nothing. The key carries the day, so there is nothing to reset, and the item expires with the
  table's TTL (`INTERACTION_TTL_DAYS` after the day ends). The partitions are the counter's own:
  no trace listing returns one, and no table or index changes — the `ai-api` role only gains
  `dynamodb:UpdateItem`.
- **Every turn is counted**, however it ends: a stream that finishes, one that ends in an error,
  one the client abandons, and the card detail. The trace write and the counter write are
  attempted independently; a failure of either is logged and never breaks the turn.
- **The check runs before the turn starts**, as a route dependency: `require_budget` on
  `POST /ai/planner` and `POST /ai/chat`, `require_access` (the list only) on
  `GET /ai/planner/cities`, `GET /ai/planner/card` and `GET /ai/usage/me`. The admin and health
  routes are unchanged. A refusal is an ordinary JSON error, sent before any stream exists:
  **403 `ACCESS_DENIED`**, or **429 `DAILY_TOKEN_LIMIT`** with `extras` `limit`, `used` and
  `resets_at` (the next UTC midnight, ISO 8601).
- **It is a soft, approximate limit.** Tokens are only known when a turn ends, and that is when
  the counter is written. A request is refused when `used >= limit` at the moment it arrives, so
  every turn already running, or started in parallel, when the line is crossed finishes: the
  overshoot is bounded by the turns in flight at that moment, not by one turn. A turn is charged
  to the UTC day it started on, so one that runs across midnight counts for the day before. A
  `null` limit skips the counter, and a limit of zero or less read from `core_api` is taken as
  none.
- **No cap in process.** A per-account lock or an in-memory count of running turns would not
  hold: on Lambda, concurrent requests run in separate execution environments that share no
  memory. A strict cap needs a reservation in DynamoDB (see the alternatives); the approximate
  one is what a daily budget per person needs.
- **The counter survives a client that leaves.** The usage write comes first and both writes run
  shielded from the cancellation of the streaming task, so a disconnect at the end of a turn
  cannot make it free. It is still counted once.
- **`core_api`'s answer is cached in process, per token subject, for `ACCESS_CACHE_SECONDS`
  (60)**, at most 1024 accounts, oldest dropped. That is the price of not calling `core_api` on
  every request, and it is the delay of this design: a changed limit or a removed grant reaches
  `ai_api` within a minute, per warm Lambda environment. A refusal is never cached, so an
  invitation works on the next request; the accepted cost is one `core_api` call for every
  request of an account that is refused.
- **Fail open on the counter, closed on the list.** If the counter cannot be read the turn runs
  (a quota must not take the planner down); if `core_api` says `allowed: false`, or cannot be
  asked, the turn does not (503 when it is unreachable). Only `core_api`'s 401 and 403 are
  passed on as such: any other answer to the access question (400, 404, 422, a body of another
  shape) is a 503 too, so that a planner route never answers a 404 the browser would read as
  "not deployed".
- **`ACCESS_CONTROL_ENABLED`** (default `false`) turns the check on. Off, `ai_api` asks nobody
  and limits nothing — it still runs on its own in local development — while the tokens are
  counted all the same. Terraform and Compose set it to `true`.
- **Two reads.** `GET /ai/usage/me` → `{day, used_tokens, input_tokens, output_tokens, turns,
  daily_token_limit, resets_at}` for the caller; `GET /ai/admin/usage?day=` → every account's
  counter of a UTC day, most tokens first, for administrators (audited like the trace reads).
- **The frontend says it where it happens.** The planner turns a 429 `DAILY_TOKEN_LIMIT` into
  "you've reached today's planning limit; you can keep planning from <local weekday and time>",
  with no retry, and a 403 `ACCESS_DENIED` into the no-access sentence and its hint. In both
  cases the composer and the suggestions stop taking turns (until the reset time for the limit). `/admin/access/` gains "Usage today": turns and
  tokens per account against the limit its grant gives it. `ai_api` knows subjects, not emails,
  so the page joins the counters to the accounts in the browser, as it does for traces. There is
  no usage meter in the traveller's UI.
- **Behind CloudFront an API 403 arrives as a 404.** The distribution rewrites every 403 into
  the HTML `/404.html` (`custom_error_response` in `infra/aws/frontend.tf`), API paths included,
  so in production the browser never sees `ACCESS_DENIED` as such. The traveller-facing gate
  therefore relies on `GET /users/me/access`, which answers 200 for an uninvited account too; and
  the planner, which treats a 404 on its route as "not deployed" and plays the recorded demo,
  re-checks that read first: `allowed: false` gives the no-access sentence, anything else the
  demo as before. The 429 is not rewritten. Locally and in Compose the 403 arrives untouched.

## Consequences

- **ADR 0024 is amended, not reversed.** Administrators are still the Cognito group, in the
  token, code-reviewed; no service reads a list to decide who is an admin. Travellers' access is
  a runtime list because it must be editable without a deploy and before first sign-in.
- **One more read per request in `allowlist` mode** for non-admins: a `GetItem` by key
  (consistent, single-digit milliseconds, a fraction of a cent per million). `open` mode and
  administrators read nothing. Removing a grant takes effect on the person's next request to
  `core_api`; `ai_api` follows within `ACCESS_CACHE_SECONDS`.
- **`ai_api` now depends on `core_api` to answer.** One HTTP call per account per minute and per
  warm environment, through the public origin; when `core_api` is down, planner and chat requests
  answer 503 instead of running unchecked. One `GetItem` per limited turn and per
  `GET /ai/usage/me`, and one `UpdateItem` per turn, are added to the interactions table. An
  account that is refused costs one `core_api` call per request, since denials are not cached.
- **The limit is approximate.** It can be overshot by every turn that was running or started in
  parallel when the line was crossed (a person with several tabs can start several under the line
  at once): the overshoot is bounded by concurrent turns, not by one turn. The bound is on a
  day's spend, not on a request's.
- **The counter starts at 00:00 UTC**, not at the person's midnight: one rule for everyone, and a
  key that needs no time zone. The page prints the reset in local time.
- **The first deploy locks everyone out but the administrators**, by design: `access_mode`
  defaults to `allowlist`. The team is invited at `/admin/access/` right after
  ([runbook](../../runbooks/access.md)); `access_mode = "open"` is the way back.
- **An invited email is not an account.** A grant can exist for someone who never signs in, and
  deleting an account does not delete its grant. The admin page shows the list as it is.
- **Email is the key**, so a person who signs in with another Google account is someone else.
  Emails are compared trimmed and lower-cased; nothing cleverer (no `+tag` or dot folding).
- The quota is per person, not global: a monthly budget alarm stays the backstop for total spend.
- **The counter is its own item, not a sum over the day's traces**, so it stays right when a
  trace write fails and costs one read however many turns the day had.

### Rejected

- **A Cognito group for travellers.** The group needs the user to exist — a first sign-in — and
  an apply (or a console change) per person; and the membership would live in the ID token for
  up to an hour after it is removed.
- **A pre-sign-up Lambda trigger** that refuses unknown emails. A function, its deploy path and
  its permissions for a list lookup; the refusal happens inside the hosted UI, where we cannot
  explain it; and it still needs somewhere to keep the list and the per-person limit.
- **An `ALLOWED_EMAILS` environment variable.** A deploy per invitation, no per-person limit,
  and a list of personal emails in Terraform state and the function's configuration.
- **Summing the day's traces at check time** instead of a counter. A query over every turn of
  the day per request, slower as the day goes on, and wrong whenever a trace write failed.
- **A hard limit** (reserve tokens before the turn, settle after). The size of a turn is not
  known in advance; a reservation would refuse turns that fit, and it needs a second write and a
  clean-up path for turns that die. One turn of overshoot is cheaper than that.
- **Asking `core_api` on every request**, with no cache. It doubles the latency floor of every
  planner read for a list that changes a few times a week; a minute of delay is acceptable.
- **Sharing the access list's table with `ai_api`** (or the counters' with `core_api`). Each
  service keeps its own table (ADR 0023); the question is one HTTP call.
