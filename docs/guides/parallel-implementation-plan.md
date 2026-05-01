# Parallel Worktree Implementation Plan — Booking & Background Modules

**Version:** 1.0 | **Date:** 2026-05-01  
**Source:** SRS (`docs/srs.md`), Codebase Analysis, Architecture Decision Records  
**Workflow:** Mỗi worktree thực thi qua pipeline `/opsx:e2e` (explore → propose → branch → apply → verify → archive → docs → commit → pr)

---

## Table of Contents

1. [Architectural Context](#1-architectural-context)
2. [Worktree Topology & Merge Order](#2-worktree-topology--merge-order)
3. [W1: Queue Infrastructure + Event System Foundation](#3-w1-queue-infrastructure--event-system-foundation)
4. [W2: Payment Processing Core (F05)](#4-w2-payment-processing-core-f05)
5. [W3: Notification Dispatch System (F08)](#5-w3-notification-dispatch-system-f08)
6. [W4: Background Cron Jobs (F10)](#6-w4-background-cron-jobs-f10)
7. [W5: Student CSV Sync Pipeline (F09)](#7-w5-student-csv-sync-pipeline-f09)
8. [W6: AI Summary Pipeline (F03-002)](#8-w6-ai-summary-pipeline-f03-002)
9. [W7: Cross-Module Integration + AppModule Wiring](#9-w7-cross-module-integration--appmodule-wiring)
10. [Cross-Worktree Interface Contracts](#10-cross-worktree-interface-contracts)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Architectural Context

### Current State

| Module | Completion | What's Done | What's Missing |
|--------|:----------:|-------------|----------------|
| **Booking** | ~40% | Registration flow, seat lock, rate limiters, tickets repo | **Payment (F05)**: entire pipeline stubbed |
| **Background** | ~0% | All schemas, DTOs, stubs exist | Everything: queue infra, workers, crons, services, repos |
| **Catalog** | ~70% | Workshop CRUD, cancel, emergency update | Notification publisher logs only (no queue) |
| **Checkin** | ~0% | All stubs | Ticket viewing, QR check-in, offline sync |
| **AppModule** | ~60% | IAM, Catalog, Storage, DB, Redis imported | Booking, Background, Checkin NOT imported |

### Key Architectural Invariants

- **Result Pattern**: Services return `Result<T, AppError>` — never throw exceptions
- **Cross-module access**: Service → Service only, never Service → Repository of another module
- **`@Global()` modules**: `RedisModule` and `DatabaseModule` available everywhere without explicit import
- **BullMQ**: `@nestjs/bullmq@11`, `bullmq@5` installed but **unconfigured** — no `shared/queues/` directory exists
- **`HmacSignatureGuard`**: Fully implemented, ready for payment webhook endpoints
- **`@IdempotencyKey()` decorator**: Exists and extracts `X-Idempotency-Key` header
- **Error factories**: All error codes defined (`paymentErrors`, `registrationErrors`, `seatErrors`, etc.)

### Reference Implementations to Study

| Implementation | File | Pattern |
|----------------|------|---------|
| `RegistrationsService` | `booking/services/registrations.service.ts` | Multi-stage pipeline with compensating rollbacks |
| `SeatLockMechanic` | `booking/mechanics/seat-lock.mechanic.ts` | Redis SET NX with TTL |
| `RateLimiterMechanic` | `booking/mechanics/rate-limiter.mechanic.ts` | Redis Hash Token Bucket |
| `RegistrationsRepository` | `booking/repositories/registrations.repository.ts` | Drizzle ORM with `tryCatch` wrapper |

### Database Schemas Already Defined

- `payments` — `paymentGatewayEnum`, `paymentStatusEnum`, indexes on status+gateway, partial index for PENDING
- `notification_channel_configs` — EMAIL/TELEGRAM/APP channel configs
- `notification_logs` — audit trail with status PENDING/SENT/FAILED
- `student_sync_jobs` — RUNNING/SUCCESS/PARTIAL_FAILURE/FAILED
- `student_sync_errors` — per-row error records
- `ai_summaries` — PENDING/PROCESSING/DONE/FAILED
- `workshop_documents` — UPLOADED/PROCESSING/PROCESSED/FAILED

---

## 2. Worktree Topology & Merge Order

### Dependency Graph

```
Phase 1:  W1 (Foundation)
              |
Phase 2:  ┌───┼───┬───────┬──────┐
         W2   W3  W5      W6     W4 (needs W2)
              |
Phase 3:  W7 (Integration — needs ALL above merged)
```

### Merge Order

```
1. W1 (Foundation)                          → merge to main FIRST
2. W2, W3, W5, W6 (parallel feature work)   → merge in any order  
3. W4 (Background Crons)                    → merge after W2
4. W7 (Integration)                         → merge LAST
```

### Parallelism Rules

- **W2, W3, W5, W6** can be developed simultaneously after W1 merges
- **W4** starts after W2 completes (needs `PaymentsService.expirePayment()` from W2)
- **W7** starts after ALL W1-W6 merged (wires everything together)
- Each worktree MUST follow `/opsx:e2e` pipeline

---

## 3. W1: Queue Infrastructure + Event System Foundation

**Branch:** `feat/queue-infrastructure-foundation`
**Prerequisite for:** ALL other worktrees
**Estimated size:** Small (~5 files)
**Pipeline:** `/opsx:e2e queue-infrastructure-foundation`

### Files to Create (4 files)

All under `apps/server/src/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `shared/queues/queue.constants.ts` | Queue name string constants + default job options |
| 2 | `shared/queues/event-contracts.ts` | TypeScript interfaces for all cross-module event payloads |
| 3 | `shared/queues/queue.module.ts` | `SharedQueueModule` — BullMQ `forRootAsync` + queue registration |
| 4 | `shared/queues/index.ts` | Barrel re-export |

### Files to Modify (1 file)

| File | Change |
|------|--------|
| `background/background.module.ts` | Add `SharedQueueModule` to `imports`; remove TODO comments |

### `queue.constants.ts` — Contents

```typescript
export const NOTIFICATION_QUEUE = "notification";
export const AI_SUMMARY_QUEUE = "ai-summary";
export const STUDENT_SYNC_QUEUE = "student-sync";

export const ALL_QUEUES = [NOTIFICATION_QUEUE, AI_SUMMARY_QUEUE, STUDENT_SYNC_QUEUE] as const;

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
  attempts: 1,
} as const;
```

### `event-contracts.ts` — Event Types

Define interfaces for:

- **`NotificationJobData`**: `notificationId`, `type` (NotificationTypeEnum from DB schema), `channel`, `recipient`, `payload`
- **`AiSummaryJobData`**: `documentId`, `workshopId`, `fileUrl`
- **`StudentSyncJobData`**: `jobId`, `sourceFileName`
- **`PaymentEventData`**: `paymentId`, `registrationId`, `studentId`, `workshopId`, `amount`, `gateway`, `eventType` (PAYMENT_SUCCESS | PAYMENT_FAILED)
- **`WorkshopCancelledEventData`**: `workshopId`, `title`, `cancelledAt`
- **`WorkshopUpdatedEventData`**: `workshopId`, `changes` (which fields changed)

### `queue.module.ts` — Implementation Pattern

```typescript
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: { removeOnComplete: { age: 3600 } },
      }),
    }),
    BullModule.registerQueue(...ALL_QUEUES.map(name => ({ name }))),
  ],
  exports: [BullModule],
})
export class SharedQueueModule {}
```

### `background.module.ts` — Wire Queue

Add to `imports`: `SharedQueueModule`

### Verification

- `pnpm dev:server` starts without DI errors
- `redis-cli KEYS "bull:*"` shows BullMQ internal keys
- `pnpm check-types` passes

---

## 4. W2: Payment Processing Core (F05)

**Branch:** `feat/payment-processing-core`
**Depends on:** W1 (needs `SharedQueueModule`)
**Estimated size:** Large (~7 files)
**Pipeline:** `/opsx:e2e payment-processing-core`

### Files to Modify (all stubs exist, 0 creates)

| # | File | What to Implement |
|---|------|-------------------|
| 1 | `booking/mechanics/idempotency.mechanic.ts` | `check()` — SET NX `idempotency:{key}` EX 86400; `setPaymentId()` — update value on creation |
| 2 | `booking/mechanics/circuit-breaker.mechanic.ts` | `checkAndAllow()` — read Redis Hash `circuit:payment:{gateway}`, check state; `recordSuccess()` / `recordFailure()` — update state machine |
| 3 | `booking/repositories/payments.repository.ts` | All 5 methods: `findByIdempotencyKey()`, `create()` (with `FOR UPDATE NOWAIT`), `updateStatus()`, `findMyPayments()`, `findPendingOverdue()` |
| 4 | `booking/services/payment-gateway.service.ts` | MOCK adapter with `initiatePayment()`, `verifyHmacSignature()`; switch structure ready for VNPAY/STRIPE/MOMO |
| 5 | `booking/services/payments.service.ts` | **Core orchestration** — `initiate()` pipeline + `handleWebhook()` pipeline |
| 6 | `booking/controllers/payments.controller.ts` | Wire 4 endpoints with proper DI types (replace `any`) |
| 7 | `booking/dto/payment-response.dto.ts` | Implement `from()` and `fromCreate()` factories |

### `idempotency.mechanic.ts` — Implementation

```typescript
async check(key: string): Promise<Result<{ existingPaymentId?: string }>> {
  const result = await this.redis.setNx(`idempotency:${key}`, "pending", 86400);
  if (!result) {
    // Key exists — get existing payment_id
    const paymentId = await this.redis.get(`idempotency:${key}`);
    return Result.ok({ existingPaymentId: paymentId !== "pending" ? paymentId : undefined });
  }
  return Result.ok({ existingPaymentId: undefined }); // Fresh key, proceed
}

async setPaymentId(key: string, paymentId: string): Promise<void> {
  await this.redis.set(`idempotency:${key}`, paymentId, 86400);
}
```

### `circuit-breaker.mechanic.ts` — State Machine

```
State: CLOSED → OPEN (failure_count >= 5 in 60s)
               → HALF_OPEN (after 30s cool-down)
               → CLOSED (1 successful canary request)

checkAndAllow():
  - CLOSED: allow
  - OPEN: if (now - opened_at) >= 30000ms → transition to HALF_OPEN, allow
  - HALF_OPEN: reject (canary already in flight or no need)

recordSuccess():
  - HALF_OPEN: transition to CLOSED, reset failure_count
  - CLOSED: reset failure_count to 0

recordFailure():
  - Increment failure_count
  - If failure_count >= 5: transition to OPEN, set opened_at
```

### `payments.service.ts` — `initiate()` Pipeline

```
1. Verify seat lock TTL (seatLockMechanic.check)
2. Idempotency Layer 1 (idempotencyMechanic.check via SET NX)
3. Circuit Breaker check (circuitBreakerMechanic.checkAndAllow)
4. INSERT payment with pessimistic lock:
   BEGIN;
   SET LOCAL statement_timeout = '3s';
   SELECT ... FROM workshop_slots WHERE workshop_id = ? FOR UPDATE NOWAIT;
   INSERT INTO payments (...) VALUES (...);
   COMMIT;
5. Call PaymentGatewayService.initiatePayment()
6. Update Circuit Breaker (recordSuccess or recordFailure)
7. Build and return CreatePaymentResponseDto with redirect_url
```

### `payments.service.ts` — `handleWebhook()` Pipeline (ACID)

```
1. Find payment by idempotency_key (Layer 2 — DB constraint)
2. Reject if already SUCCESS (paymentErrors.alreadySuccess)
3. BEGIN transaction:
   a. UPDATE payments SET status = 'SUCCESS', gateway_txn_id, completed_at
   b. UPDATE registrations SET status = 'CONFIRMED', confirmed_at
   c. INSERT INTO tickets (registration_id, qr_token, status = 'ACTIVE')
   d. Redis: DEL seat:lock:{wid}:{rid}
4. COMMIT — all or nothing
5. Fire-and-forget: notificationQueue.add('payment.success', PaymentEventData)
6. Update Circuit Breaker: recordSuccess
```

### Contract with W4

```typescript
// W2 implements — W4 consumes
async expirePayment(paymentId: string): Promise<Result<void>> {
  // 1. Find payment
  // 2. BEGIN: payment→TIMEOUT, registration→CANCELLED
  // 3. INCR seat:available:{wid}
  // 4. DEL seat:lock:{wid}:{rid}
  // 5. COMMIT
  // 6. Fire-and-forget PAYMENT_FAILED event
}
```

### Verification

- Same idempotency key twice → second returns `PAYMENT_DUPLICATE`
- 5 gateway failures → circuit opens → next returns `PAYMENT_GATEWAY_OPEN`
- Valid webhook → payment SUCCESS, registration CONFIRMED, ticket ACTIVE
- Concurrent payments → one gets `DB_LOCK_TIMEOUT` (503)

---

## 5. W3: Notification Dispatch System (F08)

**Branch:** `feat/notification-dispatch-system`
**Depends on:** W1 (BullMQ queues)
**Estimated size:** Medium (~8 files)
**Pipeline:** `/opsx:e2e notification-dispatch-system`

### Files to Modify (all stubs exist, 0 creates)

| # | File | What to Implement |
|---|------|-------------------|
| 1 | `background/repositories/notification-logs.repository.ts` | `findById()`, `create()`, `updateStatus()`, `findMany()` (paginated with filters) |
| 2 | `background/repositories/notification-channel-configs.repository.ts` | `findAll()`, `findByChannelType()`, `update()` |
| 3 | `background/services/notifications.service.ts` | `listLogs()`, `getLogById()`, `listChannelConfigs()`, `updateChannelConfig()` |
| 4 | `background/services/notification-dispatch.service.ts` | `dispatch()` — route to channel; `sendEmail()` / `sendTelegram()` (log-first MVP) |
| 5 | `background/workers/notification.worker.ts` | `@Processor(NOTIFICATION_QUEUE)` with exponential backoff retry |
| 6 | `background/controllers/notifications-admin.controller.ts` | Wire 4 admin endpoints with validated DTOs |
| 7 | `background/dto/notification-response.dto.ts` | Implement `from()` factory |
| 8 | `background/dto/update-channel-config.dto.ts` | Wire Zod schema |

### NotificationWorker — Retry Strategy

```typescript
@Processor(NOTIFICATION_QUEUE, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s, 40s, 80s (capped at 300s)
})
```

### Channel Adapters — Log-First MVP

```typescript
async sendEmail(to: string, subject: string, body: string): Promise<Result<void>> {
  this.logger.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
  // TODO: Replace with nodemailer integration
  // const transport = nodemailer.createTransport({...});
  // await transport.sendMail({ to, subject, html: body });
  return Result.ok(undefined);
}

async sendTelegram(chatId: string, message: string): Promise<Result<void>> {
  this.logger.log(`[TELEGRAM] Chat: ${chatId}, Message: ${message}`);
  // TODO: Replace with axios Bot API call
  // await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {...});
  return Result.ok(undefined);
}
```

### Verification

- Manually add job to `NOTIFICATION_QUEUE` → worker dispatches, updates log
- Mock dispatch failure → verify exponential backoff retry
- `GET /admin/notifications` → paginated log list
- `PATCH /admin/notifications/channels/EMAIL` → config updated

---

## 6. W4: Background Cron Jobs (F10)

**Branch:** `feat/background-cron-jobs`
**Depends on:** W1 (SharedQueueModule), W2 (Booking module)
**Estimated size:** Medium (~4 files)
**Pipeline:** `/opsx:e2e background-cron-jobs`

### FRs Covered

- **FR-F10-001**: Payment Timeout Monitor — `@Cron('*/1 * * * *')` — **MUST**
- **FR-F10-002**: Seat Reconciliation — `@Cron('*/10 * * * *')` — **SHOULD**
- **FR-F10-003**: Circuit Breaker Recovery — `@Cron('*/30 * * * *')` — **MUST**

### Files to Modify

| # | File | What to Implement |
|---|------|-------------------|
| 1 | `background/cron/payment-timeout.cron.ts` | Enable `@Cron`; implement `handlePaymentTimeout()` — query expired PENDING payments, call `paymentsService.expirePayment()` |
| 2 | `background/cron/reconciliation.cron.ts` | Enable `@Cron`; implement `handleReconciliation()` — compare Redis vs PostgreSQL, log discrepancies |
| 3 | `background/services/system-monitor.service.ts` | `getJobHealth()`, `getCircuitBreakerStatus()`, `getQueueStats()` |

### Files to Create

| # | File | Purpose |
|---|------|---------|
| 4 | `background/cron/circuit-breaker-recovery.cron.ts` | Scan OPEN circuits, transition to HALF_OPEN if 30s elapsed |

### PaymentTimeoutCron

```
handlePaymentTimeout():
  1. Query: SELECT * FROM payments WHERE status = 'PENDING' AND timeout_at < NOW()
  2. For each expired payment:
     await paymentsService.expirePayment(paymentId)
  3. Log: "Payment timeout cron: N payments expired"
```

### ReconciliationCron

```
handleReconciliation():
  1. Load PUBLISHED workshops from WorkshopsService
  2. For each workshop:
     a. Redis: GET seat:available:{workshopId}
     b. DB: Count CONFIRMED + PENDING_PAYMENT registrations
     c. diff = |redis_value - (capacity - sum(confirmed, pending))|
     d. If diff > 5: log warning
  3. NO automatic correction — BR-040: Redis is source of truth
```

### CircuitBreakerRecoveryCron

```
handleRecovery():
  1. SCAN Redis keys matching "circuit:payment:*"
  2. For each OPEN circuit where (now - opened_at) >= 30s:
     a. HSet state = 'HALF_OPEN'
     b. Log: "Circuit {gateway} transitioned OPEN → HALF_OPEN"
  3. Actual circuit test happens via canary request in W2's CircuitBreakerMechanic
```

### Verification

- Mock expired payment → run cron → payment TIMEOUT, seat released
- Insert DB/Redis discrepancy → reconciliation logs warning
- Open circuit → wait 30s → recovery cron transitions to HALF_OPEN

---

## 7. W5: Student CSV Sync Pipeline (F09)

**Branch:** `feat/student-csv-sync-pipeline`
**Depends on:** W1 (BullMQ queues)
**Estimated size:** Medium (~7 files)
**Pipeline:** `/opsx:e2e student-csv-sync-pipeline`

### Files to Modify (all stubs exist)

| # | File | What to Implement |
|---|------|-------------------|
| 1 | `background/repositories/student-sync-jobs.repository.ts` | `findById()`, `create()`, `updateProgress()`, `finalize()` |
| 2 | `background/repositories/student-sync-errors.repository.ts` | `createBatch()`, `findByJobId()` |
| 3 | `background/services/student-sync.service.ts` | `triggerSync()`, `processJob()`, `getJob()`, `getJobErrors()` + private helpers |
| 4 | `background/workers/student-sync.worker.ts` | `@Processor(STUDENT_SYNC_QUEUE)` with distributed lock |
| 5 | `background/controllers/student-sync-admin.controller.ts` | Wire 3 admin endpoints |
| 6 | `background/dto/trigger-student-sync.dto.ts` | Wire Zod schema |
| 7 | `background/dto/student-sync-response.dto.ts` | Implement `from()` factory |

### Student Upsert — SQL Pattern

```typescript
await this.db.insert(schema.students)
  .values({
    studentCode: row.student_code,
    fullName: row.full_name,
    faculty: row.faculty,
    classYear: row.class_year ? Number(row.class_year) : undefined,
    emailEdu: row.email_edu,
    lastSyncedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: schema.students.studentCode,
    set: {
      fullName: sql`EXCLUDED.full_name`,
      faculty: sql`EXCLUDED.faculty`,
      classYear: sql`EXCLUDED.class_year`,
      emailEdu: sql`EXCLUDED.email_edu`,
      lastSyncedAt: new Date(),
    },
  });
```

### Processing Flow

1. Fetch CSV from Object Storage (StorageService)
2. Stream parse with Node.js `readline` or `fast-csv`
3. Validate required headers: `student_code`, `full_name`
4. Process rows in batches of 100
5. Each batch: validate per row → upsert → collect errors → update progress
6. Finalize: SUCCESS or PARTIAL_FAILURE

### Verification

- `POST /admin/students/sync` → HTTP 202 with job_id
- Worker processes → students upserted
- `GET /admin/students/sync/:jobId` → returns counts
- Run twice → no duplicates (idempotent upsert)
- Corrupt CSV row → PARTIAL_FAILURE, error recorded

---

## 8. W6: AI Summary Pipeline (F03-002)

**Branch:** `feat/ai-summary-pipeline`
**Depends on:** W1 (BullMQ queues)
**Estimated size:** Small (~2 files)
**Priority:** SHOULD
**Pipeline:** `/opsx:e2e ai-summary-pipeline`

### Files to Modify (stubs exist)

| # | File | What to Implement |
|---|------|-------------------|
| 1 | `background/services/ai-summary.service.ts` | Pipe-and-Filter: Extract PDF text → Clean → Claude API → Save |
| 2 | `background/workers/ai-summary.worker.ts` | `@Processor(AI_SUMMARY_QUEUE)`, timeout 40s, retry 3x |

### Pipeline: `processDocument(documentId)`

```
1. Load document from workshopDocumentsRepo (get file_url)
2. Fetch PDF from Object Storage (StorageService)
3. Extract text: pdf-parse library
4. Clean: remove extra whitespace, normalize newlines, truncate to 8000 chars
5. LLM call: Claude Sonnet 4 API with 30s timeout
   - System prompt: "Summarize this workshop document..."
   - Returns summary_text
6. Update ai_summaries: status = 'DONE', summary_text, model_used, generated_at
7. On failure: status = 'FAILED', error_message
```

### Worker Timeout Pattern

```typescript
@Process()
async process(job: Job<AiSummaryJobData>) {
  const result = await Promise.race([
    this.aiSummaryService.processDocument(job.data.documentId),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), 40000)
    ),
  ]);
  // LLM timeout → FAILED (no retry)
  // Other error → throw (BullMQ retries up to 3 times with backoff)
}
```

### Verification

- Upload PDF → add job to `AI_SUMMARY_QUEUE` → summary appears
- Mock timeout → FAILED with `LLM_TIMEOUT`
- Mock transient error → verify 3 retries

---

## 9. W7: Cross-Module Integration + AppModule Wiring

**Branch:** `feat/cross-module-integration`
**Depends on:** W1–W6 ALL merged
**This MUST be the last worktree.**
**Estimated size:** Small (~7 files)
**Pipeline:** `/opsx:e2e cross-module-integration`

### Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `app.module.ts` | Import `BookingModule`, `BackgroundModule`, `CheckinModule`, `SharedQueueModule` |
| 2 | `booking/booking.module.ts` | Import `SharedQueueModule`; export `SeatLockMechanic` |
| 3 | `background/background.module.ts` | Import `BookingModule`, `CatalogModule`, `DatabaseModule`, `RedisModule` |
| 4 | `catalog/catalog.module.ts` | Import `SharedQueueModule`; export `WorkshopNotificationPublisher` |
| 5 | `catalog/services/workshop-notification-publisher.service.ts` | Inject `@InjectQueue(NOTIFICATION_QUEUE)`, replace log with `.add()` calls |

### Files to Create

| # | File | Purpose |
|---|------|---------|
| 6 | `shared/queues/queue.producers.ts` | Pre-typed queue injection helpers (optional) |

### Critical: Circular Dependency Prevention

- `BookingModule` NEVER imports `BackgroundModule`
- `BackgroundModule` imports `BookingModule` (one-way)
- Queue injection via `SharedQueueModule` (not through any feature module)
- `BackgroundModule` MUST be LAST in `AppModule.imports` array

### `app.module.ts` — Final Imports

```typescript
imports: [
  DatabaseModule,
  RedisModule,
  StorageModule.forRoot({...}),
  SharedQueueModule,       // NEW — BullMQ infrastructure
  IamModule,
  CatalogModule,
  BookingModule,            // NEW
  CheckinModule,            // NEW
  BackgroundModule,         // NEW — MUST be last (depends on Booking, Catalog)
]
```

### `workshop-notification-publisher.service.ts` — Upgrade

```typescript
// Before:
this.logger.log(`[WORKSHOP_CANCELLED] Workshop "${event.title}"`);

