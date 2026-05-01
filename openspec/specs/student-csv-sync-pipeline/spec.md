# Student CSV Sync Pipeline

Purpose: Import student data from CSV files via batch-sequential processing with error tracking and partial failure handling.

## ADDED Requirements

### Requirement: Trigger Sync Job

**Source:** FR-F09-001
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

The system SHALL allow ORGANIZER to trigger a student sync job from a CSV file in Object Storage via `POST /admin/student-sync`. A `student_sync_jobs` record SHALL be created with `status = RUNNING` and a BullMQ job SHALL be enqueued immediately. The endpoint SHALL return 202 Accepted with `job_id`.

**Validation:** `source_file_name` — required string, 1–500 characters.

#### Scenario: File submitted successfully

- **WHEN** ORGANIZER calls `POST /admin/student-sync` with a valid `source_file_name`
- **THEN** a `student_sync_jobs` record is created with `status = RUNNING`
- **AND** HTTP 202 is returned with `{ job_id, status: "RUNNING", triggered_at }`

#### Scenario: File existence not validated

- **WHEN** ORGANIZER triggers sync with a non-existent `source_file_name`
- **THEN** HTTP 202 is still returned — file validation is deferred to the worker

---

### Requirement: List Sync Jobs

**Source:** FR-F09-001
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

The system SHALL return a paginated list of all sync jobs via `GET /admin/student-sync`, ordered by `triggered_at DESC`. Each entry SHALL include status, total rows, processed rows, and error rows.

#### Scenario: Jobs listed with pagination

- **WHEN** ORGANIZER calls `GET /admin/student-sync?page=1&limit=20`
- **THEN** the response includes `items[]` with sync job summaries and pagination metadata

---

### Requirement: Get Sync Job Status

**Source:** FR-F09-001
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

The system SHALL return full metadata for a single sync job via `GET /admin/student-sync/:jobId`.

#### Scenario: Job detail with partial failure

- **WHEN** ORGANIZER calls `GET /admin/student-sync/:jobId` for a job with partial errors
- **THEN** the response includes `status = PARTIAL_FAILURE`, `total_rows`, `processed_rows`, `error_rows`

#### Scenario: Non-existent job

- **WHEN** ORGANIZER calls `GET /admin/student-sync/:jobId` for a non-existent job
- **THEN** the system returns `INTERNAL_ERROR`

**Status flow:** `RUNNING` → `SUCCESS` | `PARTIAL_FAILURE` | `FAILED`

---

### Requirement: Get Sync Job Errors

**Source:** FR-F09-002
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

The system SHALL return paginated errors for a specific sync job via `GET /admin/student-sync/:jobId/errors`, ordered by `row_number ASC`.

#### Scenario: Errors retrieved with details

- **WHEN** ORGANIZER calls `GET /admin/student-sync/:jobId/errors`
- **THEN** the response includes error rows with `row_number`, `raw_data`, `error_reason`, `error_detail`

---

### Requirement: Parse and Upsert Student Records

**Source:** FR-F09-002
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

The worker SHALL read each CSV row, validate fields (student_code, email, full_name), and UPSERT into the `students` table using `student_code` as the match key. Error rows SHALL be recorded in `student_sync_errors` without stopping the job.

**Row Validation:**
- `student_code` — required, max 20 chars
- `email` — required, valid email format
- `full_name` — required

**Upsert Behavior:**
- Match key: `student_code` (unique constraint `uq_students_student_code`)
- On conflict: UPDATE `full_name`, `email_edu`, `faculty`, `class_year`, `last_synced_at`
- On no conflict: INSERT all fields plus `last_synced_at = NOW()`

#### Scenario: All rows succeed

- **WHEN** all CSV rows pass validation
- **THEN** all rows are upserted successfully, job status = `SUCCESS`, `error_rows = 0`

#### Scenario: Partial rows fail

- **WHEN** some CSV rows have missing or invalid fields
- **THEN** valid rows are upserted, invalid rows are recorded in `student_sync_errors`, job status = `PARTIAL_FAILURE`

#### Scenario: All rows fail

- **WHEN** no CSV rows pass validation
- **THEN** job status = `FAILED`, all rows recorded in `student_sync_errors`

**Status Determination:**
| Condition | Final Status |
|-----------|-------------|
| `errorRows === 0` | `SUCCESS` |
| `0 < errorRows < totalRows` | `PARTIAL_FAILURE` |
| `errorRows === totalRows` | `FAILED` |
