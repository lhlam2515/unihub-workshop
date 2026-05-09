# Spec: Đăng ký Workshop Có Phí (`registration-paid`)

> **ASR hiện thực hóa:** ASR-1 (Spike Load), ASR-2 (Strong Consistency), ASR-4 (Fault Isolation), ASR-5 (Idempotent Payment)
>
> **ADR tham chiếu:** ADR-03 (Optimistic Locking), ADR-07 (Circuit Breaker), ADR-08 (Idempotency Key), ADR-13 (Cache), ADR-04 (JWT), ADR-05 (RBAC), ADR-06 (Rate Limiting)
>
> **Trade-off chủ đạo:** CP — Strong Consistency được ưu tiên tuyệt đối cho seat allocation. Availability được hy sinh có chủ ý khi tranh chấp cao: trả 503 thay vì oversell.

---

## 1. Mô tả

Luồng này bao gồm hai phase nối tiếp nhau:

**Phase A — Đăng ký chỗ:** Student gửi yêu cầu đăng ký. Hệ thống kiểm tra slot qua Redis cache, rồi thực hiện Optimistic Lock trên PostgreSQL để decrement `seats_available`. Đảm bảo không quá hai student nhận cùng chỗ cuối cùng.

**Phase B — Thanh toán:** Sau khi đăng ký thành công (status `pending`), student gửi yêu cầu thanh toán. Hệ thống kiểm tra Circuit Breaker, forward idempotency key đến gateway, và xử lý kết quả xác định (200/4xx) hoặc không xác định (timeout).

Hai phase được tách biệt bởi trạng thái `registrations.status`: Phase A kết thúc với `pending`, Phase B chuyển lên `paid`.

---

## 2. Luồng chính

### Phase A — Đăng ký chỗ

```
Preconditions:
  - Student đã xác thực JWT hợp lệ (role = 'STUDENT')
  - Workshop tồn tại, status = 'OPEN'
  - Student chưa có registration cho workshop này

Request:
  POST /registrations
  Headers:
    Authorization: Bearer <access_token>
    X-Idempotency-Key: <UUID v4 do client sinh trước>
  Body: {}
```

**Bước 0 — Rate Limiting (trước toàn bộ logic nghiệp vụ):**

```
Kiểm tra 3 tier theo thứ tự:
  T1: rl:ip:{ip}                       — 60 req/60s
  T2: rl:user:{user_id}                — 30 req/60s
  T3: rl:reg:{user_id}:{workshop_id}   — 5 req/60s  ← tier quan trọng nhất

Vi phạm bất kỳ tier → 429
  Response: { "error": "rate_limit_exceeded", "retry_after": <seconds> }
  Header:   Retry-After: <seconds>
```

**Bước 1 — Pre-check slot (Redis, không chạm DB):**

```
GET cache:workshop:{workshop_id}:seats

Nếu cache hit = "0":
  → 422 { "error": "workshop_full", "message": "Workshop đã hết chỗ" }
  → Kết thúc (tiết kiệm 1 DB round-trip)

Nếu cache miss:
  SELECT seats_available FROM workshops WHERE id = :workshop_id AND status = 'OPEN'
  SET cache:workshop:{workshop_id}:seats {value} EX 10
  Nếu seats_available = 0 → 422 như trên

Nếu cache hit > "0" hoặc DB read > 0 → tiếp tục Bước 2
```

**Bước 2 — Claim Idempotency Key (ngoài transaction chính):**

```
INSERT INTO idempotency_keys
  (key, resource_type, status, locked_until)
VALUES
  (:idempotency_key, 'registration', 'IN_PROGRESS', now() + interval '30 seconds')
ON CONFLICT (key) DO NOTHING
RETURNING key;

Nếu không có row trả về (conflict):
  SELECT status, response_body, status_code, locked_until
  FROM idempotency_keys WHERE key = :idempotency_key;

  CASE status:
    'COMPLETED':
      → Trả response_body đã cache (true duplicate request)
      → Kết thúc

    'IN_PROGRESS' AND locked_until > now():
      → 409 { "error": "request_in_progress",
               "retry_after": <seconds_until_locked_until> }
      → Kết thúc

    'IN_PROGRESS' AND locked_until <= now():
      -- Crash recovery
      UPDATE idempotency_keys
        SET locked_until = now() + interval '30 seconds'
        WHERE key = :idempotency_key AND status = 'IN_PROGRESS'
      → Tiếp tục Bước 3

Nếu có row trả về (INSERT thành công) → Tiếp tục Bước 3
```

**Bước 3 — Ghi có điều kiện với Optimistic Lock (có retry nội bộ):**