// After:
await this.notificationQueue.add('workshop.cancelled', {
  type: 'WORKSHOP_CANCELLED',
  workshopId: event.workshopId,
  title: event.title,
  cancelledAt: event.cancelledAt,
});
```

### Verification

- `pnpm dev:server` — ALL modules load, no circular dependency errors
- Full integration: Register → Pay → Webhook → Ticket → Notification enqueued
- `pnpm check-types` passes
- `pnpm lint --filter=server` passes

---

## 10. Cross-Worktree Interface Contracts

| Contract | Defined In | Consumed By | Description |
|----------|-----------|-------------|-------------|
| `PaymentsService.expirePayment()` | W2 | W4 | Expire overdue payment, release seat |
| `SeatLockMechanic` export | W2 module | W4 | Release seat locks from cron |
| `@InjectQueue(NOTIFICATION_QUEUE)` | W1 | W2, W7 | Emit payment/workshop events |
| `SharedQueueModule` | W1 | W2, W3, W4, W5, W6 | BullMQ foundation |
| Queue names + event types | W1 `event-contracts.ts` | ALL | Standardized event payloads |

---

## 11. Out of Scope

These need separate worktree plans (follow-up):

- **Checkin Module** (F06, F07): Ticket viewing, QR scanning, offline sync, online check-in
- **Frontend Web**: All student/admin pages are placeholders
- **Mobile App**: QR camera scanning, offline check-in, batch sync
- **Real Payment Gateways**: VNPAY, STRIPE, MOMO adapters (MOCK only for MVP)
- **Real Notification Channels**: SMTP, Telegram Bot API (log-only MVP)
- **FR-F10-004**: Workshop assignment for Check-in Staff (SHOULD priority)

---

## Quick Reference: Each Worktree's `/opsx:e2e` Command

| Worktree | Change Name for `/opsx:e2e` | Merge After |
|----------|-----------------------------|-------------|
| W1 | `queue-infrastructure-foundation` | — (base) |
| W2 | `payment-processing-core` | W1 |
| W3 | `notification-dispatch-system` | W1 |
| W4 | `background-cron-jobs` | W2 |
| W5 | `student-csv-sync-pipeline` | W1 |
| W6 | `ai-summary-pipeline` | W1 |
| W7 | `cross-module-integration` | W1–W6 all merged |
