# Integration: Cross-Module Wiring

## Purpose

Documents the functional requirements and business rules for wiring all backend modules into the NestJS root module graph and upgrading the `WorkshopNotificationPublisher` from a log-only adapter to a BullMQ event producer. This spec governs the final integration step (W7) that connects the independent worktrees W1-W6 into a running system.

## Source

W7 Cross-Module Integration from `docs/guides/parallel-implementation-plan.md` (Section 9).

---

## ADDED: Functional Requirements (FR)

### FR-1: AppModule registers all backend modules

**Priority:** MUST
**Classification:** FULLY AUTOMATED

The root `AppModule` MUST import and register all six feature and infrastructure modules in the correct dependency order. The imports array MUST contain, in order:
1. `DatabaseModule` (existing)
2. `RedisModule` (existing)
3. `StorageModule.forRoot(...)` (existing)
4. `SharedQueueModule` (NEW -- BullMQ infrastructure)
5. `IamModule` (existing)
6. `CatalogModule` (existing)
7. `BookingModule` (NEW)
8. `CheckinModule` (NEW)
9. `BackgroundModule` (NEW -- MUST be last)

#### Scenario: All modules initialize on startup

- **Given** `REDIS_URL` and `DATABASE_URL` environment variables are set
- **When** NestJS application boots via `NestFactory.create(AppModule)`
- **Then** All modules in the imports array initialize without circular dependency or missing provider errors

#### Scenario: BackgroundModule is last in imports

- **Given** The `AppModule` imports array
- **When** Inspected programmatically or via code review
- **Then** `BackgroundModule` appears after `CheckinModule` and is the last module in the array

### FR-2: BookingModule exports SeatLockMechanic

**Priority:** MUST
**Classification:** FULLY AUTOMATED

`BookingModule` MUST export `SeatLockMechanic` from its `exports` array so that `BackgroundModule` (specifically `PaymentTimeoutCron` and `ReconciliationCron`) can access seat lock operations without importing `BookingModule`'s providers.

#### Scenario: SeatLockMechanic is resolvable from BackgroundModule

- **Given** `BackgroundModule` imports `BookingModule`
- **When** `BackgroundModule` injects `SeatLockMechanic` in any of its providers
- **Then** NestJS resolves the dependency without errors

### FR-3: CatalogModule imports SharedQueueModule for BullMQ injection

**Priority:** MUST
**Classification:** FULLY AUTOMATED

`CatalogModule` MUST import `SharedQueueModule` so that its `WorkshopNotificationPublisher` can use the `@InjectQueue(NOTIFICATION_QUEUE)` decorator. `CatalogModule` MUST also export `WorkshopNotificationPublisher` so that it is available for cross-module access if needed.

#### Scenario: WorkshopNotificationPublisher resolves NOTIFICATION_QUEUE

- **Given** `CatalogModule` imports `SharedQueueModule`
- **When** `WorkshopNotificationPublisher` constructor injects `@InjectQueue(NOTIFICATION_QUEUE)`
- **Then** BullMQ resolves the queue without errors

### FR-4: WorkshopNotificationPublisher enqueues BullMQ jobs

**Priority:** MUST
**Classification:** SEMI-AUTOMATED

The `WorkshopNotificationPublisher.publishCancelled()` and `publishEmergencyUpdate()` methods MUST push events to the `NOTIFICATION_QUEUE` BullMQ queue instead of (or as a fallback from) logging. Both methods MUST become async (`Promise<void>`). On BullMQ failure, the methods MUST fall back to logging to avoid crashing the caller.

#### Scenario: publishCancelled enqueues workshop.cancelled job

- **Given** A published workshop exists in the database
- **When** `WorkshopNotificationPublisher.publishCancelled(workshop)` is called
- **Then** A BullMQ job with name `'workshop.cancelled'` is added to the notification queue
- **And** The job data matches the `WorkshopCancelledEventData` interface (workshopId, title, cancelledAt)

#### Scenario: publishCancelled falls back to log on BullMQ failure

- **Given** Redis is unavailable or BullMQ throws an error
- **When** `WorkshopNotificationPublisher.publishCancelled(workshop)` is called
- **Then** The error is caught
- **And** A log message is written indicating the failure
- **And** The calling service does not crash or receive a rejected promise

#### Scenario: publishEmergencyUpdate enqueues workshop.emergency-update job

- **Given** A published workshop exists with changed schedule fields
- **When** `WorkshopNotificationPublisher.publishEmergencyUpdate(workshop, changes)` is called
- **Then** A BullMQ job with name `'workshop.emergency-update'` is added to the notification queue
- **And** The job data matches the `WorkshopUpdatedEventData` interface

### FR-5: BackgroundModule imports CatalogModule

**Priority:** MUST
**Classification:** FULLY AUTOMATED

`BackgroundModule` MUST import `CatalogModule` so its `AiSummaryService` can access `AiSummariesRepository` (defined in CatalogModule) for cross-module document processing.

#### Scenario: BackgroundModule resolves CatalogModule providers

- **Given** `BackgroundModule` imports `CatalogModule`
- **When** NestJS resolves `BackgroundModule`'s dependency graph
- **Then** No missing provider errors occur for CatalogModule-originating providers

---

## ADDED: Business Rules (BR)

### BR-1: One-way dependency from BackgroundModule to BookingModule

`BookingModule` MUST NEVER import `BackgroundModule`. The dependency graph flows one direction: `AppModule -> BackgroundModule -> BookingModule`. Violating this creates a circular dependency that NestJS cannot resolve.

### BR-2: Queue injection goes through SharedQueueModule only

Any module that needs `@InjectQueue()` MUST import `SharedQueueModule` explicitly. No module should import another feature module solely for queue access. This keeps the queue infrastructure decoupled from feature modules.

### BR-3: WorkshopNotificationPublisher is fire-and-forget

The `WorkshopNotificationPublisher` methods MUST NOT throw errors to their callers. If BullMQ enqueueing fails, the publisher falls back to logging. This ensures that workshop cancellation and update operations are never blocked by notification infrastructure failures.
