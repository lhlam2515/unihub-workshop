## 1. Student Sync Jobs Repository

- [x] 1.1 Implement `create(data)` — INSERT into `student_sync_jobs` with `.returning()`, wrapped in `tryCatch`
- [x] 1.2 Implement `updateStatus(id, status, counts?)` — UPDATE with optional row counts, set `completed_at` for terminal statuses
- [x] 1.3 Implement `findById(id)` — SELECT WHERE `job_id = id`, return single record or null
- [x] 1.4 Implement `findMany(pagination)` — SELECT with `ORDER BY triggered_at DESC`, limit/offset + total count via `count(*)`

## 2. Student Sync Errors Repository

- [x] 2.1 Implement `createBatch(errors)` — batch INSERT with `.values()` and `.returning()`
- [x] 2.2 Implement `findByJobId(jobId, pagination)` — SELECT WHERE `job_id = jobId`, `ORDER BY row_number ASC`, limit/offset + total count

## 3. Student Sync Service

- [x] 3.1 Implement `triggerSync(sourceFileName)` — create job record, push to `STUDENT_SYNC_QUEUE` via `@InjectQueue()`, return job metadata
- [x] 3.2 Implement `processJob(jobId)` — load job → update to RUNNING → parse CSV (stub) → validate rows with type-narrowed checks → upsert students → batch save errors → finalize status (SUCCESS/PARTIAL_FAILURE/FAILED)
- [x] 3.3 Implement `getJob(jobId)` — delegate to repo, return job or INTERNAL_ERROR
- [x] 3.4 Implement `getJobErrors(jobId, pagination)` — delegate to errors repo
- [x] 3.5 Implement `listJobs(pagination)` — delegate to jobs repo `findMany`
- [x] 3.6 Implement `parseCSV(csvUrl)` — stub returning empty rows (TODO for real CSV parsing)
- [x] 3.7 Implement `validateRow(row)` — check required fields with `typeof` narrowing (student_code, email, full_name)
- [x] 3.8 Implement `upsertStudent(row)` — Drizzle `INSERT ON CONFLICT DO UPDATE` on `studentCode`

## 4. Student Sync Worker

- [x] 4.1 Add `@Processor(STUDENT_SYNC_QUEUE, { concurrency: 1 })` to class
- [x] 4.2 Extend `WorkerHost` and override `process(job)` method
- [x] 4.3 Implement `acquireLock(jobId, ttlSeconds)` — Redis `SET NX` with lock key `student-sync:job:{jobId}:lock`
- [x] 4.4 Implement `releaseLock(jobId)` — Redis `DEL` on lock key
- [x] 4.5 Wrap `processJob` call in lock acquire/release with `try/finally`

## 5. Student Sync Admin Controller

- [x] 5.1 Wire `POST /admin/student-sync` → `triggerSync(dto)`, returns 202 Accepted
- [x] 5.2 Wire `GET /admin/student-sync` → `listJobs(query)` with pagination DTO
- [x] 5.3 Wire `GET /admin/student-sync/:jobId` → `getJobStatus(jobId)`
- [x] 5.4 Wire `GET /admin/student-sync/:jobId/errors` → `getJobErrors(jobId, query)` with pagination DTO

## 6. DTO Updates

- [x] 6.1 Export `TriggerStudentSyncDto` class extending `createZodDto(TriggerStudentSyncSchema)`
- [x] 6.2 Add `ListSyncJobsQueryDto` with page/limit validation
- [x] 6.3 Add `ListSyncJobErrorsQueryDto` with page/limit validation

## 7. Verification

- [x] 7.1 Run `pnpm check-types --filter=server` — passes
- [x] 7.2 Run `pnpm build --filter=server` — passes
- [x] 7.3 Run `pnpm lint --filter=server` — no errors in W5 files
