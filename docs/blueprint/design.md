# UniHub Workshop — Design Document

> **Trạng thái:** Final — Stage 2 đóng.
> **Cách đọc:** ADR được viết theo thứ tự *nhân quả*, không phải thứ tự số. ADR-02 và ADR-03 là cause; ADR-13 phải được co-design với ADR-03 (không phải sequence sau). ADR-01 là label được gắn sau khi các quyết định cụ thể đã chốt. ADR-14 (AI Summary) được tách riêng thay vì gộp vào ADR-10 vì nó có failure mode và provider choice riêng biệt.
>
> **Quy ước cấu trúc:** Mỗi ADR bám 4 phần — (1) Quyết định, (2) Lý do chọn, (3) Trade-off và rủi ro, (4) Phương án đã cân nhắc nhưng không chọn. Ngoại lệ: ADR-01 là label document, có cấu trúc tổng kết khác.

---

## ADR-02 — Lựa chọn Database và Schema

### 1. Quyết định

**PostgreSQL** làm primary database duy nhất. **Redis** làm lớp phụ trợ cho cache và rate limiting và message queue — không bao giờ là source of truth.

**Schema hoàn chỉnh — single source of truth cho toàn bộ design.md.** Các ADR sau reference bảng/cột ở đây mà không dùng `ALTER TABLE` để bổ sung — tránh hai version schema cùng tồn tại.

```sql
-- ============================================================
-- USER ENTITIES
-- ============================================================

-- Sinh viên — đồng bộ từ CSV ban đêm (ADR-12), chỉ dùng cho role 'student'
CREATE TABLE students (
  student_id    TEXT PRIMARY KEY,           -- mã sinh viên từ hệ thống trường
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  password_hash TEXT,                       -- NULL nếu auth qua SSO trường (Stage 5)
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Nhân sự nội bộ — ban tổ chức (BTC) và staff check-in
-- Tách bảng riêng vì lifecycle khác students (manual provisioning, không qua CSV)
CREATE TABLE staff (
  id            UUID PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('btc', 'checkin_staff')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_staff_role ON staff(role) WHERE is_active = true;

-- ============================================================
-- WORKSHOP DOMAIN
-- ============================================================

-- Bảng trung tâm của ADR-03 (Optimistic Lock) và ADR-13 (Cache)
CREATE TABLE workshops (
  id              UUID PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  seats_total     INT  NOT NULL CHECK (seats_total > 0),
  seats_available INT  NOT NULL CHECK (seats_available >= 0 AND seats_available <= seats_total),
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 0 = free workshop
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),
  pdf_url         TEXT,                    -- ADR-14: PDF đã upload, NULL nếu chưa có
  summary_text    TEXT,                    -- ADR-14: AI summary, NULL nếu chưa xử lý
  summary_status  TEXT DEFAULT 'none'
                  CHECK (summary_status IN ('none', 'queued', 'processing', 'done', 'failed')),
  created_by      UUID REFERENCES staff(id),
  version         BIGINT NOT NULL DEFAULT 0,  -- Optimistic Lock; BIGINT tránh overflow workshop hot
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_workshops_status_starts ON workshops(status, starts_at) WHERE status = 'open';

-- Kết quả đăng ký — second line of defense: UNIQUE (workshop_id, student_id)
CREATE TABLE registrations (
  id            UUID PRIMARY KEY,
  workshop_id   UUID NOT NULL REFERENCES workshops(id),
  student_id    TEXT NOT NULL REFERENCES students(student_id),
  status        TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  qr_code       TEXT UNIQUE NOT NULL,      -- UUID v4 độc lập (KHÔNG dùng id)
                                            -- — ngăn brute-force scan từ registration ID
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, student_id)         -- DB constraint ngăn 1 SV đăng ký 2 lần
                                            -- kể cả khi idempotency logic có bug
);
CREATE INDEX idx_registrations_workshop ON registrations(workshop_id);
CREATE INDEX idx_registrations_student  ON registrations(student_id);
CREATE INDEX idx_registrations_qr       ON registrations(qr_code);

-- Lưu lịch sử thanh toán cho audit + reconciliation (ADR-08)
CREATE TABLE payments (
  id                 UUID PRIMARY KEY,
  registration_id    UUID NOT NULL REFERENCES registrations(id),
  amount             NUMERIC(10,2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'VND',
  gateway_charge_id  TEXT,                  -- ID từ gateway, NULL nếu chưa nhận response
  status             TEXT NOT NULL CHECK (status IN ('initiated', 'succeeded', 'failed', 'unresolved')),
  idempotency_key    TEXT NOT NULL REFERENCES idempotency_keys(key),
  created_at         TIMESTAMPTZ DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX idx_payments_status_created ON payments(status, created_at)
  WHERE status IN ('initiated', 'unresolved');  -- cho reconciliation job

-- Check-in records (ADR-11)
CREATE TABLE checkins (
  id              UUID PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id),
  checked_in_at   TIMESTAMPTZ NOT NULL,    -- timestamp từ device (có thể lệch giờ)
  received_at    TIMESTAMPTZ DEFAULT now(), -- server-side timestamp cho audit
  checked_by      UUID NOT NULL REFERENCES staff(id),
  client_local_id TEXT,                     -- local_id từ SQLite mobile, để dedup sync batch
  UNIQUE (registration_id)                  -- first check-in wins; lần thứ 2 nhận 'duplicate'
);
CREATE INDEX idx_checkins_staff_received ON checkins(checked_by, received_at);

-- ============================================================
-- IDEMPOTENCY (ADR-03 và ADR-08 dùng chung bảng này)
-- ============================================================

CREATE TABLE idempotency_keys (
  key            TEXT PRIMARY KEY,          -- UUID v4 sinh từ client trước khi gửi request
  resource_type  TEXT NOT NULL CHECK (resource_type IN ('registration', 'payment')),
  status         TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'unresolved')),
  -- 'in_progress' : đang xử lý, locked_until còn hiệu lực
  -- 'completed'   : kết quả xác định (200/4xx) — terminal, response_body đáng tin để cache
  -- 'unresolved'  : đã gọi gateway nhưng không nhận được response (timeout/network drop)
  --                 KHÔNG terminal — retry với cùng key để gateway tự dedup (xem ADR-08)
  response_body  JSONB,                     -- NULL khi in_progress/unresolved; populated khi completed
  status_code    INT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  expires_at     TIMESTAMPTZ,               -- TTL = created_at + 24h; job đêm dọn hàng expired
  locked_until   TIMESTAMPTZ                -- deadline của in_progress state (~30s); crash recovery nếu quá hạn
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
-- Note: PRIMARY KEY trên `key` đủ vì UUID v4 không trùng giữa các resource_type.
--       resource_type là semantic marker (giúp filter và intent rõ), không phải uniqueness component.

-- ============================================================
-- OPERATIONAL LOGS
-- ============================================================

-- Audit cho CSV import (ADR-12)
CREATE TABLE import_logs (
  id              UUID PRIMARY KEY,
  run_at          TIMESTAMPTZ DEFAULT now(),
  total_rows      INT,
  success_count   INT,
  failed_count    INT,
  error_file_path TEXT,                     -- đường dẫn file errors/YYYY-MM-DD.csv
  triggered_by    TEXT NOT NULL CHECK (triggered_by IN ('cron', 'manual')),
  status          TEXT NOT NULL CHECK (status IN ('in_progress', 'success', 'failed'))
);

-- Log notification thất bại để debug/retry thủ công (ADR-09)
CREATE TABLE notification_logs (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,                -- student_id hoặc staff.id
  event_type  TEXT NOT NULL,                -- 'registration_confirmed', 'workshop_cancelled', ...
  channel     TEXT NOT NULL,                -- 'email', 'in_app', 'telegram'
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'timeout')),
  error_msg   TEXT,                         -- NULL nếu sent
  payload     JSONB,                        -- snapshot payload để retry thủ công nếu cần
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notif_logs_failed ON notification_logs(status, created_at)
  WHERE status IN ('failed', 'timeout');
```

### 2. Lý do chọn

**PostgreSQL được force bởi ADR-03** — Optimistic Locking đòi `UPDATE ... WHERE version = ?` trả về *số rows affected* chính xác, và bảo đảm constraint `seats_available >= 0` không bao giờ bị vi phạm. Đây là ACID transaction cấp row, không phải cấp document.

Khi đã có PostgreSQL làm source of truth, các vấn đề còn lại được giải miễn phí:

| Vấn đề | Cách PostgreSQL giải không cần thêm infrastructure |
|---|---|
| Idempotency (ADR-08) | `UNIQUE` constraint trên `idempotency_keys.key` + `INSERT ... ON CONFLICT` là atomic check-and-insert |
| CSV import (ADR-12) | `INSERT ... ON CONFLICT (student_id) DO UPDATE SET ...` là native upsert, chạy lại nhiều lần ra cùng kết quả |
| Audit trail | `updated_at` timestamp + PostgreSQL WAL đủ cho đồ án — không cần Event Sourcing |
| Ngăn 1 SV đăng ký workshop 2 lần | `UNIQUE (workshop_id, student_id)` trên `registrations` — defensive layer thứ 2 sau idempotency key; kể cả khi idempotency logic có bug, DB constraint vẫn giữ đúng |
| First-check-in-wins (ADR-11) | `UNIQUE (registration_id)` trên `checkins` — server-side conflict resolution không cần lock |

**Tách bảng `students` và `staff`:** Lifecycle khác nhau — students được sync từ legacy system qua CSV (ADR-12), staff được provision thủ công bởi admin. Gộp một bảng đòi cột nullable cho cả hai phía → schema lỏng. Tách đảm bảo mỗi role có cấu trúc đúng.

**`qr_code` là UUID v4 độc lập, không phải `registrations.id`:** Nếu QR encode `id` (sequential hoặc predictable), attacker có thể brute-force scan. UUID v4 random 122 bit entropy → không brute-force được trong thời gian sự kiện. Ngoài ra, tách `qr_code` khỏi `id` cho phép re-issue QR mà không thay đổi registration ID.

**Indexes có chủ đích, không phải mặc định:**

- `idx_workshops_status_starts WHERE status='open'`: partial index — chỉ workshop đang mở mới được query bởi sinh viên, giảm size index xuống 1/4.
- `idx_registrations_workshop`: cho query `SELECT COUNT(*) FROM registrations WHERE workshop_id=?` (BTC xem thống kê) — full table scan dưới spike là thảm họa.
- `idx_idempotency_expires`: cho job đêm `DELETE WHERE expires_at < now()`.
- `idx_payments_status_created WHERE status IN ('initiated','unresolved')`: partial index cho reconciliation job — bỏ qua đa số rows đã succeeded.

**Redis chỉ dùng cho ba việc:**

- Cache workshop list và `seats_available` (TTL ngắn, xem ADR-13)
- Sliding window counters cho Rate Limiting (ADR-06) — volatile, mất là tự reset
- Message Queue cho async tasks (ADR-10, ADR-14) — Redis Streams, có persistence

### 3. Trade-off và rủi ro

**Điểm đau duy nhất:** PostgreSQL là single-node. Dưới tải đột biến (7,200 request trong 3 phút), nếu không có lớp bảo vệ, DB connection pool sẽ cạn. Biện pháp là hai lớp phòng thủ phía trước DB: Redis cache (giảm read load) và Rate Limiting (giảm write load). Nếu cả hai layer trên không đủ, hệ thống trả lỗi gracefully — không sập silently.

