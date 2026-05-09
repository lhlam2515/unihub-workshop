## 1. Fix useSync all-workshop sync path

- [x] 1.1 In `use-sync.ts`, change the PENDING filter: when `workshopId === ""`, skip the `workshopId` filter so all PENDING records are included in the batch
- [x] 1.2 Expose `queueItems` (the raw records array) from `useSync` return value so the queue screen can render the list without a second SQLite query
- [x] 1.3 Update `UseSyncResult` type in `lib/types.ts` to include `queueItems: CheckinQueueRecord[]`

## 2. Render queue item list in queue.tsx

- [x] 2.1 In `queue.tsx`, destructure `queueItems` from `useSync()` and render a `FlatList` (or `ScrollView` with map) of `QueueItemRow` components ordered by `checkedInAt DESC`
- [x] 2.2 Add an empty-state message when `queueItems.length === 0`
- [x] 2.3 Remove the raw `createDatabaseClient()` call in the sync button's `onPress` — read `deviceId` via a separate synchronous helper or pass it from the hook
