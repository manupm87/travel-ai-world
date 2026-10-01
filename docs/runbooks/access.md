# Runbook — who may use the app, and how much

The access list and the daily token limit
([ADR 0026](../architecture/adr/0026-access-list-and-daily-token-quota.md)). Everything here is
done by an administrator from the console; nothing needs a deploy except switching the mode.

## How it works

- `core_api` runs in `ACCESS_MODE=allowlist` on AWS (`open` locally): a signed-in account gets in
  when it is an **administrator** or its **email is on the list**. Anyone else gets 403
  `ACCESS_DENIED` from every route and sees the "You're not on the list yet" page.
- The list is data in `core_api`'s table, edited at **`/admin/access/`**. A change takes effect
  on the person's next request.
- Each grant may carry a **daily token limit**: empty = the default
  (`DEFAULT_DAILY_TOKEN_LIMIT`, 300 000), `0` = unlimited. `ai_api` enforces it: it adds every
  turn's input + output tokens to a counter per account and UTC day, and refuses a planner or
  chat request once the day's count has reached the limit (429 `DAILY_TOKEN_LIMIT`). The count
  starts again at **00:00 UTC**.
- **`ai_api` is gated too.** Before a planner or chat request it asks `core_api` whether the
  account may use the app and what its limit is, and keeps the answer for **60 seconds**. So a
  removed grant or a changed limit takes up to a minute to reach the planner; an invitation
  works at once.
- Administrators (`admin_usernames` in `infra/aws/admins.auto.tfvars`, ADR 0024) never need a
  grant; a grant only gives them a limit of their own.
- **Behind CloudFront an API 403 arrives as a 404** (the distribution serves `/404.html` for
  every 403, see [deploy.md](deploy.md)). So do not look for `ACCESS_DENIED` in the browser's
  network tab in production: the "not on the list" page relies on `GET /users/me/access` (a 200
  either way), and the planner re-checks that read before falling back to the demo on a 404, so
  an uninvited account gets the no-access message, never a recorded plan.

## Invite someone

1. Open `https://<domain>/admin/access/` as an administrator.
2. Type the **email of the Google account** they will sign in with, optionally a daily limit and
   a note ("beta tester, invited by Ana"), and press **Add or update**.
3. Tell them to sign in (or sign in again). No account has to exist beforehand.

The same form changes an existing grant: **Edit** on its row refills the form.

## Change a limit

**Edit** on the row → set the limit → **Add or update**. Empty goes back to the default, `0`
removes the limit for that person. To change the default for everyone, set
`default_daily_token_limit` in Terraform and apply (below).

## See today's usage

`/admin/access/`, under the list: **Usage today**. One row per account that spent a token since
00:00 UTC, most tokens first: turns, tokens (input + output, what the limit counts), the limit its
grant gives it ("Default" when the grant sets none or the email has no grant, "Unlimited" for `0`)
and, when that limit is a number, a bar of how much of it is gone — red and "Limit reached" at
100 %. **Reload** reads the counters again. A row shows a short id instead of an email when the
account is not in `/admin/users/` (it was deleted).

`ai_api` counts by token subject and knows no email; the page joins the two lists in the browser.
Another day: `GET /api/v1/ai/admin/usage?day=YYYY-MM-DD` (administrators only; kept 90 days).

## Someone hit the limit

What they see: the planner answers "You've reached today's planning limit. You can keep planning
from <weekday and their local time of 00:00 UTC>." in place of the turn, with no retry button,
and the composer takes no message until then. Their trip is untouched, and
everything that spends no tokens keeps working (their trips, saving, the cards already on screen).

To let them go on today: **Edit** their row and raise the limit (or `0` for unlimited), **Add or
update**. Within a minute their next message goes through; nothing has to be reset, because the
check compares today's count with the new limit. Lowering a limit below what someone already
spent stops them the same way, within a minute.