**Không tự scale:** Modular Monolith + single PostgreSQL không scale ngang bằng cách thêm node. Với 12,000 user/10 phút ≈ 20 request/giây trung bình — không cần scale ngang. Nếu đồ án sau đòi 10× traffic, đây mới là điểm phải xem xét lại.

**`payments.idempotency_key` FK đến `idempotency_keys`:** Điều này đảm bảo mỗi payment record có liên kết với key đã dùng — nhưng tạo dependency graph cycle nếu xóa key trước payment. Job dọn key đêm phải skip key có FK reference; hoặc đổi sang nullable FK với SET NULL on delete. Quyết định: giữ NOT NULL, job đêm chỉ xóa key có `expires_at < now()` AND không có FK reference (subquery).

### 4. Phương án đã cân nhắc nhưng không chọn

**MongoDB:** Document-level ACID (với session transaction từ v4.0), nhưng `seats_available` là giá trị scalar cần `findAndModify` với `$inc` để atomic decrement — không tự nhiên như PostgreSQL row-level lock. Hơn nữa, CSV upsert với MongoDB không native như `ON CONFLICT` của PostgreSQL.

**Redis làm primary storage cho `seats_available`:** `DECR seats:workshop_42` là atomic và nhanh, nhưng không bền — crash trước khi persist = phantom seats biến mất. Cần WAL riêng hoặc AOF sync đồng bộ để bền, lúc đó độ phức tạp ngang PostgreSQL nhưng thiếu relational integrity và FK.

**MySQL:** Khả thi. `SELECT ... FOR UPDATE` và Optimistic Lock đều hỗ trợ. Không chọn vì PostgreSQL có `ON CONFLICT` clause tốt hơn cho upsert pattern của ADR-12, và `JSONB` cho idempotency response body, và partial index hỗ trợ tốt hơn.

**Một bảng `users` chung cho cả student và staff:** Đơn giản hơn về schema nhưng force nhiều cột nullable (ví dụ `student_id` chỉ có ở student, `role` chỉ có ý nghĩa cho staff). Tách bảng giữ schema chặt chẽ và phản ánh lifecycle khác biệt.

---

## ADR-03 — Cơ chế kiểm soát tranh chấp chỗ ngồi

### 1. Quyết định

**Optimistic Locking** ở tầng database với cột `version` trên bảng `workshops`, kết hợp **pre-check trên Redis** để lọc request không có cơ hội thành công trước khi chạm DB.

**Nguyên tắc cốt lõi:** Pure OL = đọc *không lock*, kiểm tra *version* khi ghi. Không dùng `FOR SHARE`/`FOR UPDATE` ở read step — đó là tư duy Pessimistic Locking, không phải OL.

Luồng đăng ký đầy đủ:

```
Bước 1 — Pre-check (Redis, không chạm DB):
  seats = GET cache:workshop:{id}:seats
  IF seats == "0" THEN trả về "Hết chỗ" ngay (tiết kiệm 1 DB round-trip)
  IF cache miss THEN đọc từ DB, populate cache (TTL = 10s, xem ADR-13)

Bước 2 — Claim idempotency key (ngoài transaction chính):
  INSERT INTO idempotency_keys (key, resource_type, status, locked_until)
    VALUES (:key, 'registration', 'in_progress', now() + interval '30 seconds')
  ON CONFLICT (key) DO NOTHING
  RETURNING key;
  
  IF không có row trả về (conflict) THEN:
    SELECT status, response_body, status_code, locked_until
    FROM idempotency_keys WHERE key = :key;
    
    CASE status:
      'completed'                              → trả về response_body đã lưu (true duplicate)
      'in_progress' AND locked_until > now()  → 409 "Request đang xử lý, vui lòng thử lại sau"
      'in_progress' AND locked_until <= now() → key bị bỏ dở (crash recovery), tiếp tục xử lý
        UPDATE idempotency_keys
          SET locked_until = now() + interval '30 seconds'
          WHERE key = :key AND status = 'in_progress';

Bước 3 — Ghi có điều kiện (PostgreSQL transaction, có retry nội bộ):
  MAX_RETRIES = 1                 -- terminology rõ: 2 attempts total = 1 original + 1 retry
  attempts = 0
  
  WHILE attempts <= MAX_RETRIES:
    -- Fresh read version, KHÔNG lock (pure OL)
    SELECT version, seats_available FROM workshops WHERE id = :workshop_id;
    
    IF seats_available == 0:
      sang Bước 4 với status="sold_out"; BREAK
    
    BEGIN;
      UPDATE workshops
        SET seats_available = seats_available - 1,
            version = version + 1
      WHERE id = :workshop_id
        AND version = :v_vừa_đọc
        AND seats_available > 0;
      
      IF rowsAffected == 0:
        ROLLBACK;
        attempts += 1; CONTINUE
        -- version đã thay đổi giữa SELECT và UPDATE — retry re-read version mới
        -- KHÔNG quay Bước 1-2: idempotency key đã claim cho request này,
        -- re-claim sẽ tự đụng lock 409 của chính mình
      
      -- OL thành công — check duplicate registration (defense layer 2)
      INSERT INTO registrations (id, workshop_id, student_id, status, qr_code)
        VALUES (gen_random_uuid(), :workshop_id, :student_id, 'pending', gen_random_uuid()::text)
        ON CONFLICT (workshop_id, student_id) DO NOTHING;
      
      IF rowsAffected_of_INSERT == 0:
        ROLLBACK;  -- UNIQUE bắt được duplicate: phải rollback cả OL UPDATE
                   -- để không có partial state (seats giảm nhưng không có registration)
        sang Bước 4 với status="duplicate_registration"; BREAK
        -- Response: "Bạn đã đăng ký workshop này rồi"
    COMMIT;
    BREAK  -- success
  
  IF attempts > MAX_RETRIES:
    sang Bước 4 với status="conflict_exhausted"
    -- Response: 503 + Retry-After: 2 — contention cao, không phải lỗi data

Bước 4 — Finalize idempotency key (sau khi biết kết quả):
  UPDATE idempotency_keys
    SET status = 'completed',
        response_body = :result_json,
        status_code   = :http_status,
        expires_at    = now() + interval '24 hours',
        locked_until  = NULL
  WHERE key = :key;

Bước 5 — Invalidate cache (fire-and-forget, ngoài transaction):
  DEL cache:workshop:{id}:seats   -- xem ADR-13 về dual-write race condition
```

### 2. Lý do chọn

**Pattern read-heavy, write-infrequent** là điều kiện lý tưởng cho Optimistic Locking. Hàng nghìn sinh viên xem trang chi tiết workshop (read), nhưng chỉ vài chục người thực sự bấm "Đăng ký" trong cùng một giây (write). Xung đột là ngoại lệ, không phải quy tắc — Optimistic Lock được thiết kế chính xác cho trường hợp này.

**Correctness được đảm bảo ở DB layer**, không phải application layer. `WHERE seats_available > 0` trong UPDATE không bao giờ vi phạm nhờ PostgreSQL's MVCC — dù 1,000 connection gửi UPDATE đồng thời, chỉ một số trong đó thành công, và không ai nhận `seats_available < 0`.

**Pre-check Redis giảm tải thực sự.** Sau khi workshop hết chỗ, toàn bộ request sau đó bị chặn tại Redis — không một request nào đạt đến PostgreSQL. Đây là lý do ADR-03 và ADR-13 phải được co-design: nếu ADR-13 không tồn tại, pre-check không tồn tại, và hot-row contention dưới tải đột biến sẽ trở nên nghiêm trọng.

**Đọc không lock (pure OL):** `SELECT ... FOR SHARE` là pattern Pessimistic — bị loại bỏ vì (a) ngoài transaction nó là no-op (autocommit acquire & release ngay); (b) trong transaction nó chỉ làm đọc bị block bởi UPDATE đang chạy, ngược với mục đích OL. Đọc free + version check khi UPDATE = đủ correctness.

### 3. Trade-off và rủi ro

**Retry logic phải có ceiling.** Nếu không giới hạn retry, client có thể vòng lặp vô tận khi version conflict liên tục. Quyết định: **MAX_RETRIES = 1** (tổng 2 attempts). Nếu retry thứ nhất vẫn conflict → trả lỗi `503 Try Again Later` với `Retry-After: 2` header. Lý do giới hạn ở 1: sau khi hệ thống đã ổn định (seats đã được cập nhật đúng), retry thứ hai gần như luôn thành công hoặc nhận "Hết chỗ" rõ ràng — không có giá trị thêm retry thứ ba.

**Version conflict vs. "Hết chỗ" phải được phân biệt.** Nếu trả về lỗi chung "Đăng ký thất bại" cho cả hai trường hợp, client không biết nên retry hay không. Thiết kế hiện tại check rõ `seats_available` trước UPDATE và sau khi `rowsAffected == 0` để phân biệt hai trường hợp.

**Hot-row vẫn có thể xảy ra** nếu Rate Limiting (ADR-06) không được thiết kế đúng. Rate Limiting là lớp bảo vệ phía trước — giảm số request vào workshop cùng lúc, giảm collision rate. Nếu ADR-06 bị bỏ qua, ADR-03 vẫn đúng (no double-booking) nhưng hiệu năng xấu dưới tải.

**Defense layer 2 phải rollback cả layer 1.** Khi `INSERT registrations` bị `ON CONFLICT DO NOTHING` (UNIQUE bắt duplicate), `UPDATE workshops` đã decrement `seats_available` cũng phải rollback. Nếu không, hệ thống mất 1 chỗ phantom mà không có registration tương ứng — under-availability bug. Pseudocode bắt buộc `ROLLBACK` ở nhánh này, không COMMIT.

### 4. Phương án đã cân nhắc nhưng không chọn

**Pessimistic Locking (`SELECT ... FOR UPDATE`):** Đảm bảo zero collision bằng cách serialize hoàn toàn các writer. Phù hợp khi *xung đột là thường xuyên và write rate cao hơn read rate* — không phải pattern của đồ án này. Dưới 12,000 user đọc và vài trăm user ghi, `SELECT ... FOR UPDATE` sẽ tạo hàng đợi lock dài, giảm throughput đáng kể so với Optimistic Lock.

**Redis `DECR seats:workshop_42` làm primary:** Atomic và nhanh hơn PostgreSQL OL, nhưng không bền (xem ADR-02). Có thể dùng như lớp *pre-filter* trước DB — nhưng không thể thay thế DB làm source of truth. Vai trò đó đã được giao cho Redis trong ADR-13 pre-check, với sự hiểu biết rõ rằng nó chỉ là hint, không phải enforcement.

**Distributed Lock (Redlock):** Mạnh tay quá mức cần thiết. Distributed lock giải quyết bài toán *nhiều service process cùng cạnh tranh một resource*. Đồ án chỉ có một PostgreSQL node và một application process — không có race condition cross-process để giải quyết. Thêm Redlock là thêm một SPOF (Redis) mà không giải quyết vấn đề mới.

---

## ADR-13 — Cache Strategy cho `seats_available` và Workshop List

### 1. Quyết định

**Cache-Aside với Write-Invalidate** (không phải Write-Through). TTL = **10 giây** cho `seats_available`. TTL = **60 giây** cho workshop list.

Hai cache key quan trọng:

```
cache:workshop:{id}:seats    → INT, seats_available hiện tại (TTL 10s)
cache:workshop:list          → JSON array, danh sách workshop status='open' (TTL 60s)
```

Luồng đọc (Cache-Aside):

