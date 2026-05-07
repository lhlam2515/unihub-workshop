# Spec: CSV Import Pipeline (`csv-import`)

> **ASR hiện thực hóa:** ASR-8 (Batch Robustness — file lỗi không sập hệ thống)
>
> **ADR tham chiếu:** ADR-12 (Batch Sequential Pipeline), ADR-02 (Schema — students, import_logs), ADR-09 (Notification — báo lỗi cho BTC)
>
> **Trade-off chủ đạo:** Robustness over Completeness — invalid rows bị quarantine, không làm valid rows mất. Pipeline có thể chạy lại nhiều lần với cùng file mà không tạo duplicate (idempotent).
>
> **Boundary:** Pipeline là one-way sync từ legacy system sang UniHub. Không ghi ngược lại legacy. Window tối đa ~24h giữa khi sinh viên xuất hiện trong CSV và khi họ có account trong hệ thống.

---

## 1. Mô tả

Pipeline chạy mỗi đêm lúc 02:00 AM (Asia/Ho_Chi_Minh), đọc file CSV từ thư mục `input/`, validate, và upsert vào bảng `students`. Invalid rows được ghi ra file error riêng — không làm dừng pipeline, không làm mất valid rows.

Pipeline có 5 stage tuần tự. Stage 4 (Upsert) là idempotent: chạy cùng file nhiều lần cho cùng kết quả.

---

## 2. Luồng chính

### Stage 1 — Scheduler

```
Schedule: Cron 02:00 AM Asia/Ho_Chi_Minh hàng ngày
Config bắt buộc: TZ=Asia/Ho_Chi_Minh (không dùng UTC mặc định của container)
Trigger thủ công: POST /admin/imports/trigger (BTC role) — dùng cho retry sau lỗi

Trước khi bắt đầu — Concurrent Run Protection:
  SELECT id FROM import_logs
  WHERE status = 'IN_PROGRESS'
    AND run_at > now() - interval '2 hours';   -- stale lock guard

  Nếu tìm thấy:
    → LOG WARNING: "Pipeline đang chạy [id]. Bỏ qua lần trigger này."
    → EXIT (không raise error — cron sẽ retry tự động ngày mai)

Tìm file CSV mới nhất:
  Pattern: students_YYYY-MM-DD.csv trong thư mục input/
  Ưu tiên: file có ngày gần nhất

Nếu không có file:
  INSERT INTO import_logs (..., status='FAILED', triggered_by='CRON')
    với note: "No CSV file found"
  → LOG WARNING, EXIT (hệ thống vẫn chạy với dữ liệu cũ)

Nếu có file:
  INSERT INTO import_logs
    (id, run_at, triggered_by, status)
  VALUES
    (gen_random_uuid(), now(), 'CRON', 'IN_PROGRESS');
  → Tiếp tục Stage 2 với import_log_id
```

### Stage 2 — Parse & Format Split

```
Phương pháp: Streaming parser — đọc và xử lý từng batch 500 rows
             KHÔNG load toàn bộ file vào RAM
             Bắt buộc: file lớn (>10MB trong tương lai) phải được handle

Expected CSV format:
  Header row: student_id,email,full_name
  Encoding: UTF-8
  Delimiter: comma (,)
  Line ending: LF hoặc CRLF (cả hai đều accept)

FOR EACH batch of 500 rows:

  FOR EACH row in batch:
    Validate format:
      - Đủ 3 cột (student_id, email, full_name)
      - Encoding hợp lệ (không có byte sequence lỗi)
      - Không có NUL character
      - Độ dài không vượt giới hạn cột (student_id ≤ 50, email ≤ 255, full_name ≤ 255)

    Nếu format lỗi:
      → Thêm vào invalid_rows với reason = "format_error" | "encoding_error" | "missing_column"
      CONTINUE

    → Thêm vào valid_rows_stage2

Chuyển valid_rows_stage2 sang Stage 3
```

### Stage 3 — Business Rule Validation

```
FOR EACH row in valid_rows_stage2:

  Validate student_id:
    Pattern: "SV" + 8 chữ số (regex: ^SV\d{8}$)
    Nếu không match:
      → Thêm invalid_rows với reason = "invalid_student_id_format"
      CONTINUE

  Validate email:
    Pattern: RFC 5321 basic check (có @ và domain)
    Nếu không hợp lệ:
      → Thêm invalid_rows với reason = "invalid_email_format"
      CONTINUE

  Validate full_name:
    Không được empty sau trim()
    Nếu empty:
      → Thêm invalid_rows với reason = "empty_full_name"
      CONTINUE

  → Thêm vào valid_rows_stage3

Xử lý duplicate trong file (cùng student_id xuất hiện nhiều lần):
  Group by student_id
  Nếu có duplicates → giữ row CUỐI CÙNG (last-wins), LOG warning:
    "Duplicate student_id trong file: SV12345678 (3 occurrences, keeping last)"
  -- Đây là data quality issue từ legacy system, không phải lỗi pipeline

Chuyển valid_rows_stage3 (deduplicated) sang Stage 4
```

