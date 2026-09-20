# 0011 — Real trips: backend-seeded demo data, client-side loading, `/trip/?id=`, dev mirrors prod

> **Superseded in part by [ADR 0019](0019-trips-live-in-the-planner.md):** the demo seed is
> retired and trips live in the planner. `/dashboard/` and `/trip/?id=` are redirects now;
> `just dev-token` creates the account the seed used to create.

**Status:** Accepted
**Date:** 2026-09-16

Drafted with the seed (TRA-128); accepted with the trip viewer (TRA-130), once the dashboard
(TRA-129) and the viewer read the API.

## Context

The frontend renders four demo trips from fixtures (`src/frontend/src/mocks/*.ts`, in the
exact shape of `core_api`'s `TripResponse`, checked with `satisfies`), while the database behind
`core_api` has no trips at all. Users who sign in see the same four fixtures whatever they do;
nothing they create is shown. The trip page is `/trip/[id]/` with a fixed list of fixture ids,
which a static export can serve only for ids known at build time.

Forces: the frontend is a static export (S3 + CloudFront, ADR 0009) with no server at request
time; the backend runs as the same image in Docker Compose and on Lambda; sign-in is Google in
`AUTH_MODE=local` and Cognito in production; e2e tests run in GitHub Actions where neither
Google nor Cognito can be driven.

## Decision

1. **Demo data lives in the backend.** The four fixtures become JSON files packaged with
   `core_api` (`core_api/seed/data/<slug>.json`, `TripResponse`-shaped, fixture ids kept only as
   in-file cross-references). `core_api.seed.seed_demo_trips(session_factory, email)` loads them
   for one account, creating it if missing, through `TripService` / `BaseService.create`: the
   Create schemas and `check_invariants()` apply, the database generates the UUIDs and the loader
   remaps destination and day references. A demo trip is identified by `(owner, title)`, so
   re-running replaces the four and leaves the account's other trips alone, in one unit of work.
   One implementation, three entry points through `core_api/ops.py`: `just seed <email>`,
   `entrypoint.sh seed <email>` (Compose) and `{"command": "seed", "args": {"email": ...}}`
   on the Lambda's `POST /events`.
2. **The frontend reads the API on the client.** Dashboard and viewer are static shells that fetch
   with the session token and render loading / empty / not-found / error states. There is no
   fixture fallback for API-less builds: the static demo is dead, and two data paths are not
   worth keeping.
3. **The trip URL becomes `/trip/?id=<uuid>`.** A static export cannot serve `/trip/<any-uuid>/`:
   `next dev` and `next build` require `dynamicParams = false` with the ids enumerated at build
   time. An edge rewrite (CloudFront function mapping `/trip/<id>/` to `/trip/index.html`) would
   fix production only; `next dev`, the export served by nginx and Playwright would each need
   their own workaround. The query string works in dev, in the export, behind nginx and behind
   CloudFront with no infrastructure.
4. **Dev mirrors prod.** Docker Compose becomes the "prod-shaped" stack: nginx serves the static
   export at `/` and proxies `/api/*`, exactly the CloudFront layout, and applies migrations at
   start as it does today. `next dev` on `:3000` stays the hot-reload inner loop. Sign-in stays
   `AUTH_MODE=local` (Google button) in dev and Cognito in prod.
5. **E2E in CI runs against that Compose stack** with the seed loaded, signed in with a locally
   minted HS256 JWT for the seeded account (no Google, no Cognito): `core_api` verifies it with
   the stack's `SECRET_KEY`, so the tests exercise the real API and the real proxy.

Rejected: **product-level demo trips copied to every new account** (an `is_demo` flag, copied
on first sign-in). It would put demo content into every real account, need a flag on the trip
table and a copy step in the sign-in path, and still need a loader for the copies. Seeding an
account on request gives the same demo without touching sign-in; revisit if onboarding needs it.

## Consequences

- Good: one source of truth for demo content, validated by the same code as a request; a
  demo account in any environment is one command away; the dashboard shows what the API holds.
- Good: the static export stays a plain set of files; no per-environment routing tricks.
- Bad: `/trip/?id=` is a less pretty URL than `/trip/<id>/`; the query string is the price of
  serving one static page for every trip.
- Bad: the frontend cannot render a trip without the API; storybook-style previews need a fake
  service, not a fixture.
- What happened (TRA-129, TRA-130): the dashboard reads `GET /api/v1/trips/` through `useTrips`
  and the viewer reads `GET /api/v1/trips/{id}` through `useTrip` at `/trip/?id=<uuid>`, one
  static shell (`app/(app)/trip/page.tsx` with a `Suspense` boundary around the client page, which
  `useSearchParams` requires on a static export). `src/frontend/src/mocks/` is gone; the Japan
  trip survives only as the test fixture `src/test/fixtures/trip-japan.ts`. The `toTrip` /
  `toTripSummary` mappers did not change: the components never saw anything but the view model.
  A 403 (someone else's trip) renders the same not-found page as a 404, on purpose. The route
  guard keeps the query string in its `redirect` parameter so a signed-out deep link comes back
  to the same trip.
- Revisit: the seed ships with the image and runs in-process on Lambda (`/events`); if the data
  grows beyond a few trips, move it out of the package and stream it. When new accounts should
  start with content, reconsider the copy-on-sign-in alternative with the data now in place.
