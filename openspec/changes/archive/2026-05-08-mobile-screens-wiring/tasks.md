## 1. Bug Fix — Login Client Token Field Names

- [x] 1.1 In `apps/mobile/src/lib/api/client/index.ts`, update `login()` type cast from `{ accessToken; refreshToken }` to `{ access_token; refresh_token }` and update `tokenStore.setTokens()` call accordingly

## 2. Auth Feature — Service and Screen

- [x] 2.1 Create `apps/mobile/src/features/auth/api/auth.service.ts` — wraps `login()` in `Result.fromPromise()`, returns `Result<LoginResponseDto>`
- [x] 2.2 Rewrite `apps/mobile/src/app/login.tsx` — real email/password form with TextInput, submit button, loading state, inline error display; calls `authService.login()` on submit; navigates to `/(tabs)` on success

## 3. Auth Guard — Root Redirect

- [x] 3.1 Update `apps/mobile/src/app/index.tsx` — after `tokenStore.init()` completes (already in `_layout.tsx`), call `offlineAuth.isTokenValidLocally()`; redirect to `/(tabs)` if valid, else `/login`

## 4. Workshop List — Home Screen

- [x] 4.1 Create `apps/mobile/src/features/workshops/api/workshops.service.ts` — wraps `GET /workshops/:id` via `api.get()` in `Result.fromPromise()`; exposes `getWorkshopById(id)` and `getWorkshopsByIds(ids: string[])`
- [x] 4.2 Rewrite `apps/mobile/src/app/(tabs)/index.tsx` — call `offlineAuth.getAllowedWorkshops()` for IDs, fetch each via `workshopsService.getWorkshopsByIds()`, render real workshop cards with loading/error/empty states; wire `usePreload` on workshop tap

## 5. Workshop Dashboard — Real Stats

- [x] 5.1 Create `apps/mobile/src/features/workshops/api/checkin-status.service.ts` — wraps `GET /checkin/workshops/:id/status` in `Result.fromPromise()`
- [x] 5.2 Rewrite `apps/mobile/src/app/workshop/[id]/index.tsx` — replace hardcoded stats with real data from `checkinStatusService.getStatus(id)`; add navigation link to `/workshop/:id/history`; show loading/error states

## 6. QR Scanner — Camera Integration

- [x] 6.1 Rewrite `apps/mobile/src/app/workshop/[id]/scan.tsx` — use `expo-camera` `CameraView` with `onBarcodeScanned` callback; handle permission grant/deny; debounce scans (2s window); wire `useScan(qrToken, workshopId)` on detection; remove simulated scan button

## 7. Check-in History — New Screen

- [x] 7.1 Create `apps/mobile/src/app/workshop/[id]/history.tsx` — query `checkinQueue` SQLite table filtered by `workshopId`, ordered by `checkedInAt` DESC; render list with student name, time, and `syncStatus` badge; handle empty state

## 8. Profile Screen — Real User Info and Logout

- [x] 8.1 Rewrite `apps/mobile/src/app/(tabs)/profile.tsx` — call `offlineAuth.getTokenPayload()` for name/role/email display; implement logout button calling `logout()` from API client then `router.replace('/login')`
