## Context

The background module already has the STUDENT_SYNC_QUEUE defined in `queue.constants.ts` and registered in `SharedQueueModule`. The database schema includes `student_sync_jobs` and `student_sync_errors` tables (async.schema.ts) with the `students` table providing a `student_code` unique constraint. The existing `NotificationWorker` establishes the BullMQ worker pattern (extending `WorkerHost` with `@Processor`).

What's missing is the service orchestration layer and worker that connect these pieces into a working pipeline.

## Goals / Non-Goals

**Goals:**
- Implement sync job repository (CRUD with status tracking and pagination)
- Implement sync error repository (batch insert and paginated retrieval)
- Implement sync service (trigger, process with validation/upsert, status queries)
- Implement BullMQ worker with Redis distributed lock
- Wire 4 admin REST endpoints (POST trigger, GET list, GET by id, GET errors)
- Support partial failure model: SUCCESS / PARTIAL_FAILURE / FAILED statuses

**Non-Goals:**
- Real CSV file parsing (stubbed — will use fast-csv or papaparse in a follow-up)
- Object Storage integration for CSV retrieval (stubbed — placeholder for S3/MinIO)
- User account auto-creation from CSV (students table only, user linkage is TODO)
- Real-time sync progress via WebSockets (polling-based status endpoint only)
- Retry logic for failed sync jobs (one-shot only — organizer re-triggers manually)

## Decisions

### D1: Worker extends WorkerHost with `@Processor`, not `@Process()`

The existing `NotificationWorker` pattern uses `extends WorkerHost` + `@Processor(queueName)` and overrides the `process()` method. The `@Process()` decorator from `@nestjs/bullmq` is not available in the current version. This pattern is followed for consistency and avoids any decorator compatibility issues.

**Alternative considered**: Using `@Process()` decorator directly. Rejected because it's not exported by the installed `@nestjs/bullmq` version.

### D2: Redis distributed lock for worker concurrency

Prevents two worker instances from processing the same sync job simultaneously. Uses Redis `SET key value EX seconds NX` via `RedisService.setNx()`. Lock key format: `student-sync:job:{jobId}:lock` with a 3600-second TTL. If the lock cannot be acquired (another worker holds it), the job is silently skipped.

**Alternative considered**: BullMQ job deduplication via `jobId` option. Rejected because dedup only prevents enqueueing the same job — it doesn't protect against concurrent processing of the same job across worker instances.

### D3: Batch-Sequential processing with partial failure model

Rows are processed sequentially (not in parallel) to maintain row ordering and simplify error attribution. Each row is validated, then upserted. Errors are collected in-memory and flushed as a single batch insert at the end. The final status is:
- `SUCCESS` — zero errors
- `PARTIAL_FAILURE` — some rows succeeded, some failed
- `FAILED` — all rows failed

**Alternative considered**: Parallel row processing via Promise.all. Rejected because it complicates error collection and row ordering, and the CSV import is a bulk administrative operation, not a latency-sensitive user-facing feature.

### D4: Repository returns `Result<T>` via `tryCatch`

All repository methods wrap Drizzle ORM calls in `tryCatch(... , err => systemErrors.internal(err))` to map database errors to the application's Result pattern. This is consistent with every other repository in the codebase (NotificationLogsRepository, etc.).

### D5: Import order follows project convention

The project's ESLint config enforces strict import ordering via `import/order`. Third-party packages are sorted alphabetically within their group, `@/` path aliases are sorted by path, and type imports are interleaved with value imports at the correct alphabetical position.

## Risks / Trade-offs

- **[Risk] Direct DB injection in `upsertStudent()`** — The service injects `DATABASE_CONNECTION` and `DATABASE_SCHEMA` for the `upsertStudent` method, which bypasses the repository layer. This is a pragmatic trade-off: creating a full `StudentsRepository` for a single stub method is over-engineering. When CSV parsing is enabled, this should be extracted into a proper repository.
- **[Risk] No CSV file validation before triggering** — The `triggerSync` endpoint accepts a `source_file_name` string without verifying the file exists in Object Storage. A job will be created and enqueued, but `parseCSV` (currently a stub returning empty rows) will succeed vacuously. Real CSV parsing should include file existence validation.
- **[Trade-off] Student code is the sole upsert match key** — Uses the `uq_students_student_code` unique constraint for `ON CONFLICT DO UPDATE`. Updates `full_name`, `email_edu`, `faculty`, and `class_year` on conflict. This assumes student codes are stable identifiers across sync runs, which is reasonable for university systems.
