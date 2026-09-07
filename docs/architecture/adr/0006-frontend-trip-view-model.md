# 0006 — The frontend renders a view model mapped from the backend contract

**Status:** Accepted
**Date:** 2026-09-07

## Context

The trip viewer rendered a hand-written `Trip` type (`src/frontend/src/types/trip.ts`): nested,
camelCase, with `status: string` and `localTips: string | string[]`. The backend contract is
`TripResponse` (flat, snake_case, generated from core_api's OpenAPI into
`src/types/generated/core-api.ts`). Nothing connected the two: `services/trips.ts` loaded JSON
fixtures and cast them with `as Trip`. One fixture did not even match the hand-written type (its
transport legs used `departure`/`arrival` where the components read `departureTime`/`arrivalTime`),
so a view rendered `undefined - undefined` and no check noticed. Business rules leaked into JSX
(`DayCard` decided a day was "free" by searching the title for "free day"/"día libre").

The frontend is a static export (`output: "export"`). `/trip/[id]` prerenders one page per fixture
id (`generateStaticParams` + `dynamicParams = false`); that cannot hold once trips are per user.

## Decision

1. **`Trip` is an explicit view model**, documented as such, and the only shape components see. It
   stays nested and camelCase because that is what the UI wants; its discriminants are typed from the
   contract (`status: TripStatus`), `localTips` is always an array, and derived facts live on it
   (`ItineraryDay.kind: "free" | "travel" | "regular"`).
2. **`services/trips.ts` owns the mapping**: `toTrip(dto: TripResponse): Trip` and
   `toTripSummary(dto): TripSummary` are the anti-corruption layer. Every optional field gets a safe
   default there; decimals (strings on the wire) become numbers there; day kinds are derived there.
   No `as` casts.
3. **Fixtures have the backend's shape.** `src/mocks/*.ts` export `TripResponse` objects checked with
   `satisfies`, so the compiler rejects any drift from the generated contract, enum values included.
   The separate `trips-list.json` is gone: dashboard summaries derive from the same fixtures.
4. **Data strategy for real trips (to implement when the dashboard reads the API):** keep one static
   shell for `/trip/[id]` and `/dashboard`, fetch on the client with the session token through the
   same `services/trips.ts` functions (`GET /api/v1/trips/`, `GET /api/v1/trips/{id}`), and render
   loading / not-found / error states in the client page. `generateStaticParams` then returns a single
   placeholder id and the components do not change, because they only ever see the view model.

## Consequences

- Positive: connecting the API is a change to two functions in one module; the fixtures cannot
  silently diverge from the contract (`tsc` fails); UI logic that depended on data shape
  (`Array.isArray`, string sniffing of titles, `"confirmed"` status) is gone or moved to the mapper,
  where it is unit-tested.
- Negative: the mapper is ~200 lines of deliberate boilerplate, and fixtures are TypeScript modules
  rather than JSON (they must be, for literal types to be checked).
- Open: `Activity.category` and `Accommodation.type` remain free strings on both sides; promote
  them to enums in core_api when the planner starts producing them. The client-side data strategy
  above is decided but not yet implemented (tracked in `docs/architecture/code-quality-review.md`).
