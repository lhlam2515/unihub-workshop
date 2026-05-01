# Cross-Module Integration

## Problem Statement

The UniHub backend is built as a modular monolith with six bounded contexts (IAM, Catalog, Booking, Checkin, Background, and shared infrastructure). However, the root `AppModule` currently only imports `DatabaseModule`, `RedisModule`, `StorageModule`, `IamModule`, and `CatalogModule`. The `BookingModule`, `CheckinModule`, `BackgroundModule`, and `SharedQueueModule` are fully implemented but disconnected from the NestJS module graph. This means:

- Registration, payment, check-in, and background cron jobs are never started at boot.
- BullMQ queue infrastructure (SharedQueueModule) is never initialized -- no Redis-based queues, no workers.
- The Catalog module's `WorkshopNotificationPublisher` only logs events instead of pushing them to BullMQ, so workshop cancellations and emergency updates generate no notifications.
- The Background module needs access to `CatalogModule` (for `AiSummariesRepository` cross-module access) and `BookingModule` (for `PaymentsService.expirePayment()` and `SeatLockMechanic`).

Without wiring these modules together, the system cannot complete any end-to-end flow: register -> pay -> webhook -> ticket -> check-in -> notification.

## Proposed Solution

Wire all remaining backend modules into `AppModule` and fix inter-module dependency gaps across four module files. The change upgrades `WorkshopNotificationPublisher` from a log-only adapter to a real BullMQ producer, imports and exports the correct services/mechanics in each module, and ensures the NestJS dependency graph compiles without circular dependencies. `BackgroundModule` stays last in the imports array per the pre-established architecture invariant.

## Alternatives Considered

1. **Lazy-load modules via NestJS forward references**: Would work but introduces unnecessary complexity. The current module graph is acyclic when `BackgroundModule` is last and `BookingModule` never imports `BackgroundModule`, so forward references are not needed.

2. **Mark SharedQueueModule as @Global()**: Would let Catalog module inject queues without importing SharedQueueModule, but breaks the explicit dependency convention. All other modules already import SharedQueueModule explicitly -- making it @Global() would hide the dependency.

3. **Merge into individual feature changes (W2-W6)**: Each feature worktree (payment, notifications, etc.) was intentionally developed independently. Wiring is a separate concern that should happen once, after all features are stable, to avoid merge conflicts and circular dependency issues during development.

## Scope

### IN Scope

- Update `AppModule.imports` array to include `SharedQueueModule`, `BookingModule`, `CheckinModule`, `BackgroundModule` (BackgroundModule last).
- Update `BookingModule.exports` to include `SeatLockMechanic` (needed by Background cron jobs).
- Update `CatalogModule.imports` to include `SharedQueueModule` and exports to include `WorkshopNotificationPublisher`.
- Update `BackgroundModule.imports` to also include `CatalogModule`.
- Upgrade `WorkshopNotificationPublisher` to inject `@InjectQueue(NOTIFICATION_QUEUE)` and call `.add()` for both workshop.cancelled and workshop.emergency-update events.
- Add `specs/integration/spec.md` with functional requirements for cross-module wiring.

### OUT OF Scope

- Implementation of feature module business logic (all feature work is done in W1-W6).
- Changes to database schemas or migrations.
- Frontend or mobile application changes.
- Real payment gateway or notification channel adapters.
- Adding new routes, controllers, or services.
- Refactoring existing module structures beyond the export/import changes listed above.

## Impact Analysis

| Artifact | Impact | Type |
|----------|--------|------|
| `app.module.ts` | Add 4 new imports | MODIFY |
| `booking.module.ts` | Add `SeatLockMechanic` to exports | MODIFY |
| `catalog.module.ts` | Add `SharedQueueModule` to imports, add `WorkshopNotificationPublisher` to exports | MODIFY |
| `catalog/services/workshop-notification-publisher.service.ts` | Inject `@InjectQueue(NOTIFICATION_QUEUE)`, replace log calls with `.add()` | MODIFY |
| `background.module.ts` | Add `CatalogModule` to imports | MODIFY |
| `specs/integration/spec.md` | New integration spec | CREATE |
| `shared/queues/queue.producers.ts` | Optional: pre-typed injection helpers | CREATE (optional) |

**Affected teams:** Backend team (all module owners should review the wiring). No frontend, mobile, or ops impact.

## Success Criteria

1. `pnpm dev:server` starts without `Nest can't resolve dependencies` errors -- all 6 modules initialize.
2. `pnpm check-types` passes with zero errors.
3. `pnpm lint --filter=server` passes with zero errors.
4. BullMQ queues initialize on startup -- `redis-cli KEYS "bull:*"` shows notification, ai-summary, student-sync keys.
5. Catalog's `WorkshopNotificationPublisher` enqueues a BullMQ job on `publishCancelled()` -- verified via Redis key inspection.
6. Full integration test: Register -> Pay -> Webhook -> Ticket -> Notification enqueued (manual or e2e).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circular dependency between modules | Low | High (server won't start) | Enforce invariant: BackgroundModule imports BookingModule (one-way), BookingModule never imports BackgroundModule. Keep BackgroundModule last in AppModule imports. |
| Missing provider error at boot | Medium | High (startup failure) | Verify every service/controller injected in each module is either declared in providers or exported by an imported module. |
| WorkshopNotificationPublisher becomes async but caller doesn't await | Medium | Low (event silently dropped) | Change method signatures to return `Promise<void>`; TypeScript will catch unawaited calls at compile time. |
| Redis unavailable at boot takes down server | Low | Medium | BullMQ `enableReadyCheck: false` allows graceful degradation; connection errors logged but server starts. |
