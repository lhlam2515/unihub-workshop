# UniHub Workshop — Business Flows

> Tài liệu này mô tả ba luồng nghiệp vụ cốt lõi của hệ thống ở mức logic và thành phần tham gia. Chi tiết cài đặt xem tại `docs/blueprint/specs/`.

---

## 1. Luồng Đăng Ký Workshop Có Phí

**Specs tham chiếu:** `registration-paid.md`, `circuit-breaker.md`
**ADR:** ADR-03 (Optimistic Lock), ADR-07 (Circuit Breaker), ADR-08 (Idempotency)

Luồng gồm hai phase tách biệt, nối tiếp nhau qua trạng thái `registrations.status`:

```
Phase A: "Đăng ký" → status = PENDING
Phase B: "Thanh toán" → status = PAID + mã QR hiệu lực
```

### 1.1 Phase A — Đăng Ký Chỗ

**Thành phần tham gia:** Web App → `booking` module → Redis → PostgreSQL → BullMQ

```
[Student bấm "Đăng ký"]
    │
    ▼
Bước 0 — Rate Limiting
    Kiểm tra 3 tier theo thứ tự:
      T1: IP (60 req/60s)
      T2: User (30 req/60s)
      T3: User × Workshop (5 req/60s)
    Vi phạm bất kỳ tier → 429 + Retry-After
    │
    ▼
Bước 1 — Pre-check Slot (Redis, không chạm DB)
    Cache hit = "0"  → 422 workshop_full (dừng ngay, tiết kiệm DB round-trip)
    Cache miss       → query DB, cache kết quả 10s
    Slot còn         → tiếp tục
    │
    ▼
Bước 2 — Claim Idempotency Key (X-Idempotency-Key từ client)
    Đã COMPLETED     → trả lại response cũ (true duplicate, không ghi thêm)
    Đang IN_PROGRESS → 409 request_in_progress
    Key mới          → INSERT idempotency_keys, locked 30s
    │
    ▼
Bước 3 — Optimistic Lock Transaction (PostgreSQL)
    BEGIN
      UPDATE workshops
        SET seats_available = seats_available - 1, version = version + 1
        WHERE id = :id AND seats_available > 0 AND version = :version
      → 0 rows affected → conflict → retry (tối đa 2 lần, re-read version)
      → vẫn fail sau 2 lần → 503 high_contention

      INSERT registrations (student_id, workshop_id, status='PENDING', qr_code=UUID)
      → UNIQUE conflict → 422 already_registered + ROLLBACK (seats_available không thay đổi)
    COMMIT
    │
    ▼
Bước 4 — Finalize
    UPDATE idempotency_keys SET status='COMPLETED'
    → 201 { registration_id, qr_code }
    │
    ▼
Bước 5 — Async (không block response)
    DEL cache:workshop:{id}:seats
    BullMQ: notification event_type='registration_confirmed' (kèm qr_code cho student)
```

### 1.2 Phase B — Thanh Toán

**Thành phần tham gia:** Web App → `payment` module → Redis (CB state) → Payment Gateway → PostgreSQL → BullMQ

```
[Student bấm "Thanh toán"]
    │
    ▼
Bước 1 — Idempotency Check
    Key COMPLETED  → trả response cũ (không charge lại gateway)
    Key UNRESOLVED → cho phép retry (gateway chưa xác nhận lần trước)
    │
    ▼
Bước 2 — Circuit Breaker Check
    CB = OPEN  → 503 payment_unavailable ngay, không gọi gateway, không claim key mới
    CB = CLOSED / HALF_OPEN → tiếp tục
    │
    ▼
Bước 3 — Claim Payment Idempotency Key
    INSERT payments (status='PENDING', idempotency_key)
    │
    ▼
Bước 4 — Gọi Payment Gateway (timeout 5s)
    200/4xx (kết quả xác định) → xử lý theo mã
    Timeout 5s                 → payment.status = 'UNRESOLVED'
    │
    ▼
Bước 5 — Resolve

    SUCCEEDED → UPDATE registrations SET status='PAID'
                BullMQ: notification 'payment_confirmed'
                → 200 { receipt_id }

    UNRESOLVED → UPDATE payment status='UNRESOLVED', idempotency_key='UNRESOLVED'
                 → 504 { payment_timeout, retry_same_key: true }
                 Client PHẢI dùng lại cùng idempotency_key khi retry

    FAILED     → UPDATE payment status='FAILED', CB ghi failure
                 → 402 { payment_declined, gateway_reason }
```

