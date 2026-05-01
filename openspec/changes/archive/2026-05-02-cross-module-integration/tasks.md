# Tasks: Cross-Module Integration

Total tasks: 6 (Foundation: 1, Core: 4, Integration: 1)

---

## Foundation

### T-1: Create `specs/integration/spec.md` with delta spec

**Layer:** Foundation (specs)

Create the integration wiring spec at `openspec/specs/integration/spec.md` documenting all functional requirements and business rules for cross-module wiring.

**Preconditions:** None.

**Verification:** File exists with FR-1 through FR-4 and BR-1 through BR-3.

---

## Core

### T-2: Update AppModule imports array

**Status:** ✅ Done

**File:** `apps/server/src/app.module.ts`

Add four new imports to the `@Module({ imports: [...] })` array:

- `SharedQueueModule` from `@/shared/queues/queue.module` (after StorageModule, before IamModule)
- `BookingModule` from `./modules/booking/booking.module` (after CatalogModule)
- `CheckinModule` from `./modules/checkin/checkin.module` (after BookingModule)
- `BackgroundModule` from `./modules/background/background.module` (LAST in the array)

Also add the corresponding `import` statements at the top of the file.

**Depends on:** T-1

**Verification:** `pnpm check-types` passes. `pnpm dev:server` starts without DI errors.

---

### T-3: Update BookingModule exports

**Status:** ✅ Done

**File:** `apps/server/src/modules/booking/booking.module.ts`

Add `SeatLockMechanic` to the `exports` array:

```typescript
exports: [RegistrationsService, PaymentsService, SeatLockMechanic],
```

**Depends on:** T-2 (needs AppModule to test the full graph)

**Verification:** `pnpm check-types` passes. BackgroundModule can inject `SeatLockMechanic`.

---

### T-4: Update CatalogModule imports and exports

**Status:** ✅ Done

**File:** `apps/server/src/modules/catalog/catalog.module.ts`

Two changes:

1. Add `SharedQueueModule` to `imports` array (after RedisModule) -- enables `@InjectQueue(NOTIFICATION_QUEUE)` decorator.
2. Add `WorkshopNotificationPublisher` to `exports` array:

```typescript
exports: [WorkshopsService, SeatCounterService, WorkshopNotificationPublisher],
```

Also add the import: `import { SharedQueueModule } from "@/shared/queues/queue.module";`

**Depends on:** T-2

**Verification:** `pnpm check-types` passes. `pnpm dev:server` starts without errors.

---

### T-5: Upgrade WorkshopNotificationPublisher to use BullMQ

**Status:** ✅ Done

**File:** `apps/server/src/modules/catalog/services/workshop-notification-publisher.service.ts`

Changes:

1. Add imports: `@InjectQueue` from `@nestjs/bullmq`, `NOTIFICATION_QUEUE` and `WorkshopCancelledEventData` / `WorkshopUpdatedEventData` from `@/shared/queues`.
2. Inject the queue via constructor: `@InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue`
3. Add `import { Queue } from "bullmq";`
4. Change both methods from `void` to `Promise<void>`.
5. Replace the `this.logger.log(...)` calls with `this.notificationQueue.add(...)` calls wrapped in try-catch, falling back to log on failure.
6. Update the event structures to match `WorkshopCancelledEventData` and `WorkshopUpdatedEventData` from `event-contracts.ts` (use `cancelledAt: string` instead of `Date`, etc.).

Pattern for each method:

```typescript
async publishCancelled(workshop: Workshop): Promise<void> {
  const event: WorkshopCancelledEventData = {
    workshopId: workshop.workshopId,
    title: workshop.title,
    cancelledAt: new Date().toISOString(),
  };

  try {
    await this.notificationQueue.add('workshop.cancelled', event);
  } catch (error) {
    this.logger.error(`[WORKSHOP_CANCELLED] Failed to enqueue: ${(error as Error).message}`);
    // Fallback: log locally so event is not completely lost
    this.logger.log(`[WORKSHOP_CANCELLED] Workshop "${event.title}" (${event.workshopId})`);
  }
}
```

**Depends on:** T-4 (CatalogModule must import SharedQueueModule for DI resolution)

**Verification:** `pnpm check-types` passes. On workshop cancel, Redis shows a BullMQ job in the notification queue.

---

### T-6: Update BackgroundModule imports

**Status:** ✅ Done

**File:** `apps/server/src/modules/background/background.module.ts`

Add `CatalogModule` to the `imports` array:

```typescript
imports: [ScheduleModule.forRoot(), SharedQueueModule, BookingModule, CatalogModule],
```

Also add the import: `import { CatalogModule } from "../catalog/catalog.module";`

Add `CatalogModule` to the `imports` array:

```typescript
imports: [ScheduleModule.forRoot(), SharedQueueModule, BookingModule, CatalogModule],
```

Also add the import: `import { CatalogModule } from "../catalog/catalog.module";`

**Rationale:** BackgroundModule's `AiSummaryService` needs cross-module access to `AiSummariesRepository` (defined in CatalogModule). Per architecture rules, module-to-module access goes through the imports array.

**Depends on:** T-2 (needs AppModule wiring), T-4 (CatalogModule exports must be verified)

**Verification:** `pnpm check-types` passes. `pnpm dev:server` starts without errors.

---

## Integration Verification

### Verification Checklist (run after all tasks)

1. `pnpm check-types` -- zero errors
2. `pnpm lint --filter=server` -- zero errors
3. `pnpm dev:server` -- server starts, no `Nest can't resolve dependencies` or circular dependency errors
4. BullMQ queues initialize: `redis-cli KEYS "bull:*"` returns keys for notification, ai-summary, student-sync queues
5. Trigger a workshop cancel via admin API -> verify BullMQ job enqueued in notification queue via Redis
6. Walk through registration -> payment -> webhook -> ticket creation flow manually or via e2e test
