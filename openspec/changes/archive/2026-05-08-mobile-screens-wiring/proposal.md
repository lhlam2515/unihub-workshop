## Why

The mobile app screens were scaffolded during the checkin-module change but left with hardcoded/simulated data because the backend APIs weren't ready. Now that all backend modules (IAM, checkin, catalog) are complete, the screens need to be wired to real data sources — hooks, services, and JWT-decoded payloads.

## What Changes

- **`app/login.tsx`** — Replace bypass button with real email/password form, call `login()` from the API client, navigate to tabs on success
- **`app/index.tsx`** — Add auth guard using `offlineAuth.isTokenValidLocally()` to redirect to tabs if already authenticated
- **`app/(tabs)/index.tsx`** — Replace hardcoded workshop array with `offlineAuth.getAllowedWorkshops()` from JWT, fetch workshop names via catalog API
- **`app/workshop/[id]/index.tsx`** — Replace hardcoded stats with real data from `GET /checkin/workshops/:id/status`, add link to history screen
- **`app/workshop/[id]/scan.tsx`** — Wire `useScan` hook with real camera integration (`expo-camera`), remove simulated scan
- **`app/workshop/[id]/history.tsx`** — **New file**: Check-in history screen (SCR-M05) reading from local `checkinQueue` SQLite table
- **`app/(tabs)/profile.tsx`** — Wire `offlineAuth.getTokenPayload()` for real user info, implement `logout()` with `tokenStore.clear()`
- **`lib/api/client/index.ts`** — Fix `login()` to use snake_case token field names (`access_token`/`refresh_token`) matching backend DTO
- **New features**: `features/auth/` service, `features/workshops/` service for workshop detail fetching

## Capabilities

### New Capabilities
- `mobile-auth-flow`: Login screen with real credentials, auth guard, token-based redirect on cold start
- `mobile-workshop-list`: Workshop list derived from JWT `allowed_workshop_ids` + catalog API enrichment
- `mobile-checkin-history`: Local check-in history screen reading from `checkinQueue` SQLite table

### Modified Capabilities
- `qr-checkin-offline`: Camera integration added to scan screen (was simulated); `useScan` hook now actually wired
- `qr-checkin-online`: Same scan screen change — online path also now exercised via real camera

## Impact

- **Mobile app only** — no backend changes
- `apps/mobile/src/app/` — 6 screens modified, 1 new screen created
- `apps/mobile/src/features/` — new `auth/` and `workshops/` feature modules
- `apps/mobile/src/lib/api/client/index.ts` — bug fix for token field names
- No new npm packages needed (expo-camera already in tech stack)
- No database schema changes
