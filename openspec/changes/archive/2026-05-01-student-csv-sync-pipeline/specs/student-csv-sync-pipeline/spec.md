# Student CSV Sync Pipeline — Specification

## FR-F09-001: Trigger Sync Job

**Endpoint:** `POST /admin/student-sync`

**Description:** Creates a new sync job record and enqueues it for background processing.

**Request:**
```json
{
  "source_file_name": "s3://bucket/uploads/students-2024-04-28.csv"
}
```

**Validation:**
- `source_file_name` — required string, 1–500 characters

**Response (202 Accepted):**
```json
{
  "job_id": "uuid",
  "status": "RUNNING",
  "triggered_at": "2024-04-28T10:00:00Z"
}
```

**Error cases:**
- `INTERNAL_ERROR` — database write or queue push fails

**Business rules:**
- Job record is created with status `RUNNING` before queue push
- BullMQ job is added immediately after DB insert (fire-and-forget)
- File existence is NOT validated at trigger time

---

## FR-F09-002: List Sync Jobs

**Endpoint:** `GET /admin/student-sync`

**Description:** Returns paginated list of all sync jobs, ordered by `triggered_at` DESC (most recent first).

**Query parameters:**
- `page` — integer, min 1, default 1
- `limit` — integer, min 1, max 100, default 20

**Response (200):**
```json
{
  "items": [
    {
      "job_id": "uuid",
      "source_file_name": "...",
      "status": "SUCCESS",
      "total_rows": 150,
      "processed_rows": 148,
      "error_rows": 2,
      "triggered_at": "2024-04-28T10:00:00Z",
      "completed_at": "2024-04-28T10:01:30Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

## FR-F09-003: Get Sync Job Status

**Endpoint:** `GET /admin/student-sync/:jobId`

**Description:** Returns full metadata and status for a single sync job.

**Response (200):**
```json
{
  "job_id": "uuid",
  "source_file_name": "...",
  "status": "PARTIAL_FAILURE",
  "total_rows": 150,
  "processed_rows": 148,
  "error_rows": 2,
  "triggered_at": "2024-04-28T10:00:00Z",
  "completed_at": "2024-04-28T10:01:30Z"
}
```

**Error cases:**
- `INTERNAL_ERROR` — job not found (DB returned null)

**Status flow:**
- `RUNNING` → job is actively being processed (or queued)
- `SUCCESS` → all rows processed without errors
- `PARTIAL_FAILURE` → some rows succeeded, some failed
- `FAILED` → all rows failed (or CSV could not be parsed)

---

## FR-F09-004: Get Sync Job Errors

**Endpoint:** `GET /admin/student-sync/:jobId/errors`

**Description:** Returns paginated errors for a specific sync job, ordered by `row_number` ASC.

**Query parameters:**
- `page` — integer, min 1, default 1
- `limit` — integer, min 1, max 100, default 20

**Response (200):**
```json
{
  "items": [
    {
      "error_id": "uuid",
      "row_number": 42,
      "raw_data": "{\"student_code\":\"\",\"email\":\"invalid\",\"full_name\":\"\"}",
      "error_reason": "MISSING_FIELD",
      "error_detail": "student_code is required; email is not a valid email address",
      "created_at": "2024-04-28T10:01:30Z"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

---

## Processing Flow (Internal)

### CSV Row Validation

For each row, validate:
| Field | Rule | Error Reason |
|-------|------|-------------|
| `student_code` | Required, max 20 chars | `MISSING_FIELD` / `INVALID_FORMAT` |
| `email` | Required, valid email format | `MISSING_FIELD` / `INVALID_FORMAT` |
| `full_name` | Required | `MISSING_FIELD` |

### Student Upsert

Match key: `student_code` (unique constraint `uq_students_student_code`)

On conflict (student exists): UPDATE `full_name`, `email_edu`, `faculty`, `class_year`, `last_synced_at`

On no conflict (new student): INSERT all fields plus `last_synced_at = NOW()`

### Status Determination

| Condition | Final Status |
|-----------|-------------|
| `errorRows === 0` | `SUCCESS` |
| `0 < errorRows < totalRows` | `PARTIAL_FAILURE` |
| `errorRows === totalRows` | `FAILED` |