```
1. GET cache:workshop:{id}:seats
2. Cache hit → trả về (có thể stale tối đa 10s, chấp nhận được)
3. Cache miss → SELECT seats_available FROM workshops WHERE id = ?
             → SET cache:workshop:{id}:seats {value} EX 10
             → trả về value
```

Luồng ghi sau khi OL UPDATE commit (Write-Invalidate):

```
-- Trong transaction PostgreSQL (ADR-03 Bước 3):
UPDATE workshops SET seats_available = ..., version = ... WHERE id = ? AND version = ?
INSERT INTO registrations (...)
COMMIT;

-- Sau khi COMMIT (ngoài transaction, fire-and-forget):
DEL cache:workshop:{id}:seats
DEL cache:workshop:list   -- nếu cần invalidate list (có thể skip nếu list không show seats)
```

**Admin update path (BTC sửa workshop qua trang admin):** Khi BTC tăng `seats_total` hoặc cập nhật metadata workshop, code path KHÔNG đi qua ADR-03 — phải invalidate cache thủ công ở handler. Pseudocode:

```
PATCH /admin/workshops/:id { seats_total: 80 }
  UPDATE workshops SET seats_total = 80, seats_available = seats_available + 20, ... 
    WHERE id = :id;
  COMMIT;
  DEL cache:workshop:{id}:seats           -- BẮT BUỘC, không skip
  DEL cache:workshop:list                  -- BẮT BUỘC
```

Nếu quên invalidate ở admin path, user thấy số chỗ cũ tối đa 10s — không phải bug correctness (OL ở DB vẫn đúng) nhưng UX confusing.

### 2. Lý do chọn — và tại sao TTL 10 giây

ADR-13 phải được co-design với ADR-03 vì **TTL kiểm soát số lượng OL retry** dưới tải đột biến. Đây là vòng feedback:

```
TTL dài → nhiều user thấy seats_available = N (stale)
         → nhiều user vào OL write cùng lúc
         → OL collision tăng
         → retry storm
         → hot-row contention
         
TTL ngắn → cache miss rate cao
          → nhiều DB read
          → DB connection pool chịu tải read nặng
          → latency tăng ngay cả khi không có tranh chấp
```

**TTL 10 giây** là điểm cân bằng dựa trên phép tính sau — **hai con số 40 RPS xuất hiện độc lập, không phải trùng hợp:**

- **Attempt rate trung bình:** 7,200 người / 180 giây = **40 RPS** — đây là throughput tổng cộng của tất cả request vào hệ thống trong 3 phút đỉnh.
- **Success rate đỉnh trong 5 giây đầu:** ~200 chỗ trống / 5 giây = **40 RPS** — đây là tốc độ các chỗ được lấp trong khoảnh khắc đầu tiên khi workshop mở. Hai con số tình cờ bằng nhau vì workload này có đặc thù attempt ≈ success ở giây đầu (chưa ai bị từ chối).

Với TTL 10s, sau khi workshop hết chỗ, tối đa 40 attempt/s × 10s = **400 người** sẽ thấy `seats_available > 0` stale trong Redis. 400 người này vào OL write ở DB, nhận `0 rows affected` (DB đã đúng), re-read `seats_available = 0`, nhận "Hết chỗ" — không retry thêm. Không có retry storm vì DB là điểm enforcement, không phải cache.

**Write-Invalidate thay vì Write-Through** vì lý do fault isolation: Write-Through đòi Redis write thành công trong transaction PostgreSQL — nếu Redis down khi đang commit, transaction phải rollback. Write-Invalidate tách biệt hoàn toàn: Redis down → DEL fail → cache tự expire sau TTL → lần đọc tiếp theo miss → fill từ DB. Không có data loss, chỉ có stale window hơi dài hơn.

### 3. Trade-off và rủi ro (Dual-Write Problem)

**Race condition tồn tại và được chấp nhận có ý thức:**

```
T=0:    PostgreSQL COMMIT (seats = 0)
T=1ms:  Application gửi DEL cache:workshop:42:seats
        
        [Trong gap 1ms này:]
T=0.5ms: Thread B đọc GET cache:workshop:42:seats → "1" (stale)
         Thread B vào OL write
         Thread B nhận 0 rows affected (seats đã = 0 trong DB)
         Thread B nhận "Hết chỗ" từ DB read
         
T=2ms:  DEL hoàn thành
```

Thread B không bị mislead về kết quả cuối — nó nhận "Hết chỗ" đúng. Stale cache chỉ khiến nó tốn thêm 1 DB round-trip, không gây incorrect behavior. **Correctness vẫn do OL ở DB layer đảm bảo; cache chỉ là performance hint.**

**Cache `seats_available` phải KHÔNG BAO GIỜ được dùng làm enforcement.** Đây là ranh giới thiết kế quan trọng: ADR-13 cung cấp pre-filter (giảm load), ADR-03 cung cấp enforcement (correctness). Lẫn lộn hai vai trò này là nguồn gốc của hầu hết bugs liên quan đến overselling.

**Edge case admin update không qua OL:** Đã document ở Phần 1 — invalidate thủ công ở admin handler. Đây là implicit assumption cần explicit để tránh quên khi implement.

### 4. Phương án đã cân nhắc nhưng không chọn

**Write-Through Cache:** Cache được update trong cùng transaction PostgreSQL, đảm bảo cache luôn nhất quán với DB. Bị loại vì coupling Redis vào transaction path — nếu Redis latency tăng hoặc connection timeout, mọi registration transaction bị ảnh hưởng. Fault isolation quan trọng hơn cache freshness.

**TTL 1–2 giây:** Cache miss rate quá cao dưới spike. Với 40 RPS reads và 1s TTL, cache chỉ absorb ~40 reads trước khi miss — không đáng kể. Mục tiêu của cache là absorb burst read traffic, không phải luôn fresh.

**TTL 60 giây cho `seats_available`:** Quá stale. 60 × 40 = 2,400 người có thể thấy wrong count, tạo batch OL collision. TTL 60s chỉ phù hợp cho dữ liệu ít thay đổi — workshop metadata (tên, mô tả, địa điểm) có thể dùng TTL dài; `seats_available` thì không.

**Redis DECR làm atomic counter (không có PostgreSQL OL):** Loại bỏ OL complexity, mọi thứ qua Redis DECR. Vấn đề: DECR là atomic nhưng Redis không có foreign key — không đảm bảo được "chỉ student đã xác thực, chưa đăng ký workshop này, mới được DECR". Validation logic phải ở application layer, tạo TOCTOU race condition. Cuối cùng phức tạp hơn, không ít hơn.

---

## ADR-01 — Architectural Style (Label Document)

> **Lưu ý đọc:** Đây là label document — ghi lại kiến trúc tổng thể *như tổng kết* của ADR-02/03/13 và các ADR khác, không phải quyết định độc lập. Nếu ADR-02 thay đổi (ví dụ: chuyển sang sharded DB), document này cần được update nhưng không phải điểm bắt đầu của thay đổi đó.

### Kiến trúc: Modular Monolith

Một process duy nhất, nhiều module rạch ròi với ranh giới được enforce tại compile time (package-level boundary), không phải network boundary.

**Lý do kết luận này từ các ADR trước:**

- ADR-02 chốt single PostgreSQL node → không có distributed transaction → không cần service isolation
- ADR-03 dùng ACID transaction bao gồm cả idempotency key check + INSERT registrations → đòi cùng DB connection → không thể cross-service
- ADR-08 (Idempotency) và ADR-12 (CSV upsert) đều dùng `ON CONFLICT` trên cùng schema → monolith tự nhiên
- ADR-07 CB state in-memory (single process) → không cần distributed state coordination

**Module boundaries:**

```
src/
  registration/    ← Workshop CRUD, seat management, OL logic (ADR-03)
  payment/         ← Payment initiation, Circuit Breaker, Idempotency (ADR-07/08)
  checkin/         ← QR generation, mobile sync API, offline data model (ADR-11)
  notification/    ← Strategy Pattern, channel adapters Email/InApp/[Telegram] (ADR-09)
  ai-summary/      ← PDF upload, async processing, result storage (ADR-14)
  csv-sync/        ← Scheduler, CSV parser, error quarantine, upsert pipeline (ADR-12)
  auth/            ← JWT, RBAC middleware, 3 role definitions (ADR-04/05)
  rate-limit/      ← Sliding window counters, 3-tier limits (ADR-06)
  shared/          ← DB pool, Redis client, common types
```

Mỗi module chỉ expose interface qua `index.ts` (hoặc tương đương). Module khác không import internal file trực tiếp — enforce bằng ESLint rule `no-restricted-imports` hoặc tương đương trong ngôn ngữ chọn.

**Điều này KHÔNG có nghĩa là:**

- Mọi request đều đồng bộ (AI summary và batch notification vẫn async qua Redis Streams ADR-10)
- Không có separation of concerns (mỗi module có domain model riêng)
- Không thể tách thành Microservices sau này (ranh giới module được thiết kế để dễ extract)

---

## ADR-07 — Cách ly lỗi cổng thanh toán (Circuit Breaker + Graceful Degradation)

### 1. Quyết định

**Circuit Breaker in-memory** với ba trạng thái CLOSED / OPEN / HALF-OPEN, bao bọc toàn bộ lời gọi ra ngoài đến payment gateway. Trạng thái được lưu trong process memory — phù hợp với kiến trúc Modular Monolith một process (ADR-01).

**Tham số vận hành:**

| Tham số | Giá trị | Lý do |
|---|---|---|
| Failure threshold để OPEN | 5 lỗi liên tiếp HOẶC tỉ lệ lỗi ≥ 50% trong 60s | Tránh false positive từ 1-2 lỗi ngẫu nhiên |
| Timeout một request | 5 giây | Gateway thật thường phản hồi < 2s; 5s đủ buffer |
| Thời gian giữ OPEN | 30 giây | Cho gateway thời gian phục hồi |
| Probe để chuyển HALF-OPEN | Sau 30s OPEN, request kế tiếp được phép đi qua làm probe — nếu success: đếm vào success counter; nếu fail: CB quay về OPEN, reset timer 30s |
| Success threshold để đóng | 2 thành công liên tiếp | 1 success có thể là fluke |

**Graceful degradation khi CB OPEN:**

```
Workshop miễn phí  → KHÔNG ảnh hưởng (luồng thanh toán không chạy)
Workshop có phí    → Trả lỗi rõ nghĩa: "Hệ thống thanh toán tạm thời gián đoạn.
                     Vui lòng thử lại sau ~30 giây."
Tính năng khác     → Xem workshop, check-in, AI summary — tất cả vẫn hoạt động bình thường
```

**Thứ tự kiểm tra bắt buộc trong payment flow:**

```
Request đến POST /payments:

① Idempotency check (ADR-08) — PHẢI TRƯỚC CB check
   ↓ K = completed → trả cached response (kể cả khi CB OPEN)
   ↓ K = unresolved → tiếp tục (đi vào ② để retry với gateway dedup)
   ↓ K = in_progress AND locked_until > now → 409
   ↓ K không tồn tại → tiếp tục

② Circuit Breaker check — PHẢI SAU idempotency check
   ↓ OPEN → trả 503 WITHOUT claiming idempotency key
            (không pollute bảng với key sẽ không bao giờ hoàn thành)
   ↓ CLOSED / HALF-OPEN → tiếp tục

③ Claim idempotency key (in_progress) — sau khi biết CB cho phép
④ Gọi gateway
⑤ Finalize idempotency key với response/timeout status
```

> Thứ tự ① trước ② không phải tùy ý — xem Phần 2 để hiểu tại sao đảo thứ tự này tạo bug.

### 2. Lý do chọn

