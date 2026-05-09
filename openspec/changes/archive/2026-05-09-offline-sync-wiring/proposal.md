## Why

The offline queue screen (SCR-M06) shows summary stats but does not render the actual queue records, and the global sync from that screen passes an empty `workshopId` that causes the `useSync` hook to filter out all records. SCR-M07 (sync progress) is already wired, but SCR-M06 needs the item list rendered and the all-workshop sync path fixed so staff can review and trigger a full sync from the queue tab.

## What Changes

- **`app/(tabs)/queue.tsx`** — Render `QueueItemRow` list from `checkinQueue` SQLite table (all workshops); fix `sync()` call to pass `""` correctly as "sync all" intent (update `useSync` to treat empty workshopId as all-workshops sync)
- **`features/checkin/hooks/use-sync.ts`** — Fix the workshop filtering: when `workshopId` is `""`, sync all PENDING records regardless of workshop; when non-empty, filter to that workshop only
- **`features/checkin/hooks/use-sync.ts`** — Add `refresh()` to reload stats after returning from `SyncProgressScreen`

## Capabilities

### New Capabilities

_(none — all screens and hooks already scaffolded)_

### Modified Capabilities

- `qr-checkin-offline`: Queue screen now renders the full PENDING record list; all-workshop sync path in `useSync` corrected

## Impact

- Mobile app only — no backend changes
- `apps/mobile/src/app/(tabs)/queue.tsx` — render queue item list
- `apps/mobile/src/features/checkin/hooks/use-sync.ts` — fix workshopId filter logic
