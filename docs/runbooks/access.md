# Runbook — who may use the app, and how much

The access list and the daily token limit
([ADR 0026](../architecture/adr/0026-access-list-and-daily-token-quota.md)). Everything here is
done by an administrator from the console; nothing needs a deploy except switching the mode.

## How it works, in four lines

- `core_api` runs in `ACCESS_MODE=allowlist` on AWS (`open` locally): a signed-in account gets in
  when it is an **administrator** or its **email is on the list**. Anyone else gets 403
  `ACCESS_DENIED` from every route and sees the "You're not on the list yet" page.
- The list is data in `core_api`'s table, edited at **`/admin/access/`**. A change takes effect
  on the person's next request.
- Each grant may carry a **daily token limit**: empty = the default
  (`DEFAULT_DAILY_TOKEN_LIMIT`, 300 000), `0` = unlimited. **Nothing enforces it yet**: the limit
  is stored and served by `GET /users/me/access`; `ai_api` will count tokens and refuse over it
  when TRA-258 lands.
- **Until TRA-258, only `core_api`'s routes are gated.** `ai_api` does not read the list yet: it
  still verifies the token only, so an uninvited account with a valid token can still call
  `ai_api` directly and spend tokens (the app itself shows it the "not on the list" page, and
  whatever goes to `core_api` with that token is refused). TRA-258 closes that.
- Administrators (`admin_usernames` in `infra/aws/admins.auto.tfvars`, ADR 0024) never need a
  grant; a grant only gives them a limit of their own.

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

## Remove someone

**Remove** on the row, then confirm. Their next request to `core_api` is refused (`ai_api` follows
with TRA-258); their account, trips and
conversations stay as they are, and inviting them again brings everything back.

## Switch the mode, or the default limit

Both are Terraform variables of `infra/aws` that become environment variables of `core-api`:

| Variable | Default | `core-api` gets |
|---|---|---|
| `access_mode` | `"allowlist"` | `ACCESS_MODE` (`"open"` lets every signed-in account in) |
| `default_daily_token_limit` | `300000` | `DEFAULT_DAILY_TOKEN_LIMIT` (`0` = unlimited) |

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

## What gets logged

Every admin call on the list writes one line in `core-api`'s log group:
`admin_read subject=<admin> route=/api/v1/admin/access target=-` for the list, and
`admin_write subject=<admin> route=/api/v1/admin/access/<email> target=<email>` for an invite, a
change or a removal.