### 1.3 Xử Lý Lỗi Giữa Chừng

| Tình huống | Hành vi hệ thống |
|---|---|
| Hết chỗ (race condition) | OL UPDATE trả 0 rows → retry → 503 high_contention; slot không bị mất |
| Server crash sau Bước 2 (Phase A) | Key kẹt `IN_PROGRESS` đến hết `locked_until` (30s); client retry sau đó an toàn |
| Gateway timeout | `payment = UNRESOLVED`; reconciliation job định kỳ dò và resolve; client retry cùng key |
| CB mở (5 lỗi liên tiếp hoặc failure rate ≥ 50%/60s) | 503 ngay trong < 5ms; các module khác (`catalog`, v.v.) vẫn hoạt động bình thường |
| Server crash giữa Phase B | Reconciliation job dò `UNRESOLVED` payments và resolve với gateway qua idempotency key |

---

## 2. Luồng Check-In Offline và Đồng Bộ

**Specs tham chiếu:** `checkin-offline.md`
**ADR:** ADR-11 (Offline-First Outbox)

Check-in staff dùng mobile app. App luôn ghi vào SQLite local trước — staff không bao giờ thấy "lỗi mạng" khi quét. Server là **source of truth** cho conflict resolution: **first received at server wins** (không phải first scanned offline).

### 2.1 Luồng Quét QR (tại Device)

**Thành phần tham gia:** Camera → Mobile App → SQLite local

```
[Staff quét QR code của student]
    │
    ▼
Bước 1 — Decode & Validate Format
    QR chứa: qr_code (UUID v4 riêng, không phải registration.id)
    Không đúng UUID v4 format → hiển thị lỗi ngay, không ghi gì
    │
    ▼
Bước 2 — Kiểm tra Duplicate Local
    SELECT local_checkins WHERE qr_code = :qr_code AND status IN ('PENDING', 'SYNCED')
    Đã tồn tại → "QR này đã được quét [trạng thái]" → dừng (không ghi thêm)
    Không có   → tiếp tục
    │
    ▼
Bước 3 — Ghi SQLite (không cần network)
    INSERT local_checkins (local_id=UUID.v4(), qr_code, checked_at=now(), status='PENDING')
    → Hiển thị ngay: "✓ Check-in ghi nhận, đang đồng bộ..."
    UX không bị block bởi network latency
    │
    ▼
Bước 4 — Trigger Sync (background, không block UI)
    Có mạng   → chạy sync ngay (Section 2.2) trong background
    Mất mạng  → "✓ Check-in ghi nhận (offline). Sẽ đồng bộ khi có mạng."
```

### 2.2 Luồng Đồng Bộ Lên Server

**Thành phần tham gia:** Mobile App → `checkin` module (NestJS) → PostgreSQL

Sync được trigger bởi một trong ba điều kiện:

- **(a)** Network change listener phát hiện mạng phục hồi
- **(b)** Timer mỗi 30s nếu còn row `status='PENDING'`
- **(c)** Ngay sau khi ghi local thành công (nếu đang có mạng)

```
Bước 1 — Thu thập batch pending
    SELECT local_checkins WHERE status='PENDING' ORDER BY created_at LIMIT 50
    Empty → bỏ qua, không gọi API
    │
    ▼
Bước 2 — Gửi batch lên server
    POST /checkins/sync (timeout 10s)
    Body: [{ local_id, qr_code, checked_at }, ...]
    │
    ▼
Bước 3 — Xử lý response (per item)

    "ok"        → UPDATE local_checkins SET status='SYNCED', server_id=<checkin.id>
                  UI: check-in thành công

    "duplicate" → UPDATE local_checkins SET status='DUPLICATE'
                  UI: "Đã check-in bởi [staff_name] lúc [time]"

    "rejected"  → UPDATE local_checkins SET status='REJECTED', sync_error=<reason>
                  UI theo reason:
                    qr_invalid        → "QR code không hợp lệ"
                    not_paid          → "Sinh viên chưa hoàn tất thanh toán"
                    workshop_cancelled → "Workshop đã bị hủy"
```

### 2.3 Xử Lý Server-side (First Check-in Wins)