```
MAX_RETRIES = 1   -- tổng 2 attempts (1 original + 1 retry)
attempts    = 0

WHILE attempts <= MAX_RETRIES:

  -- Pure OL: đọc KHÔNG dùng FOR SHARE / FOR UPDATE
  SELECT id, version, seats_available
  FROM workshops WHERE id = :workshop_id;

  IF seats_available = 0:
    → result = { status: "sold_out" }; BREAK

  BEGIN TRANSACTION;

    UPDATE workshops
      SET seats_available = seats_available - 1,
          version         = version + 1,
          updated_at      = now()
    WHERE id      = :workshop_id
      AND version = :version_vừa_đọc
      AND seats_available > 0;

    IF rowsAffected = 0:
      ROLLBACK;
      attempts += 1; CONTINUE
      -- KHÔNG quay lại Bước 1 hoặc Bước 2

    INSERT INTO registrations
      (id, workshop_id, student_id, status, qr_code)
    VALUES
      (gen_random_uuid(), :workshop_id, :student_id, 'PENDING',
       gen_random_uuid()::text)
    ON CONFLICT (workshop_id, student_id) DO NOTHING;

    IF rowsAffected_INSERT = 0:
      ROLLBACK;   -- BẮT BUỘC: tránh phantom seat loss
      → result = { status: "already_registered" }; BREAK

  COMMIT;
  → result = { status: "success",
               registration_id: <id>,
               qr_code: <qr_code> }; BREAK

IF attempts > MAX_RETRIES:
  → result = { status: "conflict_exhausted" }
```

**Bước 4 — Finalize Idempotency Key:**

```
UPDATE idempotency_keys
  SET status        = 'COMPLETED',
      response_body = :result_json,
      status_code   = :http_status,
      expires_at    = now() + interval '24 hours',
      locked_until  = NULL
WHERE key = :idempotency_key;
```

**Bước 5 — Invalidate Cache (fire-and-forget):**

```
DEL cache:workshop:{workshop_id}:seats
-- Nếu DEL fail (Redis down): cache tự expire sau TTL 10s — acceptable
```

**Bước 6 — Kích hoạt Notification (async):**

```
addJob notification * {
  event_type: 'registration_confirmed',
  user_id:    :student_id,
  payload:    { workshop_id, workshop_title, starts_at, qr_code }
}
-- Notification không block response. Fail ở đây không rollback registration.
```

---

### Phase B — Thanh toán

> **Cơ chế bên dưới:** Phase B tích hợp ba cơ chế từ `safety-mechanism.md`:
> (1) Idempotency Key 3-state — lý do `unresolved ≠ completed`, crash recovery, TTL cleanup
> (2) Circuit Breaker — lý do ordering ① trước ②, HALF-OPEN atomic probe, in-memory state
> (3) Forward key đến gateway — lý do không dùng server-generated key
> Tài liệu này định nghĩa **hành vi quan sát được** (HTTP contract, error handling, AC).
> `safety-mechanism.md` định nghĩa **lý do thiết kế** từng bước.

```
Preconditions:
  - registrations.status = 'PENDING' và thuộc về student hiện tại
  - workshops.price > 0
  - Student đã xác thực JWT hợp lệ (role = 'STUDENT')

Request:
  POST /payments
  Headers:
    Authorization: Bearer <access_token>
    X-Idempotency-Key: <UUID v4 do client sinh trước, lưu ở localStorage>
  Body: {
    "registration_id": "<UUID>"
  }

QUAN TRỌNG: `X-Idempotency-Key` được sinh một lần trước khi gửi request đầu tiên.
            Client KHÔNG được sinh key mới khi retry — phải dùng lại cùng header value.
```

**Bước ① — Idempotency Check (PHẢI ĐỨNG TRƯỚC Circuit Breaker):**

```
SELECT status, response_body, status_code
FROM idempotency_keys
WHERE key = :payment_key AND resource_type = 'payment';

Nếu status = 'COMPLETED':
  → Trả response_body đã cache — kể cả khi CB đang OPEN
  → Kết thúc

Nếu status = 'UNRESOLVED':
  → KHÔNG trả cache (kết quả chưa xác định)
  → Tiếp tục ② để retry với gateway dedup

Nếu status = 'IN_PROGRESS' AND locked_until > now():
  → 409 { "error": "payment_in_progress" }
  → Kết thúc

Nếu không tồn tại HOẶC (in_progress AND locked_until <= now()):
  → Tiếp tục ②
```

**Bước ② — Circuit Breaker Check (PHẢI SAU Idempotency Check):**

```
IF state = OPEN:
  → 503 { "error": "payment_unavailable",
           "message": "Hệ thống thanh toán tạm thời gián đoạn. Thử lại sau ~30 giây.",
           "retry_after": 30 }
  → Kết thúc (KHÔNG động đến idempotency table)

IF state = HALF_OPEN:
  → Cho phép đúng 1 request probe đi qua (atomic CAS)
  → Các request đồng thời khác → 503 như OPEN

IF state = CLOSED → Tiếp tục ③
```

