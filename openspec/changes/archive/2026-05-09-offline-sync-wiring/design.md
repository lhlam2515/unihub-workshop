## Context

`queue.tsx` (SCR-M06) exists and has the `useSync` hook wired, but renders only summary counts — not the actual queue records. Staff cannot see which students are pending or conflicted. Additionally, `useSync.sync()` filters PENDING records by `workshopId`, but `queue.tsx` passes `""`, which means the filter (`r.workshopId === ""`) never matches and the sync button does nothing.

All other infrastructure is in place: `checkinQueue` SQLite schema, `QueueItemRow` component, `checkinApi.syncOffline`, `SyncProgressSteps`, and `deviceConfig` singleton initialization in `_layout.tsx`.

## Goals / Non-Goals

**Goals:**
- Render the full checkin queue item list in `queue.tsx` using `QueueItemRow`
- Fix `useSync` so an empty `workshopId` syncs all PENDING records across all workshops
- Load queue items reactively alongside stats (single query, shared state)

**Non-Goals:**
- Pagination or virtual list (queue is bounded by a single event — typically < 500 records)
- Per-item retry UI (conflicts are resolved on the web portal)
- Any backend changes

## Decisions

**Decision 1: Empty workshopId = "sync all" sentinel**

`useSync.sync(workshopId, deviceId)` currently filters `pending.filter(r => r.workshopId === workshopId)`. When `workshopId === ""`, this silently returns nothing. The fix: treat `""` as "no filter" — sync all PENDING records. The `SyncProgressScreen` (SCR-M07) already passes a real `workshopId` when navigated from a workshop dashboard, so the per-workshop path stays intact.

Alternatives considered: separate `syncAll()` method — rejected, adds API surface for a trivial conditional.

**Decision 2: Render queue items in same `useSync` hook state**

Rather than adding a separate `useQueueItems` hook, extend `useSync` to also expose the raw queue records array. Stats and items are derived from the same `db.select().from(checkinQueue)` call, so no extra query is needed.

Alternatives considered: dedicated `useQueueItems` hook — rejected, would require two hooks on the same screen sharing a SQLite read.

**Decision 3: No grouping by workshop in the list**

`queue.tsx` is a global tab (not scoped to a workshop), so all pending records across workshops are shown together, ordered by `checkedInAt DESC`. Workshop name is not shown per row (no catalog API call from this screen).

## Risks / Trade-offs

- [Risk] Queue list grows unbounded if staff never syncs → Mitigation: show count prominently; "sync all" button is always visible when pending > 0. Purging old SYNCED records is out of scope for this change.
- [Trade-off] Extending `useSync` return type adds fields — callers that destructure `{ stats, sync, runStatus }` are unaffected by the new `queueItems` field.
