# Design: Cross-Module Integration

## System Context

The affected system is the NestJS server application (`apps/server/`) -- a modular monolith. The change touches the dependency injection graph at two levels:

1. **Root module (`app.module.ts`)**: The gateway that registers all modules.
2. **Feature modules**: Individual bounded contexts that expose or consume services/providers.

```
                    ┌─────────────────────────────────────────┐
                    │              AppModule                   │
                    │                                          │
                    │  ┌──────────┐  ┌──────────┐              │
                    │  │ Database  │  │  Redis   │  (Global)    │
                    │  │  Module   │  │  Module  │              │
                    │  └─────┬────┘  └────┬─────┘              │
                    │        │             │                    │
                    │  ┌─────┴─────────────┴─────┐              │
                    │  │     SharedQueueModule    │  ⬅ NEW      │
                    │  └─────┬──────────────┬────┘              │
                    │        │              │                   │
                    │  ┌─────┴──────┐ ┌─────┴───────┐           │
                    │  │ IamModule  │ │ CatalogMod  │           │
                    │  └─────┬──────┘ └──────┬──────┘           │
                    │        │               │  ⬅ exports       │
                    │        │          ┌────┴────────┐         │
                    │        │          │WorkshopNotif│         │
                    │        │          │  Publisher  │         │
                    │        │          └──────┬──────┘         │
                    │        │                 │                │
                    │  ┌─────┴──────────────────┴───────┐       │
                    │  │         BookingModule           │  ⬅ NEW│
                    │  │  (exports SeatLockMechanic)     │       │
                    │  └─────┬──────────────────────────┘       │
                    │        │                                  │
                    │  ┌─────┴──────────┐                       │
                    │  │  CheckinModule  │  ⬅ NEW               │
                    │  └─────┬──────────┘                       │
                    │        │                                  │
                    │  ┌─────┴──────────────────────┐           │
                    │  │     BackgroundModule       │  ⬅ NEW   │
                    │  │  (last in array)           │  MUST be  │
                    │  │  imports Booking, Catalog  │  last     │
                    │  └────────────────────────────┘           │
                    └──────────────────────────────────────────┘
```

## Key Design Decisions

### Decision 1: BackgroundModule must be last in AppModule imports

**Rationale:** BackgroundModule imports BookingModule and CatalogModule. NestJS resolves module dependencies top-to-bottom in the imports array. If BackgroundModule is placed before BookingModule, NestJS will throw a circular dependency error because BookingModule is not yet initialized when BackgroundModule tries to resolve its imports.

**Trade-offs:** Forces a strict ordering constraint in AppModule. Comment and enforce via code review.

### Decision 2: BookingModule exports SeatLockMechanic

**Rationale:** BackgroundModule's `PaymentTimeoutCron` and `ReconciliationCron` need access to seat lock operations (release locks on timeout, reconcile counters). Per architecture invariant, BackgroundModule calls BookingModule's mechanics through Service -> Service or Service -> Mechanic access, never through Repository. Exporting `SeatLockMechanic` from BookingModule makes it available to BackgroundModule without breaking the layer boundary.

**Trade-offs:** Exposing mechanics is less common than exposing services in this codebase, but SeatLockMechanic is a pure infrastructure operation (Redis atomic ops) with no business logic, so it is safe to share.

### Decision 3: WorkshopNotificationPublisher becomes async with BullMQ injection

**Rationale:** The current log-only implementation drops events silently. Upgrading to BullMQ `@InjectQueue(NOTIFICATION_QUEUE)` transforms it from a local logger to a real async event producer. The method signatures change from `void` to `Promise<void>` -- callers that forget to `await` will get TypeScript compile errors.

**Trade-offs:** The service is used by `WorkshopsService` (cancel and emergency update methods). Those callers need to be updated to `await` the publisher calls. This is a source-code change in the same module, so it is safe.

### Decision 4: CatalogModule imports SharedQueueModule for BullMQ access

**Rationale:** `WorkshopNotificationPublisher` needs `@InjectQueue(NOTIFICATION_QUEUE)` to push events. The `@InjectQueue` decorator requires the BullMQ module to be registered in the importing module. Since `SharedQueueModule` exports `BullModule`, CatalogModule must import `SharedQueueModule` to resolve the decorator.

**Trade-offs:** Adds one more module import to CatalogModule. Minimal overhead.

### Decision 5: BackgroundModule imports CatalogModule for AiSummariesRepository

**Rationale:** The `BackgroundModule`'s `AiSummaryService` needs access to `AiSummariesRepository` which is defined in `CatalogModule`. Per architecture rules, BackgroundModule must go through the module boundary: import CatalogModule and use its exported services/repos. Since CatalogModule already exports `AiSummariesRepository` implicitly through its providers, BackgroundModule needs to import CatalogModule.

**Trade-offs:** Adds a direct module dependency. No circular risk since CatalogModule does not import BackgroundModule.

## Data Flow: Workshop Cancellation Notification Path

