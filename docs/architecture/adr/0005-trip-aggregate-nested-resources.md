# 0005 — `Trip` is the aggregate root; child resources are nested and declarative

**Status:** Accepted
**Date:** 2026-09-07

## Context

`core_api` exposed destinations, itinerary days, activities, meals, accommodations and
transportations as six top-level collections (`/destinations/`, `/meals/`, ...). Every handler
required a bearer token and then ignored the caller: `GET /meals/` listed every user's meals,
`POST /accommodations/?trip_id=...` accepted any trip id, and `PATCH`/`DELETE` by id worked on
anyone's rows. `GET /users/{id}` returned any account's email. Only `TripService.get_owned`
enforced the invariant the whole product rests on: a trip is private to its owner.

The six endpoint modules, six service classes and six repository classes were byte-for-byte
copies apart from identifiers, and every `XUpdate` schema restated `XBase` with optional fields.

## Decision

1. **`Trip` is the aggregate root.** Child collections are reached only through the owner's trip:
   `/trips/{trip_id}/destinations/`, `/trips/{trip_id}/itinerary-days/`, `/trips/{trip_id}/accommodations/`,
   `/trips/{trip_id}/transportations/`, and, for the two entities that belong to a day,
   `/trips/{trip_id}/itinerary-days/{itinerary_day_id}/activities/` and `.../meals/`.
   Authorisation happens once, in the `get_owned_trip` / `get_owned_itinerary_day` dependencies
   (`api/deps.py`). Another user's trip answers **403**; a child that exists but not under the
   requested parent answers **404** (`BaseService.get_in`), so ids reveal nothing.
2. **One declarative router for all children.** `api/v1/resources.py` holds a `CHILD_RESOURCES`
   tuple of `ChildResource` descriptors (path, schemas, service, parent dependency, parent field);
   `child_router()` builds the five endpoints. Adding a child entity is a model, a schema module
   and one descriptor. Entities without custom rules use `BaseService`/`BaseRepository` directly
   through `provide(BaseService, Model)`; only `Trip` and `User` keep dedicated classes.
3. **`PATCH` for partial updates**, with the body derived from the base schema:
   `XUpdate = partial(XBase, "XUpdate")` (`schemas/_partial.py`). `PUT` is gone.
4. **Pagination is a value**: `Page(skip, limit)` in `core_api/pagination.py`, injected through
   `page_params`; repositories accept it plus column filters (`list(page, trip_id=...)`).
5. **Profiles are private**: `GET /users/{id}` and `GET /users/` are admin-only; `/users/me`
   serves the caller. `PATCH`/`DELETE /users/{id}` remain owner-only.

## Consequences

- Positive: the ownership gap tracked since ADR 0001 is closed and covered by parametrised tests
  for all six children (scoped listing, foreign trip, wrong parent, cascade delete). ~600 lines
  of copied code removed; a new child entity no longer means a new endpoint module. The API reads
  as the domain does: a trip contains its plan.
- Negative / breaking: every child URL changed and `PUT` became `PATCH`. The frontend still
  serves mock trips, so no client broke; `docs/api/core-api.openapi.json` and the generated
  TypeScript types were regenerated in the same change. Activities and meals sit three levels
  deep; if that proves awkward for clients, a read-only flat view can be added without touching
  authorisation.
- Follow-up (done in the next change): the repository no longer commits per operation — a
  request-scoped unit of work does — and the ORM models moved to the SQLAlchemy 2 typed style with
  shared mixins and entity-level `check_invariants()`. See `docs/architecture/code-quality-review.md`.
