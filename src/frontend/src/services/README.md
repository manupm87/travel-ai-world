# API Services (`/services`)

Every network call lives here. UI components (`/app`, `/components`) never call `fetch`; they call
a service function, which keeps URLs, auth headers and error handling in one place and makes
components trivial to mock in tests.

| File | Talks to | Exports |
|---|---|---|
| `http.ts` | — | `request<T>(service, path, options)` / `requestRaw(...)` (the one `fetch` wrapper: JSON body, optional bearer token refreshed first when about to expire, non-2xx → `ApiError { status, code }`, 401 → `UnauthorizedError extends ApiError`), `apiUrl`, `authHeaders`, `parseErrorBody`, `readErrorMessage`, `isApiAvailable`, `isAiAvailable` |
| `session.ts` | `localStorage` | The only owner of the persisted session (token, profile, refresh token): `readSession`, `readToken`, `readRefreshToken`, `writeSession`, `writeToken`, `clearSession`, `pruneInvalidSession`, `userFromIdToken`, `tokenExpiresWithin`, plus `subscribe`/`getSnapshot` for `useSyncExternalStore` |
| `cognito.ts` | the Cognito user pool (`NEXT_PUBLIC_COGNITO_DOMAIN`) | The deployed sign-in, no SDK: `startCognitoLogin(redirect)` (code + PKCE, leaves for the managed login), `completeCognitoLogin(params)` (on `/auth/callback/`: state check, code exchange, writes the session), `ensureFreshToken` / `refreshCognitoSession` (refresh-token grant, single-flight), `logoutFromCognito`, `isCognitoAvailable`, and the pure `buildAuthorizeUrl` / `buildLogoutUrl` / `pkceChallenge` |
| `auth.ts` | `core_api` | The local Google flow: `loginWithGoogle(credential)` (API vs static mode, writes the session, throws on an invalid credential), `verifyGoogleToken(credential)` |
| `chat.ts` | `ai_api` | `streamChat(message, history, { signal })` — async generator over SSE, cancellable with an `AbortSignal`; `parseSseEvents(buffer)` — the pure SSE line parser it is built on |
| `planner.ts` | `ai_api` (`POST /api/v1/ai/planner`) | `streamPlannerTurn(turn, { signal })` — async generator of typed SSE v2 events (`text`, `brief`, `options`, `itinerary_patch`, `error`, `done`; TRA-142); `parsePlannerEvents(buffer)` / `toPlannerEvent(json)` — the tolerant parser (unknown types ignored, malformed lines skipped, legacy `{"content"}`/`{"error"}` mapped) |
| `plannerDraft.ts` | `sessionStorage` | The only owner of the planner's per-tab draft: `readPlannerDraft`, `writePlannerDraft`, `clearPlannerDraft` (versioned; a stale or unreadable draft reads as `null`) |
| `trips.ts` | `core_api` (`GET /api/v1/trips/` and `GET /api/v1/trips/{id}`, with the session token) | `listTrips({ signal })` (the signed-in user's summaries, `auth: true`, abortable), `getTrip(id, { signal })` (one trip as the viewer renders it; `null` on 404 and on 403 so another user's id is indistinguishable from a missing one; anything else rethrows), and the mappers `toTrip` / `toTripSummary` (`TripResponse` → view model, [ADR 0006](../../../../docs/architecture/adr/0006-frontend-trip-view-model.md)) |

`ApiError.code` carries the backend's `error_code`, so UI code can pick its own translated copy
(`t.planner.errorUnauthorized`, ...) instead of showing the server's message in the server's language.

Base URLs come from `NEXT_PUBLIC_API_URL` (core) and `NEXT_PUBLIC_AI_API_URL` (ai, defaults to
core). See [ADR 0003](../../../../docs/architecture/adr/0003-frontend-two-base-urls.md).

Request/response types are generated from the backend's OpenAPI documents into
`src/types/generated/` (`npm run types:generate`); import them as
`components["schemas"]["GoogleAuthResponse"]` instead of redeclaring shapes.

```typescript
// Good: the component calls a service
import { streamChat } from "@/services/chat";
for await (const chunk of streamChat(message, history)) { ... }

// Bad: the component fetches on its own
const res = await fetch("http://localhost:8001/api/v1/ai/chat", ...);
```