```
Admin UI                         Backend                           BullMQ                  Background
   │                               │                                 │                        │
   │  POST /admin/workshops/:id/   │                                 │                        │
   │  cancel                       │                                 │                        │
   │ ─────────────────────────────>│                                 │                        │
   │                               │                                 │                        │
   │                     ┌─────────┴─────────┐                       │                        │
   │                     │ WorkshopsService   │                       │                        │
   │                     │ .cancelWorkshop()  │                       │                        │
   │                     └─────────┬─────────┘                       │                        │
   │                               │                                 │                        │
   │                     ┌─────────┴─────────┐                       │                        │
   │                     │WorkshopNotifPub   │                       │                        │
   │                     │.publishCancelled()│                       │                        │
   │                     └─────────┬─────────┘                       │                        │
   │                               │                                 │                        │
   │                               │ notificationQueue.add(          │                        │
   │                               │   'workshop.cancelled',         │                        │
   │                               │   {workshopId, title, ...}      │                        │
   │                               │ )                               │                        │
   │                               │ ───────────────────────────────>│                        │
   │                               │                                 │                        │
   │                               │                                 │ NotificationWorker     │
   │                               │                                 │ .process(job)          │
   │                               │                                 │ ──────────────────────>│
   │                               │                                 │                        │
   │                               │                                 │              ┌─────────┴──────────┐
   │                               │                                 │              │ NotificationDispatch │
   │                               │                                 │              │  .sendEmail()        │
   │                               │                                 │              │  .sendTelegram()     │
   │                               │                                 │              │  .sendAppPush()      │
   │                               │                                 │              └──────────────────────┘
   │                               │                                 │                        │
   │                               │                                 │    notification_logs    │
   │                               │                                 │    INSERT status=SENT   │
```

## Data Flow: End-to-End Registration -> Payment -> Ticket -> Notification

```
Student                          RegistrationsCtl     PaymentsCtl        Catalog      Booking     Background
  │                                    │                  │                │             │             │
  │ POST /registrations                │                  │                │             │             │
  │ ───────────────────────────────>   │                  │                │             │             │
  │         Reserve seat, INSERT reg   │                  │                │             │             │
  │      <───────────────────────────  │                  │                │             │             │
  │                                    │                  │                │             │             │
  │ POST /payments (idempotency_key)   │                  │                │             │             │
  │ ─────────────────────────────────────────────────>    │                │             │             │
  │          Idempotency check,                                        │             │             │
  │          Circuit breaker check,                                    │             │             │
  │          Gateway call,                                              │             │             │
  │          Return redirect_url                                       │             │             │
  │      <────────────────────────────────────────────────             │             │             │
  │                                    │                  │             │             │             │
  │ POST /webhooks/payment/MOCK        │                  │             │             │             │
  │ (simulated gateway callback)       │                  │             │             │             │
  │ ─────────────────────────────────────────────────>    │             │             │             │
  │          BEGIN TX:                                           │             │             │
  │          payment->SUCCESS,                                            │             │             │
  │          registration->CONFIRMED,                                      │             │             │
  │          ticket->ACTIVE,                                               │             │             │
  │          DEL seat:lock                                                  │             │             │
  │          COMMIT                                                        │             │             │
  │          notificationQueue.add('payment.success')                      │             │             │
  │          ────────────────────────────────────────────────────────────────────────────────────────>│
  │      <────────────────────────────────────────────────                                            │
  │                                                                                                   │
  │                                                                            NotificationWorker     │
  │                                                                            dispatches email/       │
  │                                                                            telegram/app push       │
```

## API Contracts

No new endpoints are introduced by this change. All endpoints were created in W1-W6. This change only wires them into the module graph.

## Error Handling Strategy

| Failure Mode | Behavior | Recovery |
|-------------|----------|----------|
| Circular dependency at boot | NestJS throws circular dependency error, server exits | Developer fixes module import order -- BackgroundModule must be last in AppModule |
| Missing provider at boot | NestJS throws "Nest can't resolve dependencies" error, server exits | Developer adds the missing provider/export. Each module's exports array must be audited. |
| BullMQ connection refuses at boot | BullMQ retries connection with default backoff | If `enableReadyCheck: true` (default), server fails to start. If `false`, queues created on first successful connection. |
| WorkshopNotificationPublisher queue.add() fails (Redis down) | BullMQ throws. Since method is fire-and-forget, caller would see a rejected promise. | Wrap `.add()` in try-catch, log warning, fall back to log-only mode. Service continues without crashing. |

### WorkshopNotificationPublisher Resilience Pattern

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
    // Fallback: log instead of crashing the caller
    this.logger.error(
      `[WORKSHOP_CANCELLED] Failed to enqueue: ${(error as Error).message}`,
    );
    this.logger.log(
      `[WORKSHOP_CANCELLED] Workshop "${event.title}" (${event.workshopId}) cancelled`,
    );
  }
}
```

## Data Model Changes

No database schema changes are required. The change affects only NestJS module configuration, DI provider registrations, and one service implementation (WorkshopNotificationPublisher).

Redis keys affected indirectly (already created by W1-W6):
- BullMQ internal keys under `bull:notification:*`, `bull:ai-summary:*`, `bull:student-sync:*`