**Tại sao Idempotency check phải đứng trước CB check:**

```
Scenario: Key K1 đã xử lý thành công (status=completed). Gateway sau đó bị down, CB mở.
Client không biết CB đã mở và retry request với cùng K1.

Thứ tự sai (CB trước):
  → CB check: OPEN → từ chối 503
  → Client KHÔNG nhận được response đã cache
  → Client không biết request trước đã thành công hay chưa
  → Client tiếp tục retry → tạo UX tệ và tăng tải khi CB đang phục hồi

Thứ tự đúng (Idempotency trước):
  → Idempotency check: K1 = completed → trả cached response ngay lập tức ✓
  → Client nhận được kết quả đúng, không retry nữa
  → CB không liên quan với request đã hoàn thành
```

**Tại sao không claim idempotency key trước CB check:**

```
Scenario: K2 mới, CB đang OPEN.

Nếu claim K2 trước CB check:
  → K2 = in_progress (đã claim)
  → CB check: OPEN → từ chối 503
  → K2 bị kẹt in_progress cho đến locked_until (~30s)
  → Client retry trong 30s với K2 → gặp 409 "Request đang xử lý"
     dù thực ra request không được xử lý gì

Nếu CB check trước claim:
  → CB check: OPEN → từ chối 503 ngay
  → K2 không bị claim, vẫn trống
  → Client retry khi CB đóng, dùng K2 hoặc key mới → flow bình thường ✓
```

**Tại sao CB state lưu in-memory (không phải Redis):**

Với Modular Monolith một process (ADR-01), tất cả request đều qua cùng một CB instance. Không có race condition giữa các process. Redis-based CB chỉ cần thiết khi có nhiều application instances phải đồng thuận trạng thái CB — không phải bài toán này.

Hệ quả: restart process sẽ reset CB về CLOSED. Đây là **correctness guarantee, không phải limitation** — process mới không có state lỗi cũ, gateway có thể đã phục hồi trong lúc restart, không có lý do giữ trạng thái OPEN từ trước.

### 3. Trade-off và rủi ro

**Timeout là failure loại đặc biệt.** Khi gateway timeout sau 5 giây: CB ghi nhận là failure (đóng góp vào threshold), và idempotency key được mark `unresolved` (KHÔNG `completed`) — gateway có thể đã charge hoặc chưa, server không biết. Client retry với cùng key sẽ đi vào branch `unresolved` ở Bước ① và đi tiếp đến gateway để dedup. Xem ADR-08 để hiểu chi tiết.

**Threshold 50% trong 60s vs. 5 lỗi liên tiếp — cả hai cùng lúc.** Hai điều kiện hoạt động song song (OR logic). 5 lỗi liên tiếp bắt failure burst nhanh; 50%/60s bắt failure dai dẳng với tỉ lệ thấp. Chỉ dùng một điều kiện có thể bỏ sót một trong hai pattern.

**HALF-OPEN race với concurrent probes.** Nếu 2 request đến cùng lúc trong HALF-OPEN, cả hai đều nghĩ mình là probe và gọi gateway — mất ý nghĩa "1 probe". Implementation cần atomic compare-and-swap state khi cho probe đi qua: chỉ request đầu tiên qua, các request sau (trước khi probe có kết quả) bị từ chối như OPEN.

### 4. Phương án đã cân nhắc nhưng không chọn

**Không có CB, chỉ dùng timeout:** Nếu không có CB, mỗi request đến gateway down sẽ chờ 5 giây trước khi nhận lỗi. Với tải đỉnh, connection pool sẽ bị chiếm bởi các request đang chờ timeout → các request khác (kể cả không liên quan đến payment) bị block. CB fail-fast trong 0ms khi OPEN, giải phóng connection pool ngay.

**Bulkhead Pattern (connection pool riêng cho gateway):** Cô lập pool connection của gateway khỏi pool chung — ngay cả khi gateway chậm, pool chung không bị ảnh hưởng. Bổ sung cho CB, không thay thế. Không implement trong đồ án vì: (a) mock gateway không có latency thực, (b) Bulkhead là optimization, không phải correctness requirement.

**Retry với exponential backoff (không có CB):** Retry giúp với lỗi thoáng qua nhưng làm tệ hơn khi gateway thực sự down — mỗi retry là thêm load lên gateway đang gặp sự cố. CB + Retry là đúng kết hợp: retry trong CLOSED state (lỗi thoáng qua), CB mở khi threshold bị vượt (lỗi kéo dài).

---

## ADR-08 — Idempotency Key cho thanh toán

### 1. Quyết định

**Client-generated idempotency key** (UUID v4, sinh trước khi gửi request) cho mỗi payment attempt. Key được lưu trong bảng `idempotency_keys` (cùng bảng với registration idempotency từ ADR-03, phân biệt bằng `resource_type='payment'` — schema đầy đủ ở ADR-02). Key được **forward đến payment gateway** như gateway idempotency key — đây là quyết định phân biệt ADR-08 với idempotency registration ở ADR-03.

**Luồng thanh toán đầy đủ tích hợp với ADR-07:**

```
Client chuẩn bị trước khi gửi request:
  payment_key = UUID.v4()  -- sinh một lần, lưu ở client (localStorage)
                            -- KHÔNG sinh lại khi retry — dùng cùng key

POST /payments {registration_id, payment_key}

① Idempotency check:
   SELECT status, response_body, status_code
   FROM idempotency_keys
   WHERE key = :payment_key AND resource_type = 'payment';
   
   IF completed   → trả cached response (200/402 — kết quả xác định)
   IF unresolved  → KHÔNG trả cache. Tiếp tục sang ② để retry với cùng key;
                    gateway sẽ dedup nếu đã charge, hoặc xử lý mới nếu chưa
   IF in_progress AND locked_until > now → 409 "Processing"
   IF không tồn tại HOẶC in_progress expired → tiếp tục

② CB check (ADR-07):
   IF circuit_breaker.state == OPEN → trả 503 WITHOUT touching idempotency table

③ Claim/refresh key:
   -- Có 2 case đến đây: key chưa tồn tại HOẶC key tồn tại với status='unresolved' (hoặc in_progress expired)
   -- Tách 2 case rõ ràng thay vì gộp ON CONFLICT phức tạp:
   
   IF key chưa tồn tại:
     INSERT INTO idempotency_keys (key, resource_type, status, locked_until)
       VALUES (:payment_key, 'payment', 'in_progress', now() + interval '30s');
   ELSE:  -- status = 'unresolved' hoặc in_progress đã expired
     UPDATE idempotency_keys
       SET status = 'in_progress',
           locked_until = now() + interval '30s'
       WHERE key = :payment_key
         AND (status = 'unresolved' 
              OR (status = 'in_progress' AND locked_until <= now()));
     -- Nếu rowsAffected = 0 (key đã chuyển sang completed bởi request khác giữa Bước ① và ③):
     --   re-check Bước ① logic, có thể trả cached response
   
   -- Crash-recovery semantics: nếu server crash trước Bước ④,
   --   K kẹt in_progress cho đến locked_until hết. Sau đó retry
   --   sẽ rơi vào branch crash-recovery (cùng logic).

④ Tạo payment record + Gọi gateway:
   INSERT INTO payments (id, registration_id, amount, idempotency_key, status)
     VALUES (gen_random_uuid(), :reg_id, :amount, :payment_key, 'initiated');
   
   POST gateway.com/charge
   Headers: Idempotency-Key: {payment_key}
   Body: {amount, currency, card_token, ...}
   
   CASE kết quả:
     200 OK (charged)  → ⑤ với status='completed'; payments.status='succeeded'
     402 (declined)    → ⑤ với status='completed'; payments.status='failed'
     4xx client error  → ⑤ với status='completed'; payments.status='failed'
     5xx/timeout       → CB ghi failure; ⑤ với status='unresolved'
                         payments.status='unresolved' (cho reconciliation job)

⑤ Finalize key + payment:
   BEGIN;
     UPDATE idempotency_keys
       SET status = :resolved_or_unresolved,
           status_code = :http_status,
           response_body = :response_json,  -- NULL nếu unresolved
           expires_at = now() + interval '24h',
           locked_until = NULL
     WHERE key = :payment_key;
     
     UPDATE payments
       SET status = :payment_status,
           gateway_charge_id = :charge_id,  -- NULL nếu unresolved
           resolved_at = now()
     WHERE idempotency_key = :payment_key;
   COMMIT;

⑥ Nếu gateway trả 200: cập nhật registrations.status = 'paid'
   Trả response cho client (504 + Retry-After: 30 nếu unresolved)
```

### 2. Lý do chọn

**Tại sao forward key đến gateway — đây là quyết định phân biệt ADR-08:**

```
Scenario không forward:
  T=0:  Server claim K, gọi gateway, gateway nhận và xử lý
  T=5s: Gateway timeout (response mất trên mạng, nhưng tiền đã trừ)
  Server: mark K='unresolved', trả 504 cho client
  Client: retry với key mới K' (không biết K đang unresolved — lỗi UX)
  Gateway: nhận K' — xem như request mới → trừ tiền lần 2 ❌

Scenario có forward:
  T=0:  Server claim K, gọi gateway với header Idempotency-Key: K
  T=5s: Gateway timeout (tiền đã trừ hoặc chưa — không biết)
  Server: mark K='unresolved', trả 504 + {retry_same_key: true} cho client
  Client: retry với cùng K (response body nói rõ "dùng lại key này")
  Gateway: nhận K đã xử lý → trả kết quả đã cache, không trừ thêm ✓
  Server: nhận kết quả từ gateway, mark K='completed' với kết quả thực ✓
```

Khi forward cùng key, **gateway là người bảo đảm idempotency ở tầng charge** — server chỉ cần bảo đảm không gọi gateway nhiều lần với *các key khác nhau* cho cùng một intent. Vì vậy, **client không được sinh key mới khi retry** — cùng payment intent phải dùng cùng key.

**Tại sao 3 trạng thái thay vì 2 (completed/in_progress):**

`unresolved` khác `completed` ở một điểm duy nhất: idempotency check **không trả cache** khi thấy `unresolved` — thay vào đó cho phép retry tiếp cận gateway. Đây là cơ chế cho phép gateway dedup hoạt động đúng với forward key pattern. Nếu mark `completed` cho timeout case → cache response 504 → client không bao giờ biết tiền đã đi qua hay chưa, buộc dùng key mới → gây double-charge.

**Tại sao client generate key thay vì server:**

Nếu server generate: client phải gọi `GET /payments/new-key` trước, rồi dùng key đó trong `POST /payments`. Hai round-trip, và nếu client crash giữa hai bước, key bị bỏ (tạo orphan entry). Client-generated: một round-trip, client lưu key ngay sau khi sinh — không có orphan.

**Tại sao cùng bảng `idempotency_keys` với `resource_type`:**

Registration key và payment key có cùng lifecycle (claim → complete/unresolved → expire 24h) và cùng cơ chế crash recovery. Tách bảng là code duplication không có lợi ích cụ thể. `resource_type` đủ để phân biệt semantic và làm intent rõ trong query — UUID v4 không trùng giữa các resource_type nên PRIMARY KEY trên `key` đủ enforce uniqueness.

### 3. Trade-off và rủi ro

**Worst case — client không retry và K còn `unresolved` đến hết TTL:**

```
Client gửi POST với K, gateway timeout
Server: mark K='unresolved', trả 504
Client: đóng app, mất kết nối lâu dài, không retry
24h sau: job đêm xóa K
Tiền có thể đã bị trừ ở gateway mà không có payment.status='succeeded' tương ứng
```