Server nhận batch và xử lý từng item:

```
Với mỗi qr_code trong batch:
  1. Lookup registration (JOIN workshops) bằng qr_code
  2. Validate: registration tồn tại, status='PAID', workshop chưa bị hủy
  3. INSERT checkins ON CONFLICT (registration_id) DO NOTHING

  rowsAffected = 1 → result: "ok"       (check-in đầu tiên, thắng)
  rowsAffected = 0 → result: "duplicate" (đã có check-in trước, kèm thông tin người đến trước)
```

### 2.4 Xử Lý Lỗi Giữa Chừng

| Tình huống | Hành vi hệ thống |
|---|---|
| Hai staff quét cùng QR offline | Cả hai ghi local thành công; khi sync, `ON CONFLICT DO NOTHING` — request đến server trước thắng, request sau nhận `duplicate` |
| JWT hết hạn khi offline | Ghi local vẫn chạy; khi mạng phục hồi, mobile refresh token rồi mới sync |
| Sync timeout (10s) | `local_checkins.status` giữ nguyên `PENDING`; trigger tiếp theo (30s timer) sẽ retry |
| Đồng hồ device lệch giờ | `checked_at` từ device lưu cho audit; `received_at` (server timestamp) dùng để tie-break conflict |
| Mạng không phục hồi suốt sự kiện | Toàn bộ `PENDING` rows sync sau khi sự kiện kết thúc và mạng trở lại; data không mất |

---

## 3. Luồng Nhập Dữ Liệu từ CSV (Nightly)

**Specs tham chiếu:** `csv-import.md`
**ADR:** ADR-12 (Batch Sequential Pipeline)

Pipeline chạy mỗi đêm lúc 02:00 AM (Asia/Ho_Chi_Minh). Mục tiêu: đồng bộ danh sách sinh viên từ legacy system vào bảng `students`. Pipeline có 5 stage tuần tự; invalid rows bị cách ly, không làm dừng valid rows.

**Thành phần tham gia:** Cron Scheduler → `csv-sync` module → Object Storage → PostgreSQL → BullMQ

### 3.1 Các Stage

Pipeline gồm 5 stage thực thi tuần tự. Stage 0–1 chạy trong cron/service; Stage 1 kết thúc bằng enqueue — các stage còn lại chạy trong Worker (process riêng).

```
Stage 0 — File Discovery  (StudentSyncSchedulerCron · cron 02:00 AM Asia/Ho_Chi_Minh)

  ListObjectsV2 prefix="students_", sort by LastModified DESC
  Không có file → ghi FAILED vào student_sync_jobs, EXIT
  Có file → sourceFileName = newest key

  → StudentSyncService.triggerSync(sourceFileName, triggered_by='CRON'|'MANUAL')
      INSERT student_sync_jobs (status='RUNNING', triggered_by, source_file_name)
      Enqueue queue: student-sync { jobId, sourceFileName }
                    │
                    │  (BullMQ — attempts: 1, no retry)
                    ▼
Stage 1 — Worker Acquisition  (StudentSyncWorker · concurrency: 1)

  Consume job từ queue: student-sync
  Acquire Redis lock: student-sync:job:{jobId}:lock (SET NX · TTL 3600s)
    Lock fail → job đang xử lý ở instance khác → skip, không throw
    Lock acquired → delegate: StudentSyncService.processJob(jobId)
                    │
                    ▼
Stage 2 — Scan Pass  (StudentSyncService.stageScan — 1st stream)

  GetObject(sourceFileName) → Readable stream → csv-parse
  Validate CSV headers: phải có student_code (hoặc student_id) + email + full_name
    Header invalid → throw → job FAILED
  Build dedup map: student_code → last_row_number
    Duplicate student_code trong file → giữ row cuối cùng (last-wins)
  Output: { totalRows, lastSeenRow: Map<code, rowNumber> }
                    │
                    ▼
Stage 3 — Validate & Upsert Pass  (StudentSyncService.stageProcess — 2nd stream)

  GetObject(sourceFileName) → re-stream cùng file
  Per row:
    Bỏ qua nếu không phải lần xuất hiện cuối (lastSeenRow check)
    Validate student_code: /^\d{8}$/
    Validate email: RFC 5321 basic format
    Validate full_name: non-empty sau trim()
    Invalid → append to errors list → StudentSyncErrorsRepository.createBatch

  Valid rows → gom batch 500 rows → flushUpsertBatch():
    INSERT INTO students (...) VALUES (...)
      ON CONFLICT (student_id) DO UPDATE
        SET email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            updated_at = now()
        -- password_hash KHÔNG có trong EXCLUDED → không bao giờ bị ghi đè
    Batch fail → fallback: individual upsert từng row (error isolation — INV-02)
  Mỗi batch commit ngay — không có global transaction
  Crash giữa chừng: rows đã upsert không rollback (idempotent khi chạy lại)
                    │
                    ▼
Stage 4 — Error Quarantine & Finalization

  Nếu có errors:
    StorageService.uploadText(
      content: buildErrorCsv(errors),   -- cột gốc + error_reason + row_number
      key: "errors/students_YYYY-MM-DD-{jobId}.csv"
    )  -- fire-and-forget: upload fail chỉ log warning, không fail pipeline

  UPDATE student_sync_jobs:
    status = SUCCESS | PARTIAL_FAILURE | FAILED
    total_rows, processed_rows, error_rows
    completed_at = now()
    error_log_url = public URL của error file (nếu có)

  IF error_rows > 0:
    NotificationsService.notify → enqueue queue: notification
    Type: CSV_IMPORT_COMPLETED_WITH_ERRORS → BTC users

  Release Redis lock
```

