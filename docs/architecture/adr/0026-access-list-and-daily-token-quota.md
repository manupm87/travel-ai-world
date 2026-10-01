# 0026 — An access list in `core_api`, and a daily token quota per person

**Status:** Accepted
**Date:** 2026-10-01

Amends [ADR 0024](0024-turn-traces-and-admin-access.md) ("no service reads a list at request
time"). TRA-257 (the access list) and TRA-258 (the quota).

**What is in force:** TRA-257 gates `core_api`'s routes only. Until TRA-258 is delivered `ai_api`
does not read the list or the limit: it verifies the token and nothing else, so the planner's
LLM turns are neither closed to uninvited accounts nor counted. Everything under "The daily
token quota" below, including `ai_api` refusing an account that is not allowed, is design, not
behaviour.

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

- **Scope: `core_api`.** This part gates `core_api`'s routes. `ai_api` starts honouring the list
  with TRA-258 (below); until then an uninvited account with a valid token can still call it.
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

### The daily token quota (TRA-258, designed here, implemented there)

Not built yet: the present tense below describes `ai_api` once TRA-258 is delivered.

- **`ai_api` counts, `core_api` says how many.** `ai_api` stays stateless about accounts: before
  a turn it asks `core_api` for `GET /users/me/access` with the caller's token (the same
  service-to-service call as every other, ADR 0002) and gets both answers at once — may this
  account use the app, and its limit.
- **The counter is one item per subject and UTC day in the interactions table** (ADR 0024),
  incremented with the turn's input + output tokens when the turn's trace is written. The key
  carries the day, so there is nothing to reset, and the item expires with the table's TTL.
- **Over the limit is 429 `DAILY_TOKEN_LIMIT`**, checked before the turn starts. It is a **soft
  limit**: the turn that crosses the line finishes (tokens are only known at the end) and the
  next one is refused. A `null` limit skips the check.
- **Fail open on the counter, closed on the list.** If the counter cannot be read the turn runs
  (a quota must not take the planner down); if `core_api` says `allowed: false`, or cannot be
  asked, the turn does not.

## Consequences

- **ADR 0024 is amended, not reversed.** Administrators are still the Cognito group, in the
  token, code-reviewed; no service reads a list to decide who is an admin. Travellers' access is
  a runtime list because it must be editable without a deploy and before first sign-in.
- **One more read per request in `allowlist` mode** for non-admins: a `GetItem` by key
  (consistent, single-digit milliseconds, a fraction of a cent per million). `open` mode and
  administrators read nothing. Removing a grant takes effect on the person's next request — there
  is no cache to wait out.
- **The first deploy locks everyone out but the administrators**, by design: `access_mode`
  defaults to `allowlist`. The team is invited at `/admin/access/` right after
  ([runbook](../../runbooks/access.md)); `access_mode = "open"` is the way back.
- **An invited email is not an account.** A grant can exist for someone who never signs in, and
  deleting an account does not delete its grant. The admin page shows the list as it is.
- **Email is the key**, so a person who signs in with another Google account is someone else.
  Emails are compared trimmed and lower-cased; nothing cleverer (no `+tag` or dot folding).
- The quota is per person, not global: a monthly budget alarm stays the backstop for total spend.

### Rejected

- **A Cognito group for travellers.** The group needs the user to exist — a first sign-in — and
  an apply (or a console change) per person; and the membership would live in the ID token for
  up to an hour after it is removed.
- **A pre-sign-up Lambda trigger** that refuses unknown emails. A function, its deploy path and
  its permissions for a list lookup; the refusal happens inside the hosted UI, where we cannot
  explain it; and it still needs somewhere to keep the list and the per-person limit.
- **An `ALLOWED_EMAILS` environment variable.** A deploy per invitation, no per-person limit,
  and a list of personal emails in Terraform state and the function's configuration.