`payments.status='unresolved'` (FK đến K) là cơ chế recover: bảng `payments` không bị xóa cùng K (chỉ K bị xóa, payment record vẫn còn với status `unresolved`). **Reconciliation job** chạy mỗi 5 phút query `payments WHERE status='unresolved'`, gọi gateway với `gateway_charge_id` (nếu có) hoặc với `idempotency_key` để biết kết quả thực, update lại status. Đây là operational concern — chi tiết spec ở `specs/payment-reconciliation.md` (Stage 5).

**TTL 24h cho idempotency key:** Đủ dài để client retry trong ngày sự kiện (workshop diễn ra trong 1–5 ngày). Sau 24h, entry bị job đêm xóa — client tạo key mới cho payment attempt khác. Job đêm phải skip key có `payments.status='unresolved'` reference (xem note ở ADR-02).

**Key sinh ở frontend, truyền qua API:** Key phải được validate là UUID v4 format ở server. Client giả mạo key = `"admin-free-pass"` không có ý nghĩa gì (key chỉ là deduplication token, không phải authorization token) nhưng validation giữ schema sạch.

### 4. Phương án đã cân nhắc nhưng không chọn

**Lưu key trong Redis (thay vì PostgreSQL):**

Cám dỗ: Redis lookup O(1), nhanh hơn PostgreSQL index lookup. Thực tế: PostgreSQL với B-tree index trên `TEXT PRIMARY KEY` cũng O(log n), và với số lượng payment của đồ án (vài nghìn/ngày) thì không đo được khác biệt. Quan trọng hơn: Redis là volatile — crash mất idempotency table, tất cả in-progress key mất theo, không có crash recovery. Correctness trumps performance ở đây. Lý do reject khác với lý do reject Redis-as-primary-DB ở ADR-02 (đó là về ACID) hay ADR-13 (đó là về fault isolation) — đây là về **durability của idempotency state cụ thể**.

**Server-generated key với `POST /payments/initiate` → `POST /payments/confirm`:**

Two-phase commit pattern: initiate trả về server key, confirm dùng key đó. Đảm bảo key không bao giờ bị client "giả". Bị loại vì: (a) thêm một round-trip network, tăng latency; (b) nếu client crash sau initiate nhưng trước confirm, key bị orphan ở in_progress mãi — cần cleanup job phức tạp hơn; (c) payment gateway vẫn cần idempotency key forwarded từ client để xử lý duplicate — two-phase ở server side không giải quyết được vấn đề gateway-side deduplication.

**Không có idempotency, chỉ dựa vào CB:**

CB ngăn double-call khi gateway down nhưng không ngăn double-charge khi network timeout sau khi gateway đã xử lý. CB và Idempotency Key giải quyết hai failure mode khác nhau: CB giải failure của connection, Idempotency giải failure của response delivery. Cần cả hai.

---

## ADR-04 — Authentication: JWT với Refresh Token

### 1. Quyết định

**JWT (JSON Web Token) access token** TTL 15 phút, kết hợp **Refresh Token** TTL 7 ngày lưu trong `HttpOnly` cookie. Không dùng server-side session store.

**Hai endpoint đăng nhập** — phục vụ hai loại user lưu ở hai bảng riêng (xem ADR-02):

```
POST /auth/login/student   → tra cứu trong `students` (password_hash)
POST /auth/login/staff     → tra cứu trong `staff` (password_hash)
                              → role lấy từ staff.role (btc | checkin_staff)
```

Cả hai endpoint trả access_token (JSON body) + refresh_token (HttpOnly cookie).

```
POST /auth/refresh   → đọc refresh_token từ cookie, trả access_token mới
POST /auth/logout    → invalidate refresh_token (xóa cookie + revoke trong DB nếu cần)
```

Payload của access token:

```json
{
  "sub": "student-id-or-staff-uuid",
  "role": "student",
  "user_type": "student",
  "email": "alice@university.edu",
  "iat": 1700000000,
  "exp": 1700000900
}
```

Mobile app (check-in staff) lưu access token trong secure storage để dùng offline — token không cần validate với server khi offline. Điều này là đặc điểm phục vụ ADR-11 (offline check-in). Khi token sắp hết hạn (< 2 phút), mobile gọi `/auth/refresh` qua mạng — nếu mất mạng, dùng token hiện có cho đến khi expire (sau đó staff cần kết nối lại để refresh).

### 2. Lý do chọn

**Stateless:** Không cần session store (không thêm Redis dependency chỉ cho auth). Mỗi request tự chứa thông tin xác thực — phù hợp với Modular Monolith không có distributed session.

**Mobile offline:** Staff check-in cần validate token ngay cả khi mất mạng. JWT tự chứa signature và expiry — mobile app verify bằng public key offline. Session-based auth không thể làm được điều này (cần call server để validate session ID).

**Role embedded in token:** Middleware RBAC (ADR-05) đọc `role` claim trực tiếp từ token — không cần DB lookup cho mỗi request để xác định permission.

**Hai endpoint login (student/staff) thay vì một:** Phản ánh schema tách (ADR-02 — `students` và `staff` riêng). Một endpoint duy nhất buộc phải query cả 2 bảng để xác định user — phức tạp hơn và lộ thông tin tồn tại email (timing attack giữa "student có email này" vs "staff có email này"). Tách endpoint giữ logic gọn và secure.

**Boundary:** JWT access token không thể revoke trước khi hết TTL. Nếu token bị đánh cắp, attacker có tối đa 15 phút. Chấp nhận được với TTL ngắn — nếu yêu cầu strict revocation (ví dụ admin kick user), cần thêm token blacklist trong Redis (scope ngoài đồ án — pointer đến `specs/auth-revocation.md` Stage 5).

### 3. Trade-off và rủi ro

**15 phút TTL** tạo UX ma sát: user phải refresh mỗi 15 phút. Giải quyết bằng **silent refresh** — frontend tự gọi `/auth/refresh` khi token còn < 2 phút, user không nhận biết. Nếu refresh token cũng hết hạn (7 ngày) → redirect đến login.

**Refresh token trong HttpOnly cookie:** Không accessible bởi JavaScript → mitigates XSS. Cần đặt `SameSite=Strict` để mitigate CSRF. Trade-off: mobile app không thể dùng cookie chuẩn → mobile nhận refresh token trong response body và tự lưu trong secure storage (Android Keystore / iOS Keychain).

**JWT signing key compromised → toàn bộ token forge được.** Dùng asymmetric (RS256) thay vì symmetric (HS256) để private key chỉ ở auth service — các module khác chỉ cần public key để verify. Trong monolith này không có lợi ích lớn (cùng process), nhưng setup đúng từ đầu đỡ migration sau.

### 4. Phương án đã cân nhắc nhưng không chọn

**Session-based (server-side session + session ID cookie):** Đơn giản hơn về flow nhưng đòi session store (Redis) để share session giữa requests. Quan trọng hơn: không hỗ trợ offline validation cho mobile check-in. Loại vì ADR-11 dependency.

**Long-lived JWT (24h+ TTL, không có refresh token):** Đơn giản nhất nhưng window bị exploit dài. Với workshop event nhiều giờ, token bị đánh cắp đầu buổi có thể dùng đến cuối buổi.

**OAuth2 với external provider (Google/SSO trường):** Phù hợp cho production nhưng đòi tích hợp với LDAP/CAS của trường — không có thông tin tích hợp này (ngoài scope theo proposal Section 4.2).

---

## ADR-05 — Authorization: RBAC với 3 roles

### 1. Quyết định

**RBAC (Role-Based Access Control)** với 3 roles cứng, enforcement tại 3 điểm.

**RBAC Permission Matrix:**

| Permission | student | btc | checkin_staff |
|---|---|---|---|
| Xem danh sách / chi tiết workshop | ✓ | ✓ | ✓ |
| Đăng ký workshop | ✓ | — | — |
| Thanh toán | ✓ | — | — |
| Xem registration của chính mình | ✓ | — | — |
| Xem QR code của chính mình | ✓ | — | — |
| Tạo / sửa / xóa workshop | — | ✓ | — |
| Xem tất cả registration | — | ✓ | — |
| Upload PDF, xem AI summary status | — | ✓ | — |
| Xem thống kê đăng ký | — | ✓ | — |
| Quét QR, ghi nhận check-in | — | — | ✓ |
| Xem lịch sử check-in của chính mình | — | — | ✓ |

**3 điểm enforcement — theo thứ tự lọc từ ngoài vào trong:**

```
① JWT middleware (auth/jwt-verify):
   - Verify signature, check expiry
   - Extract role + user_id từ payload
   - Reject 401 nếu token invalid/expired
   - Gắn req.user = {id, role, ...}

② Route-level RBAC middleware:
   - Decorator hoặc guard function: requireRole('btc')
   - Reject 403 nếu req.user.role không match
   - Ví dụ: POST /admin/workshops chỉ cho 'btc'

③ Query-level filter (trong repository layer):
   - Student: SELECT registrations WHERE student_id = req.user.id
   - Staff check-in: SELECT checkins WHERE checked_by = req.user.id
   - KHÔNG expose hết bảng rồi filter ở application — SQL filter từ đầu
   - Đây là row-level security enforcement, không phải RBAC ở middleware
```

### 2. Lý do chọn

**3 roles với permission rõ ràng** — không có overlap hay attribute-level condition. RBAC là fit tự nhiên khi permission phân theo nhóm người dùng, không theo attribute của resource.

**Query-level filter (điểm ③)** là điểm dễ bị bỏ qua nhất. Nếu chỉ dùng middleware, endpoint `GET /registrations` của student vẫn có thể trả về tất cả registration nếu query không filter. Middleware bảo đảm *"student được vào endpoint này"*; query filter bảo đảm *"student chỉ thấy data của mình"* — hai điều khác nhau hoàn toàn.

### 3. Trade-off và rủi ro

**Role cứng không xử lý attribute-level permission.** Bài toán *"BTC chỉ được sửa workshop do chính mình tạo"* đòi ABAC — kiểm tra `created_by = current_user`. RBAC hiện tại cho phép mọi BTC sửa mọi workshop. Đây là quyết định có ý thức: đồ án này không có yêu cầu multi-BTC competition, nên toàn bộ BTC được trust như nhau. Schema đã có `workshops.created_by` để mở rộng sau — chỉ cần thêm check ở query layer, không cần thay đổi RBAC middleware.

**Role trong JWT không revoke được real-time.** Nếu admin downgrade một BTC thành student, JWT cũ (TTL 15 phút) vẫn mang role `btc` cho đến khi hết hạn. Window tối đa 15 phút — chấp nhận được với TTL ngắn (xem ADR-04). Nếu cần immediate revoke, thêm token blacklist Redis — ngoài scope đồ án.

**Enforcement 3 lớp phải nhất quán.** Nếu route ② cho phép nhưng query ③ không filter → data leak. Nếu query ③ filter đúng nhưng route ② từ chối → 403 sai. Cả hai lớp phải được review cùng nhau khi thêm endpoint mới — điều này phải đưa vào checklist code review.

### 4. Phương án đã cân nhắc nhưng không chọn

**ABAC (Attribute-Based Access Control):** Hỗ trợ policy phức tạp như *"chỉ xử lý workshop thuộc department của mình"*. Không cần thiết với 3 roles và permission matrix đơn giản hiện tại. ABAC đúng chỗ khi có nhiều attribute dimension — không phải bài toán này.