**Manual trigger:** `POST /admin/imports/trigger` (role BTC) với `{ filePath }` → cùng `triggerSync()` flow, `triggered_by = 'MANUAL'`.  
**Audit:** `GET /admin/imports`, `GET /admin/imports/{id}`, `GET /admin/imports/{id}/errors`, `GET /admin/imports/{id}/errors/download`.

### 3.2 Xử Lý Lỗi Giữa Chừng

| Tình huống | Hành vi hệ thống |
|---|---|
| Không có file CSV | `student_sync_jobs` ghi FAILED, EXIT; dữ liệu sinh viên ngày hôm trước vẫn nguyên |
| Header CSV sai (thiếu cột bắt buộc) | Stage 2 ném exception → Worker cập nhật `student_sync_jobs.status = 'FAILED'`, release lock |
| Pipeline crash giữa Stage 3 (upsert) | Rows đã upsert **không rollback**; `student_sync_jobs.status` kẹt `'RUNNING'` đến khi Redis lock hết TTL (3600s); chạy lại an toàn nhờ idempotency |
| Hai trigger chạy đồng thời | Worker thứ 2 fail acquire Redis lock → skip ngay, không xử lý chồng |
| Error rows vượt ngưỡng | Ghi `student_sync_errors`, quarantine CSV lên R2, gửi notification BTC; valid rows đã upsert không bị ảnh hưởng |
| Error file upload thất bại (Stage 4) | Fire-and-forget: log warning, pipeline tiếp tục → `student_sync_jobs` vẫn được cập nhật thành công |
| Sinh viên có trong CSV nhưng chưa có account | Upsert vào `students` thành công; account auth tách biệt — không ảnh hưởng registrations hiện tại |

### 3.3 Tính Chất Bất Biến

- **Idempotency:** Chạy cùng file N lần → bảng `students` có cùng trạng thái; không tạo duplicate
- **Error Isolation:** Invalid rows không làm valid rows mất; một row lỗi không ảnh hưởng row khác
- **No Downtime:** Upsert PostgreSQL không block `SELECT` từ các module khác trong khi pipeline chạy
- **Password Safe:** `password_hash` không bị ghi đè khi upsert cập nhật thông tin

---

## Tóm Tắt Thành Phần Tham Gia

| Luồng | Module Backend | Storage | Async |
|---|---|---|---|
| Đăng ký có phí (Phase A) | `booking` | Redis + PostgreSQL | BullMQ queue: `notification` (student) |
| Đăng ký có phí (Phase B) | `payment` | Redis (CB state) + PostgreSQL | BullMQ queue: `notification` (student) |
| Check-in offline | `checkin` | SQLite (mobile) + PostgreSQL | — |
| CSV nightly import | `csv-sync` | Object Storage (R2) + PostgreSQL (`student_sync_jobs`, `student_sync_errors`, `students`) | BullMQ queue: `student-sync` + queue: `notification` (BTC) |
