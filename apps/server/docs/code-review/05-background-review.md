# Background Module Code Review

**Scope:** apps/server/src/modules/background/
**Reviewer:** Background Module Reviewer
**Date:** 2026-05-02

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | Service bypasses repository layer — direct `this.db.insert()` call in service | services/student-sync.service.ts:353-375 | **CRITICAL** | Extract DB access to a `StudentsRepository` in the IAM or background module. Services must not call Drizzle directly per layered architecture rules. |
| 2 | Service bypasses repository layer — direct `this.db.select()` calls in service | services/system-monitor.service.ts:58-71, 106-138 | **CRITICAL** | Delegate all DB queries to repositories or existing services (e.g., `WorkshopsService`, `PaymentsRepository`). |
| 3 | Worker bypasses service layer — worker directly injects and calls `AiSummariesRepository` | workers/ai-summary.worker.ts:42, 98-100 | **HIGH** | Worker should delegate all business logic to `AiSummaryService` for timeout handling, not directly manipulate the repo. Creates dual update paths to `ai_summaries` status. |
| 4 | Controller methods return `Result<any>` — type safety bypass | controllers/student-sync-admin.controller.ts:56,70,84,102 | **HIGH** | Replace `any` with specific response DTO types (e.g., `StudentSyncJobDto`, `StudentSyncErrorDto`). |
| 5 | `NotificationChannelConfigsRepository` uses `string` for `channelType` param — casts at DB layer instead of proper union type | repositories/notification-channel-configs.repository.ts:59, 68, 91, 107-108 | **MEDIUM** | Change parameter type from `string` to `"APP" | "EMAIL" | "TELEGRAM"` and eliminate the type assertions at the DB call site. |
| 6 | `NotificationsService.listChannelConfigs()` and `updateChannelConfig()` return `Result<unknown[]>` and `Result<unknown>` — lost type info | services/notifications.service.ts:94-96, 108-113 | **MEDIUM** | Create and return proper response DTO types instead of `unknown`. |
| 7 | `NotificationsService.getLogById()` returns `Result<Record<string, unknown> | null>` — opaque return type | services/notifications.service.ts:80-87 | **LOW** | Return typed DTO (`NotificationLogResponseDto | null`) rather than `Record<string, unknown>`. |
| 8 | Import uses relative path `../../../shared/response/errors` instead of `@/shared/response/errors` path alias | services/notification-dispatch.service.ts:6, services/notifications.service.ts:6 | **LOW** | Use `@/shared/response/errors` consistently with the rest of the codebase. |

### 1.2 Techniques (Cron, BullMQ, Scheduling)

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | All cron jobs correctly use `@Cron` decorator with `@nestjs/schedule`; `ScheduleModule.forRoot()` imported in module | — | ✅ | No issue found. |
| 2 | All BullMQ workers correctly use `@Processor`, extend `WorkerHost`, and implement `process()` method | — | ✅ | No issue found. |
| 3 | Notification, AI summary, and student sync queues properly referenced via shared constants (`NOTIFICATION_QUEUE`, `AI_SUMMARY_QUEUE`, `STUDENT_SYNC_QUEUE`) | — | ✅ | No issue found. |
| 4 | Module correctly imports `SharedQueueModule`, `BookingModule`, `CatalogModule` | background.module.ts | ✅ | No issue found. |
| 5 | Distributed lock logic is inline in worker rather than abstracted into a reusable mechanic or utility | workers/student-sync.worker.ts:94-114 | **LOW** | Consider extracting the distributed lock pattern to a shared `LockMechanic` or utility if this pattern appears in other workers. |

### 1.3 Security

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | All admin controllers correctly use `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles("ORGANIZER")` at class level | — | ✅ | No issue found. |
| 2 | `updateChannelConfig` accepts unvalidated `channelType: string` param — no guard against injection of non-existent channel types | controllers/notifications-admin.controller.ts:75 | **LOW** | Use a union type or a Zod enum for the `channelType` path parameter to reject invalid channel types at the validation boundary. |

## 2. Code Quality Principles

### 2.1 KISS

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | `StudentSyncService` is 378 lines — too long, violates the 50-line method guideline for the class as a whole | services/student-sync.service.ts:27-377 | **HIGH** | Split into: `StudentSyncJobService` (job CRUD), `StudentRowValidator` (row validation), `StudentUpsertService` (DB upsert). |
| 2 | `SystemMonitorService` is 260 lines with three distinct monitoring responsibilities | services/system-monitor.service.ts:37-259 | **MEDIUM** | Split into `PaymentMonitorService`, `ReconciliationMonitorService`, and `CircuitBreakerMonitorService`. |
| 3 | `AiSummaryWorker.withTimeout()` uses `Promise.race` which leaks the timer on success — the `setTimeout` continues to run | workers/ai-summary.worker.ts:130-140 | **MEDIUM** | Use `AbortController` or clear the timeout on resolution to avoid dangling timers and potential memory leaks. |
| 4 | All channel implementations are log-first MVP stubs — they always return `Result.ok()` without real delivery | channels/ | **LOW** | Documented intentionally as MVP — OK for now but must be addressed before production. |

