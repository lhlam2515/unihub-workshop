# Queue Infrastructure

Shared BullMQ queue infrastructure supporting all async event processing across modules.

## Purpose

Provides centralized queue name constants, typed event contracts, and a shared NestJS module for BullMQ configuration. Any module that needs to produce or consume queue jobs imports `SharedQueueModule` and uses the exported constants for queue names.

## Requirements

### REQ-QUEUE-001: Queue Name Constants

**Source:** Architecture Decision (W1 Foundation)
**Priority:** MUST
**Classification:** FULLY AUTOMATED

Central registry of queue name strings and default job options used across all modules.

**Constants:**
- `NOTIFICATION_QUEUE = "notification"` — Notification delivery queue
- `AI_SUMMARY_QUEUE = "ai-summary"` — AI document summarization queue
- `STUDENT_SYNC_QUEUE = "student-sync"` — Student CSV import queue
- `ALL_QUEUES` — Tuple of all queue names for bulk registration
- `DEFAULT_JOB_OPTIONS` — `{ removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 }, attempts: 1 }`

#### Scenario: All queue names are unique

- **Given** The constants file is loaded
- **When** All queue names are collected into a set
- **Then** The set size equals the array length (no duplicates)

#### Scenario: Default options provide retention limits

- **Given** A job completes successfully
- **When** 1 hour passes
- **Then** The job is auto-removed from the completed set

- **Given** A job fails
- **When** 24 hours pass
- **Then** The job is auto-removed from the failed set

### REQ-QUEUE-002: Typed Event Contracts

**Source:** Architecture Decision (W1 Foundation)
**Priority:** MUST
**Classification:** FULLY AUTOMATED

TypeScript interfaces for every cross-module event payload, ensuring type safety between producers and consumers.

**Contracts:**

| Interface | Purpose | Fields |
|-----------|---------|--------|
| `NotificationJobData` | Notification dispatch payload | notificationId, type, channel, recipient, payload |
| `AiSummaryJobData` | AI document processing payload | documentId, workshopId, fileUrl |
| `StudentSyncJobData` | CSV import payload | jobId, sourceFileName |
| `PaymentEventData` | Payment outcome event | paymentId, registrationId, studentId, workshopId, amount, gateway, eventType |
| `WorkshopCancelledEventData` | Workshop cancellation event | workshopId, title, cancelledAt |
| `WorkshopUpdatedEventData` | Workshop emergency update event | workshopId, changes |

#### Scenario: Contract types align with DB enum values

- **Given** The `event-contracts.ts` module is compiled
- **When** TypeScript checks type references
- **Then** Notification and payment types reference `database/schema/enums.schema.ts` enum values

### REQ-QUEUE-003: SharedQueueModule

**Source:** Architecture Decision (W1 Foundation)
**Priority:** MUST
**Classification:** FULLY AUTOMATED

A NestJS module that configures BullMQ with the shared Redis connection and registers all queues.

**Configuration:**
- Connection: `REDIS_URL` environment variable (same as `RedisService`)
- Default job options: completed jobs removed after 1 hour, failed after 24 hours
- Registered queues: `notification`, `ai-summary`, `student-sync`

**Behavior:**
- Module exports `BullModule` so importing modules can use `@InjectQueue()` decorator
- Not `@Global()` — modules that need queue access must explicitly import `SharedQueueModule`

#### Scenario: Module initializes without errors

- **Given** `REDIS_URL` is set in environment
- **When** `SharedQueueModule` is imported and NestJS starts
- **Then** BullMQ connection initializes and all 3 queues are registered

#### Scenario: All queues are accessible

- **Given** `SharedQueueModule` is imported by `BackgroundModule`
- **When** A worker uses `@Processor(NOTIFICATION_QUEUE)`
- **Then** The worker receives jobs from the correct queue

### REQ-QUEUE-004: BackgroundModule wiring

**Source:** Architecture Decision (W1 Foundation)
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED

The existing `BackgroundModule` imports `SharedQueueModule` so its workers can use `@Processor` decorators.

**Changes:**
- Add `SharedQueueModule` to `imports` array
- Remove stale TODO comments referencing queue library setup

#### Scenario: Module compiles without circular dependencies

- **Given** `SharedQueueModule` is imported in `BackgroundModule`
- **When** NestJS compiles the module graph
- **Then** No circular dependency errors occur
