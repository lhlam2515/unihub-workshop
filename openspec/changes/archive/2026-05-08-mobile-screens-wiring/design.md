## Context

The mobile app is an offline-first check-in tool used exclusively by `CHECKIN_STAFF`. All infrastructure layers are complete: SQLite schemas, API client with token store, offline auth utilities, `useScan`/`usePreload`/`useSync` hooks, and checkin/ticket services. The gap is that screen files still contain hardcoded data from the scaffolding phase — the hooks exist but are never called.

The backend `POST /auth/login` response uses snake_case field names (`access_token`, `refresh_token`) but the `login()` client function reads camelCase (`accessToken`, `refreshToken`), so tokens are never stored on login. This is a blocking bug that must be fixed before any auth work.

## Goals / Non-Goals

**Goals:**
- Fix the `login()` client bug (snake_case field names)
- Wire all 7 mobile screens to real data (hooks, services, JWT payload)
- Create the missing history screen (`SCR-M05`)
- Add auth guard at the root redirect so staff don't re-authenticate each shift

**Non-Goals:**
- No backend changes — all endpoints already exist
- No new npm packages — expo-camera is already in the tech stack
- No redesign of existing UI — only replace mock data with real data
- No changes to SQLite schema or migrations

## Decisions

### D1: Workshop list data source — JWT + catalog API (not SQLite inference)

The home screen needs to show assigned workshops with names and statuses. `allowed_workshop_ids` in the JWT gives us the IDs. Two options:
- **Option A**: Call `GET /workshops/:id` per workshop ID to get name/status
- **Option B**: Derive workshop info from SQLite `cachedTickets` grouped by `workshopId`

**Decision: Option A (catalog API)**. Option B only works after preload, failing on first launch before any cache exists. A single `Promise.all` over the allowed IDs is cheap (2-3 workshops typical for staff), and the catalog endpoint is public-accessible with a valid JWT.

### D2: Auth guard placement — root `index.tsx` redirect

On cold start, `_layout.tsx` calls `tokenStore.init()` (already implemented). After init, `offlineAuth.isTokenValidLocally()` can check the JWT `exp` without a network call. The root `index.tsx` (currently always redirects to `/login`) should check this and redirect to `/(tabs)` if the token is still valid.

This keeps the guard local to the entry point — no need for a context provider or navigation middleware.

### D3: Token field name fix — snake_case in `login()` client

The `login()` function in `client/index.ts` casts the response with camelCase fields. The backend DTO (`LoginResponseDto`) uses `access_token` and `refresh_token`. Fix: update the type cast and property reads to `access_token`/`refresh_token`.

### D4: New feature modules — `features/auth/` and `features/workshops/`

Following FSD pattern, wrap API calls in Result-returning service classes:
- `features/auth/api/auth.service.ts` — wraps `login()` in `Result.fromPromise()`
- `features/workshops/api/workshops.service.ts` — wraps `GET /workshops/:id` for list enrichment

Login screen uses `authService`, home screen uses `workshopsService`. Hooks stay in checkin feature as-is.

### D5: History screen — read from SQLite `checkinQueue` directly

The history screen (`workshop/[id]/history.tsx`) shows check-in records for a specific workshop. These are local SQLite records. No new hook needed — use Drizzle query directly in the screen with `useLiveQuery` or a `useEffect`-based fetch from `checkinQueue` filtered by `workshopId` and ordered by `checkedInAt` desc.

## Risks / Trade-offs

- **Catalog API latency on home screen**: Calling N workshop detail endpoints in parallel adds ~200-500ms on first load. Mitigation: show a loading skeleton; the list is typically 1-3 workshops.
- **Token expiry edge case during shift**: The 8-hour AT window covers a full shift, but if a token expires mid-shift the auth guard will block. Mitigation: the `auth-session.ts` auto-refresh on 401 handles this transparently for online scans; offline scans show an appropriate error.
- **expo-camera permissions**: Camera permission prompt must be handled in the scan screen. If denied, show a fallback message. Already exists as a concern in the expo-camera API.