**Bước ③ — Claim/Refresh Idempotency Key:**

```
Case A — key chưa tồn tại:
  INSERT INTO idempotency_keys
    (key, resource_type, status, locked_until)
  VALUES (:payment_key, 'payment', 'IN_PROGRESS', now() + interval '30s');

Case B — key tồn tại với status = 'UNRESOLVED' hoặc 'IN_PROGRESS' expired:
  UPDATE idempotency_keys
    SET status       = 'IN_PROGRESS',
        locked_until = now() + interval '30s'
  WHERE key = :payment_key
    AND (status = 'UNRESOLVED'
         OR (status = 'IN_PROGRESS' AND locked_until <= now()));

  IF rowsAffected = 0:
    -- Race condition: key đã chuyển 'COMPLETED' bởi request concurrent
    → Re-execute Bước ① logic → trả cached response
    → Kết thúc
```

**Bước ④ — Tạo Payment Record và Gọi Gateway:**

```
INSERT INTO payments
  (id, registration_id, amount, currency, idempotency_key, status)
VALUES
  (gen_random_uuid(), :registration_id, :amount, 'VND', :payment_key, 'INITIATED');

POST https://gateway/charge
Headers: X-Idempotency-Key: {payment_key}   ← FORWARD key đến gateway
Timeout: 5 giây

CASE kết quả:
  200 OK          → ⑤ resolved='COMPLETED', pmt_status='SUCCEEDED'
  402 declined    → ⑤ resolved='COMPLETED', pmt_status='FAILED'
                     CB: KHÔNG ghi failure (đây là client error)
  4xx khác        → ⑤ resolved='COMPLETED', pmt_status='FAILED'
                     CB: KHÔNG ghi failure
  5xx / timeout   → CB ghi 1 failure
                     ⑤ resolved='UNRESOLVED', pmt_status='UNRESOLVED'
```

**Bước ⑤ — Finalize Key và Payment (atomic):**

```
BEGIN TRANSACTION;
  UPDATE idempotency_keys
    SET status        = :resolved,           -- 'COMPLETED' hoặc 'UNRESOLVED'
        status_code   = :http_status,        -- NULL nếu unresolved
        response_body = :response_json,      -- NULL nếu unresolved
        expires_at    = now() + interval '24h',
        locked_until  = NULL
  WHERE key = :payment_key;

  UPDATE payments
    SET status            = :pmt_status,
        gateway_charge_id = :charge_id,      -- NULL nếu unresolved
        resolved_at       = now()
  WHERE idempotency_key = :payment_key;
COMMIT;
```

**Bước ⑥ — Post-commit:**

```
Nếu pmt_status = 'SUCCEEDED':
  UPDATE registrations SET status = 'PAID' WHERE id = :registration_id;
  addJob notification * { event_type: 'payment_confirmed', ... }
  → 200 { status: "succeeded", receipt_id: :charge_id }

Nếu pmt_status = 'UNRESOLVED':
  → 504 { "error": "payment_timeout",
           "retry_same_key": true,
           "idempotency_key": :payment_key,
           "retry_after": 30 }
  -- Client PHẢI dùng lại payment_key này, KHÔNG sinh key mới

Nếu pmt_status = 'FAILED':
  → 402 { "error": "payment_declined",
           "gateway_reason": :decline_code }
```

---

## 3. Kịch bản lỗi

| Kịch bản | Điều kiện | HTTP | Response | DB state |
|---|---|---|---|---|
| E-01: Hết chỗ (cache) | cache = "0" | 422 | `workshop_full` | Không tạo idempotency key |
| E-02: Hết chỗ (DB) | seats_available = 0 | 422 | `workshop_full` | Cache set "0" |
| E-03: OL conflict exhausted | 2 attempts đều conflict | 503 | `high_contention`, Retry-After: 2 | Key finalized 'COMPLETED' |
| E-04: Duplicate registration | UNIQUE bắt, ROLLBACK | 422 | `already_registered` | seats_available không thay đổi |
| E-05: True duplicate request | Key status='COMPLETED' | (cached) | response_body cũ | Không ghi thêm |
| E-06: Key in_progress | locked_until chưa hết | 409 | `request_in_progress` | Không thay đổi |
| E-07: CB OPEN | State = OPEN | 503 | `payment_unavailable` | Key KHÔNG được claim |
| E-08: Gateway timeout | 5s không response | 504 | `payment_timeout`, retry_same_key=true | payment='UNRESOLVED', key='UNRESOLVED' |
| E-09: Gateway 5xx | HTTP 5xx | 502 | `gateway_error` | payment='FAILED', CB ghi failure |
| E-10: JWT expired | exp < now() | 401 | `token_expired` | Không thay đổi |
| E-11: Server crash mid-flow | Process kill sau Bước 2 | — | Timeout cho client | Key kẹt 'IN_PROGRESS' đến locked_until |

