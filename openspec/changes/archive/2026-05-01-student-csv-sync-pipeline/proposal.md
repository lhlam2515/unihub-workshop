## Why

Student data management currently has no bulk import mechanism. Organizers must create student accounts individually through the UI or API, which is impractical for university-wide workshops with hundreds of participants. F09 requires a CSV-based batch import pipeline that validates, deduplicates, and synchronizes student records from external sources (enrollment systems, registrar exports).

Without this, organizers cannot:
- Onboard large student cohorts efficiently
- Sync updated student information (faculty, class year, email) from institutional systems
- Detect and report data quality issues (missing fields, invalid emails, duplicates)

## What Changes

- Implement `StudentSyncJobsRepository` — CRUD for tracking sync job lifecycle (create, updateStatus, findById, findMany)
- Implement `StudentSyncErrorsRepository` — batch error storage and retrieval per job
- Implement `StudentSyncService` — orchestration layer: trigger sync, process CSV rows with validation and upsert, collect errors, finalize status
- Implement `StudentSyncWorker` — BullMQ consumer with Redis distributed lock for concurrency control
- Wire `StudentSyncAdminController` — 4 ORGANIZER-protected endpoints for triggering, listing, and inspecting sync jobs
- Update `TriggerStudentSyncDto` — add createZodDto wrapper and pagination DTOs

## Capabilities

### New Capabilities
- `student-csv-sync-pipeline`: Complete F09 CSV student sync — background job processing, row-level validation, upsert with ON CONFLICT DO UPDATE, partial failure model (SUCCESS / PARTIAL_FAILURE / FAILED), and distributed lock to prevent duplicate processing

### Modified Capabilities
- `background-module`: Added StudentSyncService, StudentSyncWorker, StudentSyncAdminController, and both repositories to the module providers

## Impact

- **Affected code**: 6 files in `apps/server/src/modules/background/` (2 repositories, 1 service, 1 worker, 1 controller, 1 DTO)
- **Affected specs**: New `specs/student-csv-sync-pipeline/spec.md` covering FR-F09-001 through FR-F09-004
- **Dependencies**: Requires W1 BullMQ queue infrastructure (STUDENT_SYNC_QUEUE already defined in `queue.constants.ts`); requires `students` table schema with `student_code` unique constraint
- **Breaking changes**: None — all endpoints and workers are new additions
- **External systems**: None — all state managed through Redis (distributed locks), PostgreSQL (job tracking, student records), and BullMQ (background queue)