### Stage 4 — Idempotent Upsert

```
FOR EACH batch of 500 rows from valid_rows_stage3:

  INSERT INTO students
    (student_id, email, full_name, updated_at)
  VALUES
    (:id1, :email1, :name1, now()),
    (:id2, :email2, :name2, now()),
    ...  -- 500 rows per batch
  ON CONFLICT (student_id) DO UPDATE
    SET email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        updated_at = now();

  success_count += rowsAffected (INSERT hoặc UPDATE)

Tính năng idempotency:
  - Chạy cùng file ngày hôm nay và ngày mai → kết quả giống hệt
  - Không tạo duplicate, không xóa data cũ, không có partial state
  - password_hash KHÔNG bị ghi đè (EXCLUDED không include password_hash)

Tính cách ly với hệ thống đang chạy:
  - Upsert PostgreSQL không block SELECT từ module khác
  - Nếu pipeline crash giữa chừng, hệ thống tiếp tục với dữ liệu của lần import gần nhất
  - Rows đã upsert không bị rollback (stage-wise commit, không phải all-or-nothing)
```

### Stage 5 — Error Quarantine và Audit

```
Ghi file error (nếu có invalid rows):
  Path: errors/students_YYYY-MM-DD.csv
  Format: CSV với các cột gốc + cột thêm: error_reason, row_number
  
  Ví dụ:
    student_id,email,full_name,error_reason,row_number
    SV999,not-an-email,Nguyễn Văn A,invalid_email_format,42
    ,,,missing_column,157

Ghi import log:
  UPDATE import_logs
    SET status        = 'SUCCESS',  -- hoặc 'FAILED' nếu không có file / crash
        total_rows    = :total,
        success_count = :success,
        failed_count  = :failed,
        error_file_path = :error_path  -- NULL nếu failed_count = 0
  WHERE id = :import_log_id;

Gửi notification cho BTC (nếu failed_count > 0):
  addJob notification * {
    event_type: 'csv_import_completed_with_errors',
    user_id:    <btc_users>,
    payload:    {
      date:           'YYYY-MM-DD',
      total_rows:     :total,
      success_count:  :success,
      failed_count:   :failed,
      error_file_url: '/admin/imports/errors/YYYY-MM-DD'
    }
  }

Nếu failed_count = 0:
  → Không gửi notification (pipeline thành công im lặng)
```

---

## 3. Kịch bản lỗi

### E-01: Không tìm thấy file CSV

```
Điều kiện: Không có file khớp pattern students_YYYY-MM-DD.csv trong input/
Hành vi: Log warning vào import_logs với status='FAILED', note='no_file_found'
         EXIT — không raise exception, không restart
Hệ thống: Tiếp tục chạy với dữ liệu sinh viên của lần import gần nhất
Recovery: BTC đặt file vào đúng thư mục, trigger manual qua admin UI
```

### E-02: File không đúng format UTF-8

```
Điều kiện: Legacy system export file với encoding khác (ví dụ: Windows-1258)
Hành vi: Streaming parser detect encoding error ở byte level
         Row bị quarantine với reason = "encoding_error"
         Pipeline tiếp tục với các row hợp lệ
Recovery: BTC yêu cầu legacy system re-export với UTF-8, hoặc convert file trước khi đặt vào input/
```

### E-03: File rỗng (0 rows data, chỉ có header hoặc empty)

```
Điều kiện: File tồn tại nhưng không có data row
Hành vi: total_rows = 0, success_count = 0, failed_count = 0
         Import log status = 'SUCCESS' (không có gì để fail)
         Không gửi notification
Note: Đây là valid state — legacy system có thể export file rỗng nếu không có sinh viên mới
```

### E-04: Pipeline crash giữa chừng (Stage 4)

```
Điều kiện: Process crash sau khi upsert batch 1-5/10
Hành vi: import_logs.status = 'IN_PROGRESS' (không được update về success/failed)
         Rows của batch 1-5 đã được upsert (committed to DB)
         Rows của batch 6-10 chưa được upsert

Recovery:
  Concurrent run protection sẽ block run mới trong 2 giờ
  Sau 2 giờ: cron trigger lại với cùng file → upsert idempotent → không tạo duplicate
  Manual recovery: BTC trigger ngay qua admin UI (nếu cần)
  Stale lock guard: import_logs WHERE status='IN_PROGRESS' AND run_at > now() - 2h
```

### E-05: Duplicate student_id trong cùng file

```
Điều kiện: Legacy system export file có cùng student_id 2 lần (data quality issue)
Hành vi: Stage 3 detect duplicate, giữ row cuối cùng (last-wins), log warning:
         "Duplicate in file: SV12345678 (2 occurrences)"
         Row đầu bị drop, row cuối được upsert
Không phải invalid_row — không được quarantine vào error file
BTC: Có thể xem warning trong import_logs nếu cần audit
```

### E-06: student_id vi phạm FK constraint (đã có registrations)