### 2.2 YAGNI

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | **3 TODO comments** in production code: `pdf-parse`, `Anthropic SDK`, `fast-csv` — placeholders in business-logic paths | services/ai-summary.service.ts:146,206; services/student-sync.service.ts:263 | **MEDIUM** | Either implement, or log structured feature-request issues and replace with a clear error message indicating the feature is pending. TODO comments in production code signal incomplete work. |
| 2 | `_config` param in all channel `.send()` methods is voided and unused | channels/app.channel.ts:33, email.channel.ts:33, telegram.channel.ts:33 | **LOW** | Intentional MVP placeholder — acceptable. The `_config` marker and `void` statement correctly signal unused parameter intent. |
| 3 | `void csvUrl` in `parseCSV()` full method stub | services/student-sync.service.ts:271-273 | **LOW** | Intentional stub — acceptable with the TODO marker. |

### 2.3 DRY

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | `KNOWN_GATEWAYS = ["VNPAY", "MOMO", "STRIPE"]` **duplicated** in two files | cron/circuit-breaker-recovery.cron.ts:24, services/system-monitor.service.ts:28 | **HIGH** | Extract to a shared constants file (e.g., `background/constants/circuit-breaker.constants.ts`). |
| 2 | `CIRCUIT_KEY_PREFIX = "circuit:payment"` **duplicated** in two files | cron/circuit-breaker-recovery.cron.ts:27, services/system-monitor.service.ts:31 | **HIGH** | Same constant file as above. |
| 3 | `DISCREPANCY_THRESHOLD = 5` **duplicated** in two files | cron/reconciliation.cron.ts:33, services/system-monitor.service.ts:34 | **MEDIUM** | Extract to a shared constants file (e.g., `background/constants/reconciliation.constants.ts`). |
| 4 | `"cron:last_run:payment-timeout"` and `"cron:last_run:reconciliation"` hardcoded in both cron jobs and monitor service | cron/payment-timeout.cron.ts:85-86, services/system-monitor.service.ts:76, cron/reconciliation.cron.ts:101, services/system-monitor.service.ts:143 | **MEDIUM** | Define cron last-run key constants in a shared location. |

### 2.4 SOLID

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | **SRP violation:** `StudentSyncService` handles job CRUD management, CSV parsing (stub), row validation, AND student DB upsert — at least 3 distinct responsibilities | services/student-sync.service.ts | **HIGH** | Extract row validation into `StudentRowValidator`, CSV parsing into `StudentCsvParser`, DB operations into a repository. |
| 2 | **SRP violation:** `SystemMonitorService` monitors payment timeouts, seat reconciliation, AND circuit breakers — 3 concerns | services/system-monitor.service.ts | **MEDIUM** | Split into one service per monitoring domain. |
| 3 | **DIP violation:** `AiSummaryWorker` directly injects `AiSummariesRepository` instead of depending on the `AiSummaryService` abstraction | workers/ai-summary.worker.ts:41-44 | **HIGH** | Worker should only depend on `AiSummaryService`. If the timeout case needs special handling, add a method to the service. |
| 4 | **OCP compliance (positive):** Notification channel system uses the Strategy pattern via `INotificationChannel` interface — adding a channel requires no modifications to existing channel code. | channels/notification-channel.interface.ts, services/notification-dispatch.service.ts:48-53 | ✅ | Excellent design for extensibility. |
| 5 | **SRP compliance (positive):** All channel implementations have exactly one responsibility — delivering via their channel type | channels/ | ✅ | Clean separation. |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | Controllers are thin — only extract params and delegate to services | — | ✅ | No issue found. |
| 2 | Repositories correctly handle all data access | — | ✅ | No issue found (except where services bypass them, see below). |
| 3 | **Service bypasses repository:** `SystemMonitorService` queries `this.db` directly for payment and workshop counts instead of using repositories | services/system-monitor.service.ts:58-71, 106-138, 167-201 | **HIGH** | Extract DB queries into appropriate repositories. |
| 4 | **Worker bypasses service:** `AiSummaryWorker` directly calls `AiSummariesRepository.findByDocumentId()` and `.updateStatus()` | workers/ai-summary.worker.ts:98-105 | **HIGH** | Add a `handleTimeout(documentId)` method to `AiSummaryService` and call that instead. |
| 5 | **Service bypasses repository:** `StudentSyncService.upsertStudent()` calls `this.db` directly | services/student-sync.service.ts:353 | **CRITICAL** | The `students` table likely belongs to the IAM module's domain. Either inject the relevant service from IAM, or create a `StudentsRepository` within the background module. |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1 | `validation.errors?.[0] as NewStudentSyncError["errorReason"]` — nested optional chain, bracket access, and type assertion in one expression | services/student-sync.service.ts:142-144 | **LOW** | Simplify by extracting the error extraction into a helper or by restructuring the `validateRow` return to include a typed first-error field. |
| 2 | `log.payload as Record<string, unknown>?.["recipient"]` — chaining through cast, optional bracket access | services/notification-dispatch.service.ts:114-116 | **LOW** | Can be simplified by extracting `payload = log.payload as Record<string, unknown>` and then accessing `.recipient`. |
| 3 | Most code follows Law of Demeter well — no excessive method chaining beyond 2 levels | — | ✅ | Good adherence overall. |