**Permission per-route lưu trong DB:** Linh hoạt, admin có thể thay đổi permission không cần deploy. Nhưng: thêm DB query cho mỗi request chỉ để check permission — overhead không xứng với lợi ích, vì permission matrix không thay đổi trong runtime.

**Role hierarchy (BTC inherit student permissions):** Cám dỗ "BTC nên xem được mọi thứ student xem được". Loại vì: BTC và student có usecase khác nhau (BTC quản lý, student dùng), gộp permission tạo confused responsibility. Nếu BTC cần test luồng student, cấp account student riêng — sạch hơn.

---

## ADR-06 — Rate Limiting

### 1. Quyết định

**Sliding Window Counter** với Redis Sorted Set, áp dụng 3 tier độc lập:

| Tier | Key | Limit | Window | Mục đích |
|---|---|---|---|---|
| T1 — IP (unauthenticated) | `rl:ip:{ip}` | 60 req | 60s | Bảo vệ login, public endpoints |
| T2 — User (authenticated) | `rl:user:{user_id}` | 30 req | 60s | General per-user fairness |
| T3 — User × Workshop | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | Chống spam một workshop cụ thể |

Request vi phạm bất kỳ tier nào → 429 với header `Retry-After: {seconds_until_reset}`.

**Implementation với Redis Sorted Set (Sliding Window):**

```
-- Mỗi request đến endpoint /workshops/:id/register:
key = "rl:reg:{user_id}:{workshop_id}"
now = current_unix_timestamp_ms
window_start = now - 60000

MULTI
  ZREMRANGEBYSCORE key 0 window_start          -- xóa events cũ ngoài window
  ZADD key now now                              -- thêm event hiện tại (score=member=timestamp)
  ZCARD key                                     -- đếm events trong window
  EXPIRE key 60                                 -- auto-cleanup
EXEC

IF count > 5 → 429
```

### 2. Lý do chọn

**Sliding Window** tránh "burst tại boundary" của Fixed Window: với Fixed Window, user có thể gửi 5 req ở giây 59 và 5 req ở giây 61 — 10 req trong 2 giây vẫn không bị chặn. Sliding Window tính đúng "5 req trong 60s bất kỳ".

**Tier 3 (per user per workshop)** là tier quan trọng nhất cho bài toán: ngăn một sinh viên spam click "Đăng ký" cho cùng workshop — giảm hot-row contention (ADR-03) và giảm OL retry rate (ADR-13). Đây là vòng ngoài cùng của defense-in-depth cho seat contention.

**Redis Sorted Set** dùng timestamp làm cả score lẫn member — cho phép range query `ZREMRANGEBYSCORE` để slide window mà không cần background cleanup job.

**Boundary:** IP-based rate limiting (T1) có thể block nhiều user đứng sau cùng NAT (ký túc xá, WiFi trường). Giảm thiểu bằng: T1 chỉ áp dụng cho unauthenticated endpoints; sau khi login, T2 (per user_id) là binding — NAT không còn vấn đề.

### 3. Trade-off và rủi ro

**Redis là SPOF cho toàn bộ rate limiting.** Nếu Redis down, ZREMRANGEBYSCORE fail → rate limiting tắt → mọi request đều qua. Chấp nhận được: Redis down thì cache (ADR-13) cũng tắt — hệ thống đã trong degraded mode; mất rate limiting là acceptable trong degraded mode vì OL (ADR-03) vẫn bảo đảm correctness. Không block critical path vì Redis failure (fail-open behavior cho rate limiting).

**Sliding Window dùng nhiều memory hơn Fixed Window.** Mỗi request là một entry trong Sorted Set (score=timestamp, member=timestamp). Với T3 limit 5 req/60s per user per workshop: mỗi user active có tối đa 5 entries × N workshops = vài chục entries Redis. Không đáng kể ở quy mô đồ án.

**Tier 3 key có cardinality cao.** `rl:reg:{user_id}:{workshop_id}` có thể có hàng trăm nghìn keys nếu mọi user thử mọi workshop. Không phải vấn đề thực tế vì TTL 60s tự cleanup — nhưng cần monitor Redis memory nếu scale.

### 4. Phương án đã cân nhắc nhưng không chọn

**Token Bucket:** Cho phép burst ngắn — phù hợp với API public có traffic tự nhiên không đều. Với workshop registration, không muốn burst: muốn mỗi user có rate đều đặn, không cho phép tích lũy "token" để blast. Sliding Window phù hợp hơn.

**Leaky Bucket:** Smooth output rate — queue request và xử lý đều đặn. Không phù hợp cho registration vì user expect response ngay lập tức, không chờ trong queue ảo.

**Fixed Window Counter:** Đơn giản nhất. Bị loại vì burst-at-boundary problem đã nêu trên.

---

## ADR-09 — Kiến trúc Notification

### 1. Quyết định

**Strategy Pattern in-process** — không dùng external Pub/Sub broker. `NotificationService` nhận event, iterate qua danh sách `NotificationChannel` đã đăng ký, gọi `send()` cho mỗi channel với **per-channel timeout 5 giây** và logging tường minh vào bảng `notification_logs` (xem schema ADR-02).

```typescript
interface NotificationChannel {
  readonly channelName: string;
  send(userId: string, event: NotificationEvent, payload: object): Promise<void>;
}

class EmailAdapter    implements NotificationChannel { ... }
class InAppAdapter    implements NotificationChannel { ... }
// Future — thêm không sửa code cũ:
// class TelegramAdapter implements NotificationChannel { ... }

class NotificationService {
  private static readonly CHANNEL_TIMEOUT_MS = 5000;
  
  constructor(
    private channels: NotificationChannel[],
    private logRepo: NotificationLogRepository
  ) {}
  
  async dispatch(userId: string, event: NotificationEvent, payload: object) {
    // Per-channel timeout — không để 1 channel chậm chặn cả batch
    const sendWithTimeout = (ch: NotificationChannel) =>
      Promise.race([
        ch.send(userId, event, payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CHANNEL_TIMEOUT')), 5000)
        )
      ]);
    
    const results = await Promise.allSettled(
      this.channels.map(async (ch) => {
        try {
          await sendWithTimeout(ch);
          await this.logRepo.log({
            userId, eventType: event, channel: ch.channelName,
            status: 'sent', payload
          });
        } catch (err) {
          // Failed notification log với context đầy đủ — KHÔNG silent failure
          await this.logRepo.log({
            userId, eventType: event, channel: ch.channelName,
            status: err.message === 'CHANNEL_TIMEOUT' ? 'timeout' : 'failed',
            errorMsg: err.message, payload
          });
          throw err;  // re-throw để Promise.allSettled ghi nhận
        }
      })
    );
    // results là array Settled — không throw lên caller
    // Notification là best-effort: business flow không phụ thuộc kết quả ở đây
  }
}
```

Đăng ký channel tại DI container (composition root), không phải runtime:

```typescript
// main.ts
const notificationService = new NotificationService(
  [
    new InAppAdapter(db),
    new EmailAdapter(smtpConfig),
    // new TelegramAdapter(botToken),  // uncomment để thêm Telegram
  ],
  new NotificationLogRepository(db)
);
```

**Extensibility (ASR-3):** Thêm Telegram = tạo `TelegramAdapter` + uncomment 1 dòng ở composition root. Không sửa `NotificationService`, không sửa `EmailAdapter`, không sửa bất kỳ business logic nào. Đây là OCP (Open/Closed Principle) áp dụng đúng chỗ.

### 2. Lý do chọn

**Throughput thực tế không đòi Pub/Sub:** Với 12,000 sinh viên, một batch notification khi workshop update có thể cần gửi 12,000 message. Nhưng đây là fire-and-forget batch, không phải real-time per-request. Redis Streams (ADR-10) xử lý batch job này async. Strategy Pattern chỉ cần chạy trong worker process — không cần Kafka/RabbitMQ.

**In-process có đủ isolation:** Nếu `TelegramAdapter.send()` throw, `Promise.allSettled` đảm bảo `EmailAdapter.send()` vẫn chạy. Failure của một channel không cascade sang channel khác.

**Per-channel timeout** ngăn pattern "SMTP server treo 30s → block toàn bộ dispatch". Nếu một channel timeout, log `status='timeout'` và tiếp tục — channel khác không bị ảnh hưởng. Đây là implementation detail bắt buộc, không optional.

**Logging chi tiết vào `notification_logs`:** "Best-effort" KHÔNG có nghĩa là "silent failure". Khi BTC hỏi "tại sao một số SV không nhận email?", admin truy `notification_logs WHERE status IN ('failed','timeout')` để biết: user nào, event gì, channel nào, lỗi cụ thể, và payload để retry thủ công nếu cần.

**Boundary:** Nếu worker process crash giữa batch notification, một số user không nhận được thông báo. Notification là best-effort — acceptable. Nếu cần exactly-once notification, cần Outbox Pattern (phức tạp, ngoài scope đồ án — pointer `specs/notification-outbox.md` Stage 5).

### 3. Trade-off và rủi ro

**Fan-out không đảm bảo thứ tự.** Nếu In-app notification cần xảy ra trước Email (ví dụ: user thấy notification trên app trước khi email đến), `Promise.allSettled` không bảo đảm điều đó. Với đồ án này, thứ tự không quan trọng — tất cả channels đều gửi cùng payload.

**Thêm channel = deploy lại.** Đăng ký channel ở composition root (main.ts) nghĩa là thêm Telegram cần deploy lại process. Không phải runtime-configurable. Acceptable cho đồ án — production có thể dùng plugin registry nếu cần hot-reload.

**Notification log table có thể grow nhanh.** Mỗi event × mỗi channel × mỗi user = 1 row. Với 12,000 user × 2 channels × 5 events/sự kiện = 120,000 rows/sự kiện. Cần job đêm xóa log > 30 ngày để giữ table size manageable.

**Massive fan-out có thể bùng nổ memory.** Nếu notify 12,000 user × 2 channels = 24,000 promise concurrent — high memory + có thể overload SMTP. Giải pháp: chia batch (ví dụ 100 user/batch) ở `notification-worker` consumer trong ADR-10, không gọi `dispatch()` cho tất cả 12,000 user cùng lúc.

### 4. Phương án đã cân nhắc nhưng không chọn

**Full Pub/Sub (Kafka/RabbitMQ) cho notification:** Overkill cho throughput thực tế. Kafka designed cho triệu msg/s; 12,000 notification/event là vài chục msg/s trong vài phút. Thêm Kafka = thêm cluster 3 nodes, thêm consumer group config, thêm operational overhead — không có ROI.

**Inline notification trong registration transaction:** Gửi email/Telegram trong cùng transaction PostgreSQL. Nếu SMTP timeout → transaction rollback → đăng ký thất bại. Coupling notification vào critical path là anti-pattern. Notification phải async và best-effort.

**Observer Pattern không có tách interface:** Đơn giản hơn Strategy. Loại vì: Observer không tách interface rõ ràng giữa "kênh thông báo" và "handler chung", khó test từng channel độc lập. Strategy với explicit `NotificationChannel` interface cho phép mock từng channel cho unit test.

---

## ADR-10 — Message Queue cho Async Processing

### 1. Quyết định

**Redis Streams** làm job queue cho hai loại async task:

| Task | Producer | Consumer | Timeout | Retry | DLQ |
|---|---|---|---|---|---|
| AI PDF summary | Upload handler | `ai-summary-worker` | 5 phút | 3 | `stream:ai-summary-dlq` |
| Batch notification dispatch | Event triggers (registration, cancellation) | `notification-worker` | 30 giây/batch | 2 | `stream:notifications-dlq` |