```
Điều kiện: student_id đang có registrations, pipeline UPDATE email/full_name
Hành vi: Upsert chỉ UPDATE email, full_name, updated_at
         Không ảnh hưởng registrations (FK vẫn hợp lệ)
         Không phải lỗi — là expected behavior (cập nhật thông tin sinh viên)
```

### E-07: Concurrent pipeline run (hai trigger cùng lúc)

```
Điều kiện: Cron trigger và manual trigger cùng thời điểm
Hành vi: Trigger thứ 2 check import_logs → tìm thấy status='IN_PROGRESS'
         → LOG WARNING, EXIT không làm gì
Chỉ có 1 pipeline chạy tại một thời điểm
```

### E-08: Failed_count > acceptable threshold

```
Hiện tại: Không có auto-abort threshold — pipeline luôn chạy đến hết
BTC nhận notification khi failed_count > 0
BTC quyết định có cần action không (download error file, liên hệ legacy team)
Note: Nếu sau này cần threshold (ví dụ: abort nếu >10% rows fail), thêm config
      threshold ở Stage 3, không thay đổi Stage 4
```

### E-09: Window 24h — sinh viên chưa có account

```
Điều kiện: Sinh viên vừa được thêm vào legacy system, CSV chưa được export đêm nay
Hành vi: Sinh viên không có account trong hệ thống → không đăng ký được workshop
Window: Tối đa ~24h kể từ khi legacy system cập nhật
Acceptable: Workshop đăng ký trước nhiều ngày. 24h window không ảnh hưởng thực tế.
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — Idempotency:**
Chạy pipeline với cùng file N lần → bảng `students` có cùng trạng thái sau mỗi lần.
Không tạo duplicate, không xóa data từ lần trước, không có partial state visible to other modules.

**INV-02 — Error Isolation:**
Invalid rows KHÔNG làm pipeline dừng.
Invalid rows KHÔNG làm valid rows mất.
Một row lỗi không ảnh hưởng xử lý các row khác.

**INV-03 — No Downtime cho Hệ thống Đang Chạy:**
Pipeline chạy trong `csv-sync` module không block `SELECT` từ modules khác.
`students` table luôn readable trong khi pipeline đang chạy.

**INV-04 — Password Hash Không Bị Ghi Đè:**
`ON CONFLICT DO UPDATE` chỉ update `email`, `full_name`, `updated_at`.
`password_hash` (nếu đã có từ lần đăng nhập trước) không bị reset về NULL.

**INV-05 — Chỉ 1 Pipeline Chạy Tại Một Thời Điểm:**
Nếu `import_logs` có row `status='IN_PROGRESS'` chưa quá 2 giờ, pipeline mới EXIT.
Không dùng distributed lock — check DB đủ cho single-process monolith.

**INV-06 — Stage-wise Progress (Không All-or-Nothing):**
Pipeline không có global transaction wrap toàn bộ file.
Rows đã upsert (các batch trước khi crash) KHÔNG bị rollback.
Đây là đặc tính, không phải bug — idempotency đảm bảo chạy lại là safe.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Happy path full pipeline:**
File students_2025-05-06.csv với 1000 rows hợp lệ.
Then: 1000 rows upserted. import_logs: status='SUCCESS', success_count=1000, failed_count=0.
Không có notification gửi đi.

**AC-02 — Mixed file (valid + invalid):**
File với 950 rows hợp lệ + 50 rows lỗi (invalid email, missing column).
Then: 950 rows upserted, 50 rows quarantined.
import_logs: success_count=950, failed_count=50, error_file_path populated.
BTC nhận notification về 50 lỗi.
Error file tại errors/students_2025-05-06.csv chứa 50 rows với error_reason.

**AC-03 — Idempotency:**
Chạy pipeline lần 1 với file F → 1000 rows upserted.
Chạy pipeline lần 2 với cùng file F → 1000 rows upserted (UPDATE, không INSERT mới).
DB: students table giống hệt sau lần 1 và lần 2.

**AC-04 — Concurrent run protection:**
Trigger cron lúc 02:00. Trigger manual lúc 02:00:05 (5 giây sau).
Then: Chỉ 1 pipeline chạy. Manual trigger log warning và exit.

**AC-05 — Crash recovery:**
Pipeline crash ở giữa Stage 4 (sau batch 3/10).
Then: import_logs.status = 'IN_PROGRESS'.
After 2h, cron trigger lại → chạy lại toàn bộ file.
Then: tất cả rows được upsert đúng. Không có duplicate.

**AC-06 — No file:**
Không có file trong input/ lúc 02:00.
Then: import_logs.status = 'FAILED', note = 'no_file_found'. Hệ thống vẫn chạy bình thường.

**AC-07 — Duplicate in file:**
File có student SV12345678 xuất hiện 2 lần với email khác nhau.
Then: Row cuối cùng được upsert (last-wins). DB: chỉ 1 row cho SV12345678 với email của lần xuất hiện cuối.

**AC-08 — Password hash preservation:**
Student SV12345678 đã set password_hash từ lần login trước.
Pipeline upsert SV12345678 với email mới.
Then: students.email = email mới. students.password_hash = giữ nguyên (không bị NULL).