### Chi tiết E-08 — Gateway Timeout (kịch bản phức tạp nhất)

```
T=0s:   Client gửi POST /payments với X-Idempotency-Key: K
T=0.1s: Server claim K='IN_PROGRESS'
T=0.1s: Server INSERT payments (status='INITIATED')
T=0.1s: Server gọi gateway với header X-Idempotency-Key: K
T=5s:   Timeout (không nhận response)
T=5s:   Server: CB ghi 1 failure
T=5s:   Server: UPDATE payments SET status='UNRESOLVED'
T=5s:   Server: UPDATE idempotency_keys SET status='UNRESOLVED'
T=5s:   Server: Trả 504 + { retry_same_key: true, payment_key: K }

Client retry T=35s với cùng key K:
  Bước ①: status='UNRESOLVED' → KHÔNG trả cache, tiếp tục
  Bước ②: CB check (có thể đã HALF-OPEN sau 30s)
  Bước ③: UPDATE key về 'IN_PROGRESS' (case B)
  Bước ④: Gọi gateway với header X-Idempotency-Key: K
           Gateway nhận K đã xử lý → trả kết quả đã cache (200 hoặc 402)
  Bước ⑤: Finalize key='COMPLETED', payment='SUCCEEDED'/'FAILED'
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — No Double Booking:**
S�� lượng `registrations` với `(workshop_id=X, status IN ('PENDING','PAID'))` ≤ `workshops.seats_total`.
Enforcement: `WHERE seats_available > 0` trong OL UPDATE + `UNIQUE(workshop_id, student_id)`.

**INV-02 — No Phantom Seat Loss:**
`seats_available` chỉ được decrement khi `INSERT registrations` thành công trong cùng transaction.
Nếu INSERT bị UNIQUE constraint → ROLLBACK toàn bộ transaction (kể cả OL UPDATE).

**INV-03 — Idempotency Ordering:**
`Idempotency check (①)` TRƯỚC `Circuit Breaker check (②)` TRƯỚC `Claim key (③)`.
Đây là ordering bắt buộc, không phải tùy ý.

**INV-04 — No Double Charge:**
Cùng `payment_key` không bao giờ dẫn đến hai charge thành công tại gateway.
Enforcement: Forward `payment_key` làm gateway `X-Idempotency-Key` header.

**INV-05 — Unresolved ≠ Completed:**
Key `unresolved` KHÔNG được cache như response xác định.
Retry với key `unresolved` PHẢI được phép tiếp cận gateway.

**INV-06 — OL Retry Scope:**
OL retry chỉ re-read version và re-attempt UPDATE.
Retry KHÔNG quay lại Bước 1 (pre-check) hoặc Bước 2 (idempotency claim).

**INV-07 — Cache Is Hint Only:**
Cache không bao giờ được dùng để quyết định final answer về seat availability.
Correctness luôn do `seats_available > 0` trong PostgreSQL đảm bảo.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Happy path đăng ký:**
Given workshop còn 1 chỗ, student gửi request với valid idempotency_key.
Then: 201 + registration_id + qr_code. DB: registrations +1, seats_available -1, version +1. Cache: DEL'd.

**AC-02 — Happy path thanh toán:**
Given registration status='PENDING', gateway mock trả 200.
Then: 200 + receipt_id. DB: payments.status='SUCCEEDED', registrations.status='PAID'.

**AC-03 — Idempotency registration (header):**
Given cùng `X-Idempotency-Key` header (đã 'COMPLETED').
Then: response giống lần 1. DB: KHÔNG có row mới.

**AC-04 — Idempotency payment — retry sau timeout (header):**
Lần 1: timeout → 504 + retry_same_key=true. Lần 2: cùng `X-Idempotency-Key` header → gateway confirm → 200.
DB: chỉ 1 payment record. Gateway: chỉ nhận 1 charge.

**AC-05 — Concurrent requests no oversell:**
Given 200 concurrent requests, workshop còn 100 chỗ.
Then: đúng 100 success, đúng 100 lỗi (sold_out/conflict). seats_available = 0, không âm.

**AC-06 — Circuit Breaker isolation:**
After 5 gateway timeouts: CB = OPEN.
Then: POST /payments → 503 trong < 5ms (không chờ gateway timeout).
And: GET /workshops → 200 bình thường.

**AC-07 — Free workshop skip Phase B:**
Given workshop.price = 0, Phase A thành công.
Then: registration.status = 'PAID' ngay. Không có payment record.

**AC-08 — Rate limiting T3:**
Given student gửi 6 registration requests cho cùng workshop trong 60s.
Then: request thứ 6 → 429 với Retry-After header.
