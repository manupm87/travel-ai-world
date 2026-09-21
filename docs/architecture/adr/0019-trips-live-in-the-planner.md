# 0019 — Trips live in the planner: one city, a derived phase, a read-only past

**Status:** Accepted (amended by [0020](0020-signed-in-home-is-the-trips-page.md))
**Date:** 2026-09-20

Supersedes, in part, [0005](0005-trip-aggregate-nested-resources.md) (§ destinations),
[0006](0006-frontend-trip-view-model.md) (§ `status`) and
[0011](0011-real-trips-seed-and-client-side-loading.md) (§ the seed, `/dashboard/`, `/trip/`).

## Context

The trip model predates the planner. `Trip` was the aggregate root of a multi-city itinerary:
a `destinations` table (city, country, coordinates, arrival and departure, nights), days that
pointed at a destination, and a stored `status` enum (`planning | planned | finished`) that a
client had to keep honest. Four demo trips were seeded per account (ADR 0011) to give the
dashboard and the viewer something to render, and the only thing `Grand European Tour: Paris,
Rome & Barcelona` still demonstrated was a shape the product no longer has.

Meanwhile the planner (ADR 0015, 0018) became the product: it plans **one city** at a time from
that city's corpus, and everything it offers is a card with an id, a photo and a licence. Saving
a plan flattened those cards into ordinary rows, so a saved trip could be read but never reopened
— the planner had no way to recover what it had proposed. The dashboard and the trip viewer were
a second, poorer rendering of the same data, reachable from a different page, with their own
components, their own tests and their own copy.

The owner's ask was the decision: *"The trips page makes no sense now that we have the planner.
Saved trips — past, ongoing or under construction — should be seen in the planner. Past and
ongoing ones read-only, the rest editable. We only support single-city itineraries, so drop the
test trips and only keep what makes sense for this app."*

## Decision

**One trip is one city.** `Trip` carries `city_slug` (the corpus name for the city, and therefore
the key that reopens the trip in the planner), `city`, `country`, `country_code`, the centre
(`lat`, `lng`), `origin` and `budget_tier`. The `destinations` table, its schema, its
`ChildResource` and `itinerary_days.destination_id` are gone. `PlannerCity` gains `country` and
`country_code` so the page never has to guess a country from a city name; they come from two new
mandatory keys in `cities/<slug>.toml`, through the cities manifest.

**The phase is derived, never stored.** `phase_of(start, end, today)` (next to the `Trip` entity)
answers `upcoming` when the dates are ahead or absent, `ongoing` while today falls inside them
(both boundary days included, an open end counting as unfinished) and `past` once the end date is
behind us. `TripResponse` exposes it as a computed field on the server's UTC date. `status` is
dropped, with its Postgres enum type: nobody writes a phase, and no client can disagree with it.

**Ongoing and past trips are read-only.** `Trip.ensure_editable()` raises `TripLocked`
(a `Conflict`, `TRIP_LOCKED`, 409) unless the phase is `upcoming`. `TripService.update` calls it,
and every child write resolves its parent through `get_editable_trip` /
`get_editable_itinerary_day` while reads keep the owned ones — the lock is the aggregate's, so it
covers days, activities, meals, accommodations and transportations without a single endpoint
knowing about it. `DELETE /trips/{id}` is never locked: removing a trip is not changing it.

**A saved trip can be reopened.** Activities, meals and accommodations keep `source_ref` (the
corpus document id, indexed), `part_of_day` and `card` — the planner's `OptionCard` exactly as the
client received it. `core_api` stores that JSON and hands it back untouched: it never imports
`ai_api` and never interprets the card beyond "an object". That is what lets `/plan/?trip=<uuid>`
rebuild an `ItineraryDraft` identical to the one that was saved.

**The planner is the only signed-in surface.** It lists the account's trips, opens one, renames
and deletes it. `/dashboard/` and `/trip/` become client redirects so old links keep working.
(Amended by [ADR 0020](0020-signed-in-home-is-the-trips-page.md): `/dashboard/` is the signed-in
home again — the ask and the trip cards — and the planner is where a trip is made and read.)

**The demo seed is retired.** `core_api/seed/`, the `seed` command (`ops.py`, `entrypoint.sh`,
`just seed`), the image-build check and the CI seed step are gone; `migrate` is the whole surface
`POST /events` exposes. `devtools.mint_token` creates the account when there is none, which is
what the seed used to do for it, so signing in without Google still works for a developer, the
Playwright MCP and CI. The stack e2e suite creates the trips it needs through the REST API.

### The migration

Revision `9d3400b9db7a` adds the columns nullable, moves the data, and only then makes the city
mandatory and takes the old structure away. Its data step, in order: delete the four demo trips by
title; delete every trip that does not have exactly one destination (with none there is no city to
give it, with several it is not this app's trip); copy the surviving trips' single destination into
`city`, `country`, `country_code`, `lat`, `lng` and a `city_slug` derived from the city name; fill
`part_of_day` from the wall-clock `time` each activity and meal already carried. It is plain SQL
(`op.execute`), so it does not import models that will move on, and it is safe on an empty database
— the shape it meets everywhere but production. The downgrade restores the structure only.

## Consequences

**Good.** One surface, one rendering, one set of components and tests: the dashboard, the trip
viewer and their fixtures go. The phase cannot drift from the dates, because there is nothing to
drift. A trip's card survives the round trip, so the planner is where a trip is born *and* where it
comes back. The country arrives with the city instead of a hand-written table in the frontend.

**Bad.** Deleting rows in a migration is not reversible: a multi-city trip that somebody had in a
development database is gone, and the downgrade brings back empty tables. The phase is computed on
the server's UTC date, so a traveller in UTC+13 sees a trip become `ongoing` a few hours late — an
acceptable error for a day-grained model, and one that would only go away by storing a timezone
with every trip.

**To revisit.** Save is still a snapshot (create, or update and recreate the children): a saved
trip is rewritten whole on every save. Continuous per-operation sync is the other half of TRA-146
and will need the children to be addressed individually. If multi-city ever returns, it returns as
a *journey* of single-city trips, not as a `destinations` table.
