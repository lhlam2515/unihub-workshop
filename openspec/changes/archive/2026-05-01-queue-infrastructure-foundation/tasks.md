# Tasks: Queue Infrastructure Foundation

## Task Group 1: Queue Constants & Contracts (2 tasks)

### T1.1: Create `queue.constants.ts` ✅

**File:** `src/shared/queues/queue.constants.ts`

Define:
- `NOTIFICATION_QUEUE`, `AI_SUMMARY_QUEUE`, `STUDENT_SYNC_QUEUE` string constants
- `ALL_QUEUES` readonly tuple for bulk registration
- `DEFAULT_JOB_OPTIONS` with `removeOnComplete: { age: 3600 }` and `removeOnFail: { age: 86400 }`

**Verification:** File compiles, imports are valid, values match expected strings.

### T1.2: Create `event-contracts.ts` ✅

**File:** `src/shared/queues/event-contracts.ts`

Define TypeScript interfaces:
- `NotificationJobData` — references `notificationTypeEnum` and `notificationChannelEnum` from DB schema
- `AiSummaryJobData` — documentId, workshopId, fileUrl
- `StudentSyncJobData` — jobId, sourceFileName
- `PaymentEventData` — references `paymentGatewayEnum` from DB schema
- `WorkshopCancelledEventData` — workshopId, title, cancelledAt
- `WorkshopUpdatedEventData` — workshopId, changes (roomChanged, scheduleChanged)

**Verification:** `pnpm check-types` passes.

## Task Group 2: SharedQueueModule (2 tasks)

### T2.1: Create `queue.module.ts` ✅

**File:** `src/shared/queues/queue.module.ts`

Implement `SharedQueueModule`:
- `BullModule.forRootAsync` with factory reading `REDIS_URL` and applying `DEFAULT_JOB_OPTIONS`
- `BullModule.registerQueue` for all 3 queues using the constants
- Export `BullModule` so consuming modules can use `@InjectQueue()`

**Verification:** Module compiles, exports are correct.

### T2.2: Create `index.ts` ✅

**File:** `src/shared/queues/index.ts`

Barrel re-export of all public symbols:
- Queue constants
- Event contract interfaces
- `SharedQueueModule`

**Verification:** Imports work correctly from `@/shared/queues`.

## Task Group 3: BackgroundModule Wiring (1 task)

### T3.1: Update `background.module.ts` ✅

**File:** `src/modules/background/background.module.ts`

Changes:
- Add `SharedQueueModule` to the `imports` array
- Remove stale TODO comments about queue library setup (lines referencing Bull/BullMQ/EventEmitter2)
- Keep the `ScheduleModule.forRoot()` import

**Verification:** `pnpm check-types` passes, no circular dependencies.

## Build Verification

After all tasks complete:
- [x] `pnpm check-types` passes
- [x] `pnpm lint` passes (no new errors introduced)
- [x] `pnpm build` passes