Stream keys: `stream:ai-summary`, `stream:notifications`.

Consumer group pattern — cho phép multiple worker instances (nếu cần scale sau):

```
XGROUP CREATE stream:ai-summary ai-workers $ MKSTREAM
XREADGROUP GROUP ai-workers worker-1 COUNT 1 BLOCK 5000 STREAMS stream:ai-summary >
-- Process job
XACK stream:ai-summary ai-workers {message-id}
```

`XACK` chỉ được gửi sau khi job hoàn thành — nếu worker crash trước XACK, message ở lại `PEL` (Pending Entries List) và được retry bởi worker khác (hoặc worker restart) qua `XAUTOCLAIM` (Redis 6.2+).

**Retry + DLQ flow:**

```
Worker fail → tăng retry counter trong message metadata
             IF retry_count < N → XACK + XADD lại vào stream chính (delay tăng dần)
             IF retry_count >= N → XACK + XADD vào DLQ stream
                                  → admin nhận notification, điều tra thủ công
```

### 2. Lý do chọn

**Redis đã có sẵn** (ADR-13 cache, ADR-06 rate limiting) — không add infrastructure mới. Redis Streams persistent hơn Redis Pub/Sub (Pub/Sub là fire-and-forget, Streams lưu message có offset như Kafka mini).

**AI summary là use case chuẩn cho async queue:** Upload PDF → return 202 Accepted ngay lập tức → worker xử lý background → khi done, update `workshops.summary_text` và `summary_status='done'` → frontend polling endpoint `GET /workshops/:id` để check status. Không block HTTP response.

**Boundary:** Nếu Redis crash và AOF không được config, pending jobs bị mất. AI summary cần re-trigger thủ công. Acceptable cho đồ án — production cần Redis Sentinel hoặc AOF `appendfsync always`.

### 3. Trade-off và rủi ro

**PEL (Pending Entries List) có thể tích lũy nếu worker crash không XACK.** Nếu `ai-summary-worker` crash sau khi XREADGROUP nhưng trước XACK, message ở lại PEL. Worker restart không tự nhận lại message trong PEL — cần chủ động `XAUTOCLAIM` để reclaim message đã idle quá threshold (ví dụ 10 phút). Implementation detail phải có, không phải optional.

**Một Redis instance cho cả cache + rate limit + streams.** Nếu AI summary job lớn tiêu thụ nhiều memory, có thể ảnh hưởng cache hit rate (Redis evict cache entries để nhường memory cho stream). Giải pháp đơn giản: dùng Redis 16 database slots — DB 0 cho cache (`maxmemory-policy allkeys-lru`), DB 1 cho streams (`maxmemory-policy noeviction`), DB 2 cho rate limit (volatile-ttl).

**DLQ không tự xử lý — chỉ lưu lại.** Job vào DLQ cần admin can thiệp thủ công. Cần dashboard hoặc CLI để admin duyệt DLQ — không phải code logic phức tạp nhưng cần có (ngoài scope ADR, đưa vào `specs/dlq-admin.md` Stage 5).

### 4. Phương án đã cân nhắc nhưng không chọn

**RabbitMQ:** Feature-rich (dead-letter queue, TTL per message, priority queue native). Phù hợp cho production nhưng thêm Docker container mới chỉ cho job queue, trong khi Redis đã có sẵn. "Đừng thêm infrastructure khi không cần thiết" — YAGNI.

**BullMQ (Redis-based higher-level library):** Abstracts Redis Streams với retry, priority, delayed jobs. Tốt cho production. Loại vì adds library dependency và hides Redis internals — cho đồ án học, hiểu Streams raw tốt hơn dùng abstraction.

**In-memory queue (Node.js EventEmitter):** Zero persistence, process restart = lost jobs. Không acceptable cho AI summary (có thể mất vài phút xử lý).

---

## ADR-11 — Mobile Offline Check-in và Sync Strategy

### 1. Quyết định

**Local-first với SQLite + Outbox Pattern** — check-in được ghi vào SQLite local ngay lập tức, sync lên server khi kết nối phục hồi.

**Local schema (SQLite trên device):**

```sql
CREATE TABLE local_checkins (
  local_id    TEXT PRIMARY KEY,   -- UUID v4 sinh offline (KHÔNG dùng id của server)
  qr_code     TEXT NOT NULL,
  checked_at  TEXT NOT NULL,      -- ISO 8601, lưu timezone của device
  status      TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'rejected', 'duplicate')),
  server_id   TEXT,               -- populated sau khi sync thành công
  sync_error  TEXT,               -- lý do rejected/duplicate từ server (kèm context)
  first_checkin_info TEXT,        -- nếu duplicate: "checked-in 14:32 by Staff Tran"
  created_at  TEXT NOT NULL
);
```

**Sync flow:**

```
Trigger: kết nối mạng phục hồi (Network Change Listener) HOẶC timer mỗi 30s

FOR EACH row WHERE status = 'pending':
  POST /checkins/sync
  Body: [{local_id, qr_code, checked_at}, ...]   -- batch, tối đa 50/request
  
  Server response:
  [
    {local_id, result: "ok", server_id: "..."},
    {local_id, result: "duplicate", first_checkin_at: "...", first_staff_name: "..."},
    {local_id, result: "rejected", reason: "workshop_cancelled" | "qr_invalid"}
  ]
  
  UPDATE local_checkins SET status = result, server_id = ?, 
                            sync_error = ?, first_checkin_info = ?
    WHERE local_id = ?
```

**Conflict resolution — Server wins, First check-in wins (xem schema `checkins` ADR-02):**

```sql
-- Server-side endpoint /checkins/sync
INSERT INTO checkins (id, registration_id, checked_in_at, received_at, checked_by, client_local_id)
  SELECT gen_random_uuid(), r.id, :checked_at, now(), :staff_id, :local_id
  FROM registrations r
  WHERE r.qr_code = :qr_code AND r.status = 'paid'
ON CONFLICT (registration_id) DO NOTHING   -- first wins
RETURNING id;

-- Nếu rowsAffected = 0:
--   → đã có check-in trước → query lấy info first check-in để trả về client
--   → result = "duplicate" với first_checkin_at và first_staff_name
-- Nếu r không tìm thấy (qr_code không tồn tại hoặc workshop cancelled):
--   → result = "rejected" với reason cụ thể
```

**Điểm go/no-go prototype (tuần 4):** Implement đủ: SQLite write → sync API → status update → UI reflect synced/rejected. Nếu không xong → degrade thành online-only check-in (xem operational note dưới).

**Operational note cho degrade path:** Nếu degrade thành online-only:

- Staff ở khu vực mất sóng cần di chuyển đến khu vực có sóng để check-in, hoặc dùng danh sách đăng ký in ra giấy
- BTC chuẩn bị sẵn danh sách backup (export từ admin trước sự kiện)
- Đây là operational fallback, không phải code path khác — staff thao tác khác với staff offline-capable

### 2. Lý do chọn

**Outbox pattern** (ghi local trước, sync sau) là cách duy nhất đảm bảo ASR-6 ("khu vực mất mạng vẫn check-in được"). Staff không cần nghĩ đến mạng — cứ quét, app confirm ngay, sync tự chạy.

**Batch sync (50 records/request)** thay vì per-record: khi kết nối phục hồi sau vài phút offline, có thể có 20-30 check-in pending. Gửi từng cái tốn nhiều round-trip; batch một lần là đủ.

**Server wins + First check-in wins:** Hai staff cùng quét một QR khi offline — cả hai ghi local. Khi sync: record đến server trước được nhận, record sau nhận `duplicate` với info ai check-in trước (`first_checkin_info`). Staff thấy context rõ ràng — không phải mù mờ.

**Boundary:** Nếu device không bao giờ kết nối lại (extreme case — mất điện, thiết bị hỏng), check-in offline bị mất. Acceptable — check-in là operational tracking, không phải financial transaction.

### 3. Trade-off và rủi ro

**"Duplicate" cần context với staff thứ hai.** Đã giải quyết: server trả `first_checkin_at` và `first_staff_name` trong response. Mobile app hiển thị: *"QR này đã được check-in lúc 14:32 bởi Staff Trần"* — staff B biết tình huống và có thể follow-up nếu cần.

**Đồng hồ device lệch.** `checked_at` lưu theo device clock — nếu device bị chỉnh sai giờ, dữ liệu check-in sai timestamp. Không ảnh hưởng logic "đã check-in hay chưa" (vì `ON CONFLICT (registration_id) DO NOTHING` check theo registration, không timestamp), nhưng ảnh hưởng report thống kê. Giải pháp: server lưu `received_at = now()` (đã có trong schema `checkins` ADR-02) để so sánh nếu cần audit.

**Timer 30 giây ảnh hưởng battery.** Background timer 30s giữ wakelock trên Android. Chấp nhận được cho use case (staff dùng trong sự kiện vài tiếng, không phải 24/7). Có thể dùng exponential backoff: 30s → 60s → 120s nếu không có pending records để giảm tải khi idle.

**go/no-go prototype cứng ở tuần 4.** Đây là ràng buộc team, không phải technical trade-off. Nếu không đạt: degrade thành online-only, tất cả check-in cần kết nối. Document hạn chế rõ ràng trong proposal.

### 4. Phương án đã cân nhắc nhưng không chọn

**Online-only check-in:** Không đáp ứng ASR-6. Đây là "phương án degrade" nếu ADR-11 prototype thất bại — không phải lựa chọn thiết kế ban đầu.

**CouchDB/PouchDB replication:** Industry-standard offline sync. Loại vì: (a) đòi CouchDB server mới, (b) full replication toàn bộ DB xuống device không phù hợp (staff chỉ cần check-in data, không cần workshop list hay payment history), (c) overkill cho use case đơn giản — chỉ cần upload delta (pending check-ins), không cần bidirectional sync.

**Single-device-only mode (không sync):** Mỗi staff chỉ check-in được trên device của mình, không cross-device visibility. Loại vì BTC cần xem aggregated check-in từ tất cả staff trong real-time.

---

## ADR-12 — CSV Import Pipeline

### 1. Quyết định

**Batch Sequential Pipeline** chạy theo lịch, với error quarantine và idempotent upsert.

**5 stage tuần tự:**

```
Stage 1 — Scheduler:
  Cron: 02:00 AM Asia/Ho_Chi_Minh hàng ngày
  -- Pin timezone trong config; KHÔNG dùng UTC mặc định:
  --   File CSV được legacy export theo giờ trường (UTC+7).
  --   Nếu cron chạy theo UTC, "2am UTC" = 9am giờ trường — sai window
  Tìm file CSV mới nhất trong thư mục input/ (pattern: students_YYYY-MM-DD.csv)
  Nếu không có file → log warning vào import_logs, dừng (hệ thống vẫn chạy với dữ liệu cũ)

Stage 2 — Parse & Split:
  Streaming parser — đọc và xử lý từng batch 500 rows, KHÔNG load toàn bộ vào RAM
  Validate format mỗi row (UTF-8, đủ cột, encoding)
  Split thành valid_rows[] và invalid_rows[]
  invalid_rows: sai format, thiếu required field

Stage 3 — Validate (business rules):
  Check student_id format (ví dụ: "SV" + 8 chữ số)
  Check email format
  Check duplicate within file (cùng student_id xuất hiện 2 lần trong CSV)
  Duplicate within file → giữ row cuối cùng (last-wins), log warning

Stage 4 — Upsert (idempotent):
  -- Per batch 500 rows
  INSERT INTO students (student_id, email, full_name, updated_at)
  VALUES (:id, :email, :name, now()) ...
  ON CONFLICT (student_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = now();
  -- Chạy lại cùng file 2 lần → cùng kết quả (idempotent)

Stage 5 — Error Quarantine + Audit:
  invalid_rows → ghi vào errors/YYYY-MM-DD.csv với cột error_reason
  INSERT INTO import_logs (id, run_at, total_rows, success_count, failed_count,
                           error_file_path, triggered_by, status)
  Gửi notification cho BTC nếu failed_count > 0
```

