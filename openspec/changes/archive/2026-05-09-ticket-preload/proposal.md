## Why

The offline QR scan fallback path silently fails for every scan because `cached_registrations` is always empty — the pre-load hook (`usePreload`) and service (`ticketsApi.preload`) are fully implemented but never wired into the workshop dashboard screen. Staff have no way to trigger a pre-load before going offline.

## What Changes

- Add a "Tải danh sách vé" (Pre-load) button to the workshop dashboard screen
- Disable the "Mở máy quét QR" button when offline AND cache is not fully loaded, with a tooltip
- Refresh `localCache` state after a successful pre-load so the `CacheStatusBadge` updates live
- Remove the redundant "Quay về hàng đợi" button (tab bar already provides navigation)

## Capabilities

### New Capabilities
- `ticket-preload-ui`: Workshop dashboard pre-load button, scanner gate, and live cache status refresh

### Modified Capabilities
- `checkin-preload`: Dashboard wiring now satisfies the mobile pre-load requirement already in spec

## Impact

- `apps/mobile/src/app/workshop/[id]/index.tsx` — only file changed
- No new dependencies, no API changes, no schema changes
- Server endpoint `GET /checkin/workshops/:id/registrations` already exists