## 3. Strategic Recommendations

### 3.1 Immediate Fixes (Critical)

1. **Remove direct DB access from services:** `StudentSyncService.upsertStudent()` and `SystemMonitorService` must delegate to repositories. These are architectural violations that undermine the layered architecture guarantees.
2. **Fix the worker bypass:** `AiSummaryWorker` must not directly call `AiSummariesRepository`. Add a `handleTimeout(documentId)` method to `AiSummaryService` instead.
3. **Fix data mapping bugs in `StudentSyncJobResponse.from()`:** `started_at` is hardcoded to `undefined` and `failed_rows`/`error_count` both map to `errorRows`. Verify the schema and fix the mapping.

### 3.2 Short-Term Improvements (High)

1. **Extract duplicated constants:** `KNOWN_GATEWAYS`, `CIRCUIT_KEY_PREFIX`, `DISCREPANCY_THRESHOLD`, and cron last-run keys are duplicated across 2-3 files each. Consolidate into shared constant files.
2. **Split `StudentSyncService`:** Extract row validation (`StudentRowValidator`), CSV parsing (`StudentCsvParser`), and student upsert into separate classes. The current 378-line file has too many responsibilities.
3. **Fix `AiSummaryWorker.withTimeout()` timer leak:** The `setTimeout` in `Promise.race` continues to run after the promise resolves. Clear it on resolution to avoid memory leaks in long-running worker processes.
4. **Replace `Result<any>` returns:** Controllers returning `Result<any>` bypass TypeScript's type system. Use proper DTO types.
5. **Remove TODO comments from production code:** Either implement the stubs or create proper issue tracking. TODO comments in business-logic paths signal incomplete features.

### 3.3 Long-Term Architecture

1. **Consider a shared constants module:** A `background/constants/` directory with circuit-breaker, reconciliation, and cron-last-run constants would eliminate the duplication pattern seen across 3 files.
2. **Data ownership for `students` table:** The `students` table is likely owned by the IAM module. `StudentSyncService` currently accesses it directly. Either IAM should expose a `StudentImportService`, or the background module should have a dedicated repository with clear data ownership boundaries.
3. **Refactor `SystemMonitorService`:** Split into three domain-specific monitor services (payment, reconciliation, circuit-breaker) — each can be tested and extended independently.
4. **Lock abstraction:** If the distributed lock pattern used in `StudentSyncWorker` is needed elsewhere, extract to a shared `LockMechanic` utility.

## Finding Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| NestJS Compliance | 2 | 2 | 2 | 3 | 9 |
| Code Quality | 1 | 6 | 8 | 4 | 19 |
| **Total** | **3** | **8** | **10** | **7** | **28** |

### Key Strengths

- **Excellent Strategy pattern** for notification channels — the `INotificationChannel` interface and registry in `NotificationDispatchService` is clean, extensible, and follows OCP perfectly.
- **All controllers are thin** — they properly extract params and delegate to services with zero business logic.
- **All repositories correctly use `tryCatch`** with `Result<T>` pattern and `systemErrors.internal()` for DB error translation.
- **BullMQ workers are well-structured** — proper `@Processor` decorators, `WorkerHost` extension, and sensible concurrency settings.
- **Security is consistent** — all admin endpoints use JWT auth + ORGANIZER role guard.
- **Consistent use of `@Cron` decorators** with `CronExpression` enums where appropriate.
- **All cron jobs wrap operations in try/catch** ensuring scheduler stability — no single cron failure cascades.

### Key Weaknesses

1. **Direct DB access in services (critical):** Both `SystemMonitorService` and `StudentSyncService` bypass the repository layer, calling `this.db` directly. This is the most significant architectural violation in the module.
2. **Worker bypasses service layer:** `AiSummaryWorker` directly injects and calls `AiSummariesRepository`, creating a dual-update path that could lead to inconsistent state.
3. **Constant duplication across 3 files:** Circuit breaker, reconciliation, and cron key constants are copy-pasted between cron jobs and the system monitor service.
4. **SRP violations in two main services:** `StudentSyncService` (378 lines, 4+ responsibilities) and `SystemMonitorService` (260 lines, 3 concerns) need decomposition.
5. **Production code with TODO placeholders:** 3 TODO comments mark incomplete implementations in the AI summary and student sync pipelines.
6. **Data mapping bugs:** `StudentSyncJobResponse.from()` has likely incorrect mappings for `started_at`, `failed_rows`, and `error_count`.