**Tính cách ly với hệ thống đang chạy:** Pipeline chạy trong `csv-sync` module, không lock bảng `students` — upsert PostgreSQL không block SELECT từ các module khác. Nếu pipeline crash giữa chừng, hệ thống tiếp tục chạy với dữ liệu sinh viên của lần import gần nhất.

**Concurrent run protection:** Trước khi bắt đầu, check `import_logs` có row `status='in_progress'` không. Nếu có → log warning, exit. Cron + manual trigger không thể chồng nhau.

### 2. Lý do chọn

**Idempotent upsert** là tính chất quan trọng nhất: pipeline có thể bị restart, chạy lại nhiều lần mà không tạo duplicate hay mất data. Chạy đêm nay, chạy lại sáng mai nếu cần sửa lỗi — kết quả như nhau.

**Error quarantine (không xóa, không dừng):** Invalid rows không làm pipeline dừng và không làm valid rows mất. BTC có file lỗi cụ thể để điều tra — không phải "import thất bại, bắt đầu từ đầu".

**Cron 2am Asia/Ho_Chi_Minh** (không phải UTC, không phải trigger on file upload) vì:

- Spec không có API hay webhook từ hệ thống sinh viên — polling thư mục là cách duy nhất tích hợp một chiều với legacy system
- Pin timezone tránh confusion: `cron: "0 2 * * *"` trong Linux thường default UTC; với deploy ở VN, dev local có thể `+7` nhưng container có thể UTC. Config rõ `TZ=Asia/Ho_Chi_Minh` cho cron service.
- 2am giờ VN = sau giờ làm việc, đảm bảo file CSV đã được export xong từ legacy

**Streaming parse** (không load toàn bộ file vào RAM) bắt buộc cho file lớn. Với 50,000 sinh viên × ~200 byte/row = 10MB không phải vấn đề lớn, nhưng nếu file tương lai có thêm cột (ảnh, metadata) có thể lên 100MB+. Streaming là defensive design.

**Boundary:** Nếu sinh viên vừa được thêm vào file CSV nhưng pipeline chưa chạy (trong ngày), họ chưa có account để đăng ký. Window tối đa là ~24h — acceptable vì workshop đăng ký trước nhiều ngày, không phải ngày-của.

### 3. Trade-off và rủi ro

**File lớn và memory.** Đã giải quyết bằng streaming parse + batch upsert (500 rows/batch). Implementation detail quan trọng, không phải optional ở scale thực tế.

**Pipeline chạy cùng lúc hai lần.** Đã giải quyết bằng `import_logs` status check. Nếu phát hiện in-progress run → exit với log warning. Đơn giản hơn distributed lock và đủ cho single-process monolith.

**File path injection.** Scheduler tìm file theo pattern `students_YYYY-MM-DD.csv` trong thư mục input/. Nếu attacker đặt file `students_2024-01-01.csv` với dữ liệu độc hại (ví dụ: student_id của người khác), pipeline upsert bình thường. Giảm thiểu: restrict quyền write vào thư mục input/ — chỉ legacy system và BTC mới được ghi. File là input tin cậy từ nguồn tin cậy.

**Timezone drift sau Daylight Saving.** Việt Nam không có DST, nên Asia/Ho_Chi_Minh ổn định UTC+7. Nếu deploy quốc tế sau, cần re-evaluate cron schedule.

### 4. Phương án đã cân nhắc nhưng không chọn

**Trigger import khi file xuất hiện (inotify/fs.watch):** Reactive hơn cron. Loại vì: file từ legacy system có thể được ghi dần (không atomic) — trigger quá sớm đọc file chưa complete. Cron đảm bảo file đã "settled" trước khi đọc.

**TRUNCATE rồi INSERT lại toàn bộ:** Đơn giản hơn upsert. Loại vì: trong thời gian TRUNCATE → INSERT, các module khác query bảng `students` sẽ thấy empty → FK constraint fail cho các registration đang processing. Upsert giữ bảng consistent trong suốt quá trình.

**Real-time sync (CDC từ legacy DB):** Yêu cầu access vào legacy DB hoặc message broker. Spec không cho phép. CSV polling là phương án tương thích duy nhất.

---

## ADR-14 — AI Summary Pipeline

### 1. Quyết định

**Async AI Summary** qua Redis Streams (ADR-10), với external AI provider (OpenAI hoặc tương đương) và fallback graceful khi provider down.

**Provider:** OpenAI GPT-4o-mini API (hoặc Claude 3 Haiku — cả hai đều phù hợp về chi phí và latency cho summary task). Quyết định cuối: OpenAI vì có SDK phổ biến hơn. Provider được abstract qua interface để dễ swap:

```typescript
interface AIProvider {
  summarize(text: string, maxTokens: number): Promise<string>;
}
class OpenAIProvider implements AIProvider { ... }
// class AnthropicProvider implements AIProvider { ... }  // dễ swap nếu cần
```

**PDF processing:** `pdf-parse` (Node.js) hoặc `PyPDF2` (Python) tùy ngôn ngữ chọn. Mục tiêu: extract text từ PDF, không xử lý OCR cho PDF scan (out of scope).

**Storage:** `workshops.summary_text` (TEXT) và `workshops.summary_status` (xem schema ADR-02). Không tách bảng `workshop_summaries` riêng — 1-1 với workshop, không có lý do tách. PDF lưu ở object storage hoặc filesystem (`/uploads/workshops/{id}.pdf`); URL lưu trong `workshops.pdf_url`.

**Luồng đầy đủ:**

```
Stage 1 — Upload (sync, response 202):
  POST /admin/workshops/:id/pdf (BTC role)
  Lưu file vào /uploads/workshops/{id}.pdf
  UPDATE workshops SET pdf_url = ..., summary_status = 'queued';
  XADD stream:ai-summary * workshop_id={id}
  Return 202 Accepted với polling URL

Stage 2 — Worker (async):
  XREADGROUP từ stream:ai-summary
  UPDATE workshops SET summary_status = 'processing';
  
  TRY:
    text = parsePDF(pdf_url)            -- timeout 30s
    IF text.length > 50,000 chars:
      text = text.substring(0, 50,000)  -- truncate, log warning
    summary = aiProvider.summarize(text, maxTokens=300)  -- timeout 2 phút
    UPDATE workshops SET summary_text = summary, summary_status = 'done';
  CATCH error:
    increment retry_count
    IF retry_count < 3:
      XADD stream:ai-summary lại với delay (exponential backoff)
    ELSE:
      UPDATE workshops SET summary_status = 'failed';
      XADD stream:ai-summary-dlq (admin điều tra)
      Notify BTC qua notification service
  XACK message

Stage 3 — Frontend polling:
  GET /workshops/:id → trả summary_status
  Frontend polling mỗi 5s khi status = 'queued'/'processing'
  Khi 'done': hiển thị summary_text
  Khi 'failed': hiển thị "Không thể tạo tóm tắt tự động" + button BTC retry thủ công
```

### 2. Lý do chọn

**Async qua queue** (không inline trong upload handler) vì AI summary có thể mất 30s–2 phút — block HTTP response là UX tệ và risk timeout reverse proxy. 202 Accepted + polling là pattern chuẩn cho long-running task.

**Provider abstraction** vì đồ án có thể bị giới hạn về API key (rate limit free tier) — cần dễ swap sang Claude hoặc local model (Ollama) nếu cần. Interface đơn giản, không phụ thuộc vào feature riêng của provider nào.

**Truncate text 50,000 chars** thay vì reject: PDF dài (>20 trang) không phải lỗi user, là use case bình thường. Tóm tắt phần đầu vẫn hữu ích hơn không có gì. Giới hạn 50K chars ≈ 12K tokens — vừa context window của hầu hết model rẻ.

**`summary_status` enum đầy đủ** (`none`/`queued`/`processing`/`done`/`failed`) cho phép frontend hiển thị progress chính xác. Nếu chỉ có `done`/`not done`, user không phân biệt được "đang xử lý" với "chưa upload PDF".

### 3. Trade-off và rủi ro

**AI provider down → toàn bộ feature fail.** Mỗi PDF đều cần API call. Khi OpenAI down (đã xảy ra nhiều lần), toàn bộ workshop mới upload không có summary. Mitigation: (a) retry với exponential backoff 3 lần, (b) sau 3 lần fail → mark `summary_status = 'failed'`, không retry tự động, (c) BTC có thể retry thủ công qua admin button. Đây là lý do KHÔNG put AI summary vào critical registration flow — chỉ là enrichment, workshop vẫn hoạt động đầy đủ mà không có summary.

**Cost monitoring.** OpenAI tính tiền per-token. Đồ án trial có thể vượt budget nếu BTC upload nhiều PDF lớn. Mitigation: limit `maxTokens=300` cho output, truncate input ở 50K chars, monitor chi phí qua OpenAI dashboard.

**Hallucination — AI tóm tắt sai nội dung PDF.** Không có cơ chế verify automatically. BTC review summary trước khi publish workshop là quy trình nghiệp vụ — không phải code. Document trong UI: "Tóm tắt tự động bởi AI, vui lòng kiểm tra trước khi xuất bản".

**PDF OCR (scan) không hỗ trợ.** PDF dạng image không có text layer → `pdf-parse` trả empty → AI summary trả về vô nghĩa. Detect: nếu `text.length < 100`, mark `summary_status = 'failed'` với reason `"pdf_no_text"` — BTC biết PDF không phù hợp.

**Privacy — gửi nội dung PDF lên external API.** Nếu PDF có thông tin nhạy cảm (danh sách sinh viên, thông tin cá nhân), gửi sang OpenAI là vi phạm. Document trong UI: "Không upload PDF chứa thông tin cá nhân" và disable feature cho workshop có flag `sensitive_content` (nếu có sau).

### 4. Phương án đã cân nhắc nhưng không chọn

**Local LLM (Ollama, llama.cpp):** Privacy-friendly, không phụ thuộc external. Loại vì: (a) hardware đòi GPU hoặc CPU mạnh — không có sẵn trên Docker Compose dev của đồ án, (b) chất lượng summary thấp hơn đáng kể với model nhỏ chạy local, (c) thêm 1 service mới (Ollama container) chỉ cho 1 feature.

**Inline summary trong upload handler (không async):** Đơn giản hơn về flow. Loại vì: HTTP timeout sau 30s, mà AI có thể mất 2 phút. Reverse proxy timeout sẽ làm BTC nhận lỗi dù process vẫn chạy ở backend.

**Pre-compute summary từ template (không dùng AI):** BTC điền form với fields predefined → server format thành "summary". Không cần AI. Loại vì: spec rõ ràng "AI Summary" là tính năng required (xem proposal Section 4.1) — không phải template formatting.

**Tích hợp với Anthropic Claude thay vì OpenAI:** Khả thi, chất lượng tương đương. Quyết định cuối chọn OpenAI vì SDK ecosystem rộng hơn cho Node.js/Python — nhưng abstraction qua `AIProvider` interface cho phép swap nếu OpenAI có vấn đề về API key hoặc cost.
