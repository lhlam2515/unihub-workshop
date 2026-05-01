# Design: Queue Infrastructure Foundation

## Architecture Overview

The queue infrastructure follows NestJS + BullMQ best practices. A single `SharedQueueModule` (using `@nestjs/bullmq`) configures the BullMQ connection and registers all queues. Feature modules import `SharedQueueModule` to inject queue references via `@InjectQueue()`. Workers in the `BackgroundModule` consume from the same queues via `@Processor()`.

```
┌──────────────────────┐
│   SharedQueueModule  │
│                      │
│  BullModule          │
│  ├─ forRootAsync     │  ← reads REDIS_URL
│  ├─ registerQueue    │  ← registers: notification, ai-summary, student-sync
│  └─ exports BullModule │
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     │            │
     ▼            ▼
┌──────────┐ ┌──────────┐
│ Producers│ │ Consumers │
│ (W2,W3…) │ │(Background│
│          │ │ Module)   │
└──────────┘ └──────────┘
```

## Module Design

### `SharedQueueModule` Pattern

```typescript
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(
      { name: NOTIFICATION_QUEUE },
      { name: AI_SUMMARY_QUEUE },
      { name: STUDENT_SYNC_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class SharedQueueModule {}
```

### Connection Strategy

- Shares the **same `REDIS_URL`** environment variable used by `RedisService`
- No separate connection pool — BullMQ manages its own ioredis connection internally
- `defaultJobOptions.removeOnComplete.age = 3600` — completed jobs auto-clean after 1 hour
- `defaultJobOptions.removeOnFail.age = 86400` — failed jobs retained 24 hours for debugging

### Queue Names and Purpose

| Queue Name | Consumer Worker | Producers (future) |
|------------|----------------|-------------------|
| `notification` | `NotificationWorker` (W3) | Booking, Catalog modules |
| `ai-summary` | `AiSummaryWorker` (W6) | Catalog module (document upload) |
| `student-sync` | `StudentSyncWorker` (W5) | Background module (admin trigger) |

## Event Contracts

All cross-module event payloads are defined in `event-contracts.ts`. Each interface maps to a specific job name within its queue:

| Interface | Queue | Job Name | Trigger |
|-----------|-------|----------|---------|
| `NotificationJobData` | notification | `notification.dispatch` | Registration, payment, workshop events |
| `AiSummaryJobData` | ai-summary | `ai-summary.process` | Document upload completion |
| `StudentSyncJobData` | student-sync | `student-sync.import` | Admin trigger |
| `PaymentEventData` | notification | `payment.success` / `payment.failed` | Payment webhook processing |
| `WorkshopCancelledEventData` | notification | `workshop.cancelled` | Workshop cancellation |
| `WorkshopUpdatedEventData` | notification | `workshop.updated` | Emergency room/schedule update |

## File Layout

```
src/shared/queues/
├── index.ts              # Barrel re-export
├── queue.constants.ts    # Queue names + default job options
├── event-contracts.ts    # Typed event payload interfaces
└── queue.module.ts       # SharedQueueModule definition
```

## Key Decisions

1. **Same Redis instance as `RedisService`** — BullMQ creates its own ioredis connection internally; the `REDIS_URL` env var is shared, avoiding additional configuration surface.
2. **No `@Global()`** — `SharedQueueModule` is explicitly imported by modules that need queue injection, following NestJS best practices and avoiding hidden dependencies.
3. **Contract types use DB enum values** — `event-contracts.ts` imports existing `pgEnum` types from `database/schema/enums.schema.ts` to stay aligned with database enum values.