The limit is soft and approximate: tokens are only known once a turn ends, so the turn that
crosses it finishes, and so does every other turn the person had running at that moment (several
tabs). A row can show over 100 %, marked "Limit reached".

## Remove someone

**Remove** on the row, then confirm. Their next request to `core_api` is refused, and `ai_api`
follows within a minute (it keeps each answer for 60 seconds); their account, trips and
conversations stay as they are, and inviting them again brings everything back.

## Switch the mode, or the default limit

Both are Terraform variables of `infra/aws` that become environment variables of `core-api`:

| Variable | Default | `core-api` gets |
|---|---|---|
| `access_mode` | `"allowlist"` | `ACCESS_MODE` (`"open"` lets every signed-in account in) |
| `default_daily_token_limit` | `300000` | `DEFAULT_DAILY_TOKEN_LIMIT` (`0` = unlimited) |

`ai-api` always runs with `ACCESS_CONTROL_ENABLED=true` on AWS (`infra/aws/lambda.tf`): it has no
mode of its own and follows whatever `core-api` answers. With `access_mode = "open"` and
`default_daily_token_limit = 0` nobody is refused and nothing is limited, while the usage is
still counted.

Change the value (a `*.auto.tfvars` file or `TF_VAR_*`), open the PR and let the deploy apply it
([deploy runbook](deploy.md)). `terraform apply` is a human decision, as always.

## Right after the first deploy

The deploy that brings this in turns the list on with nobody on it:

1. Administrators still get in (they need no grant). Check that you do: `/admin/` opens.
2. Open `/admin/access/` and invite the team and the people already using the app
   (`/admin/users/` lists every account's email).
3. Sign in with a non-admin account that you invited: the dashboard opens. With one that you did
   not: the "not on the list yet" page shows, with the email it signed in with. Someone invited
   while they look at that page presses **Check again**; no new sign-in is needed.

If something is wrong, `access_mode = "open"` and an apply puts things back as they were.

`ai-api` depends on `core-api` for this: if `core-api` cannot be reached, planner and chat
requests answer 503 rather than run unchecked (the counter failing, on the other hand, never
stops a turn).

## Locally

The default is `ACCESS_MODE=open`, so nothing changes. To try the list:

```bash
# src/backend/services/core_api/.env
ACCESS_MODE="allowlist"

just dev-token admin@example.com --admin        # an administrator: gets in without a grant
just dev-token guest@example.com                # a traveller: 403 ACCESS_DENIED until invited
just dev-grant guest@example.com --limit 50000  # writes the grant (0 = unlimited; no flag = default)
```

`just dev-grant` (`python -m core_api.devtools grant <email> [--limit N]`) writes straight to the
local table, like `PUT /admin/access/{email}` would; it is dev-only and nothing in the service
imports it.

`ai_api` asks nobody by default (`ACCESS_CONTROL_ENABLED=false`), so `just dev-ai` runs on its
own. To try the quota, both services running:

```bash
# src/backend/services/ai_api/.env
ACCESS_CONTROL_ENABLED="true"
INTERACTIONS_TABLE="travel-ai-local-interactions"   # where the tokens are counted

just dev-grant guest@example.com --limit 2000   # a limit one turn will cross
```

The first planner turn runs; the next answers 429 `DAILY_TOKEN_LIMIT` and the page says when the
allowance resets. `GET /api/v1/ai/usage/me` shows the count. Compose (`just docker-up`,
`just stack-up`) turns the check on for you, with the default limit.

## What gets logged

Every admin call on the list writes one line in `core-api`'s log group:
`admin_read subject=<admin> route=/api/v1/admin/access target=-` for the list, and
`admin_write subject=<admin> route=/api/v1/admin/access/<email> target=<email>` for an invite, a
change or a removal. Reading the usage writes
`admin_read subject=<admin> route=/api/v1/ai/admin/usage target=-` in `ai-api`'s.
