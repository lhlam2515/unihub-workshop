## Context

`usePreload`, `ticketsApi.preload`, `cached_registrations` schema, and `cache_metadata` schema are all fully implemented. The workshop dashboard (`workshop/[id]/index.tsx`) reads `cacheMetadata` from SQLite but has no button to trigger a pre-load, no scanner gate based on cache state, and no live refresh after pre-load completes.

## Goals / Non-Goals

**Goals:**
- Wire `usePreload` into the dashboard screen
- Gate the scanner button: disabled when offline AND `isFullyLoaded !== 1`
- Refresh `localCache` state after pre-load so `CacheStatusBadge` updates without remount
- Remove the redundant "Quay về hàng đợi" button

**Non-Goals:**
- Auto-preload on screen mount (manual trigger only per spec)
- Network connectivity detection (NetInfo) — scanner gate uses cache state only
- Pagination progress UI — single loading state is sufficient for expected data sizes

## Decisions

**Single screen change only** — All pre-load logic already lives in `usePreload`. The dashboard just needs to call `preload(workshopId)` on button press and reload `localCache` from SQLite on completion. No new hooks, services, or components needed.

**Cache state as scanner gate** — Spec BR-M03.1 gates offline scanning on `is_fully_loaded=1`. Rather than integrating NetInfo, we disable the scanner button when `localCache` is null or `localCache.isFullyLoaded !== 1`. This is simpler and correct: if staff is online, the first scan attempt hits the server anyway.

**Reload `localCache` after preload** — Extract the cache read into a reusable `loadCacheMetadata()` function within the component and call it both on mount and after `preload()` resolves. Keeps the component self-contained.

## Risks / Trade-offs

- [Extra API call to get `serverTotal`] `use-preload.ts` makes an extra `ticketsApi.preload` call at the end just to read `pagination.total`. Low risk — small payload, happens after data is already saved.
- [Scanner always enabled online] If staff is online but cache is empty, scanner button is enabled (online scan path works). If they go offline mid-session without pre-loading, the fallback fails. Acceptable per spec.
