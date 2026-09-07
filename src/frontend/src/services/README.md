# API Services (`/services`)

Every network call lives here. UI components (`/app`, `/components`) never call `fetch`; they call
a service function, which keeps URLs, auth headers and error handling in one place and makes
components trivial to mock in tests.

| File | Talks to | Exports |
|---|---|---|
| `http.ts` | — | `request<T>(service, path, options)` / `requestRaw(...)` (the one `fetch` wrapper: JSON body, optional bearer token, non-2xx → `ApiError { status, code }`, 401 → `UnauthorizedError extends ApiError`), `apiUrl`, `authHeaders`, `parseErrorBody`, `readErrorMessage`, `isApiAvailable`, `isAiAvailable` |
| `session.ts` | `localStorage` | The only owner of the persisted session: `readSession`, `readToken`, `writeSession`, `clearSession`, `pruneInvalidSession`, plus `subscribe`/`getSnapshot` for `useSyncExternalStore` |
| `auth.ts` | `core_api` | `loginWithGoogle(credential)` (API vs static mode, writes the session, throws on an invalid credential), `verifyGoogleToken(credential)` |
| `chat.ts` | `ai_api` | `streamChat(message, history, { signal })` — async generator over SSE, cancellable with an `AbortSignal`; `parseSseEvents(buffer)` — the pure SSE line parser it is built on |
| `trips.ts` | fixtures in `src/mocks/*.ts` (backend shape) until the API serves trips | `getTripById`, `getTripSummaries`, `getAllTripIds`, and the mappers `toTrip` / `toTripSummary` (`TripResponse` → view model, [ADR 0006](../../../../docs/architecture/adr/0006-frontend-trip-view-model.md)) |

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
