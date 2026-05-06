# UniHub Workshop — Thiết kế các cơ chế bảo vệ hệ thống

> **Phạm vi tài liệu:** Chi tiết kỹ thuật cho ba cơ chế bảo vệ hệ thống — Rate Limiting (ADR-06), Circuit Breaker (ADR-07), và Idempotency Key (ADR-08). Các ADR trong `design.md` mô tả *quyết định* và *lý do*; tài liệu này mô tả *cách hoạt động cụ thể* để implementation team không cần suy diễn lại từ ADR.
>
> **Cách đọc:** Ba phần độc lập — mỗi phần tự chứa đủ thông tin để implement. Tuy nhiên, mối quan hệ *giữa* ba cơ chế quan trọng: Rate Limiting là vòng ngoài cùng, Circuit Breaker là vòng giữa (chỉ cho payment path), Idempotency là tầng cuối cùng bảo đảm correctness cho dù các vòng ngoài bị bypass.

---

## Thiết kế các cơ chế bảo vệ hệ thống

### Kiểm soát tải đột biến

#### Bối cảnh và vấn đề

UniHub có spike tải đặc thù: 12.000 sinh viên có thể tranh giành đăng ký trong vòng 10 phút khi workshop mở. Điều này tạo ra áp lực tập trung lên một điểm duy nhất — endpoint `POST /workshops/:id/register` — thay vì tải phân tán đều như các hệ thống thương mại điện tử thông thường.

Không có rate limiting, database connection pool (giới hạn ~100 connections) sẽ cạn trong vài giây đầu, và mọi request (kể cả xem danh sách workshop, check-in) đều bị block. Rate limiting không giải quyết *fairness* (ai được đăng ký), mà giải quyết *stability* (hệ thống tiếp tục hoạt động dưới tải đột biến).

#### Giải pháp: Sliding Window Counter — 3 Tier độc lập

**Tại sao Sliding Window thay vì Fixed Window:**

Fixed Window chia thời gian thành các ô cố định (ví dụ: 0–60s, 60–120s). Vấn đề: user có thể gửi 5 request vào giây 59 và 5 request vào giây 61 — trong 2 giây thực tế nhận 10 request nhưng không tier nào bị vi phạm. Hiện tượng này gọi là *boundary burst*.

Sliding Window tính "N request trong 60 giây bất kỳ tính đến hiện tại" — không có boundary. Với bài toán workshop registration, không muốn cho phép burst ngắn vì mỗi request đến endpoint register đều tạo DB write và OL contention.

**Tại sao Redis Sorted Set thay vì các cách khác:**

Redis Sorted Set với `score = timestamp` cho phép thực hiện `ZREMRANGEBYSCORE` để "trượt" window bằng cách xóa các events cũ — không cần background cleanup job. Một MULTI/EXEC block bao gồm cả slide + insert + count là atomic ở phía Redis client, đủ để tránh race condition cho rate limiting (không cần correctness mức ACID như registration).

**Cấu trúc 3 Tier:**

```
T1 — IP (unauthenticated)
  Key:    rl:ip:{ip_address}
  Limit:  60 req / 60s
  Scope:  Login, public endpoints (GET /workshops, GET /workshops/:id)
  Lý do:  Ngăn brute-force login và scraping public API
  Lưu ý:  NAT — nhiều sinh viên đứng sau cùng IP (ký túc xá, WiFi trường)
          không phải vấn đề vì T1 chỉ áp dụng cho unauthenticated;
          sau login, T2 (per user_id) là binding — không còn NAT issue

T2 — User (authenticated, general)
  Key:    rl:user:{user_id}
  Limit:  30 req / 60s
  Scope:  Tất cả endpoint sau khi đã authenticated
  Lý do:  Per-user fairness; ngăn script automation trên nhiều workshop khác nhau

T3 — User × Workshop (authenticated, per-resource)
  Key:    rl:reg:{user_id}:{workshop_id}
  Limit:  5 req / 60s
  Scope:  POST /workshops/:id/register và POST /payments
  Lý do:  Vòng ngoài cùng của defense-in-depth cho seat contention;
          giảm hot-row contention tại workshops.version (ADR-03);
          giảm OL retry rate — nếu user spam 5 lần/giây thay vì 5 lần/phút,
          OL retry sẽ liên tục thất bại và tiêu thụ DB connection vô ích
```

**Thuật toán chi tiết (áp dụng cho từng tier):**

```
INPUT: key, limit, window_ms (= 60000ms)

now_ms = current_unix_timestamp_milliseconds
window_start_ms = now_ms - window_ms

-- Atomic block (Redis MULTI/EXEC):
ZREMRANGEBYSCORE key 0 window_start_ms   -- slide: xóa events ngoài window
ZADD key NX now_ms now_ms                -- insert event hiện tại
                                          -- NX đảm bảo không ghi đè nếu trùng ms (unlikely với ms precision)
ZCARD key                                -- đếm events còn lại trong window
EXPIRE key 60                            -- TTL: tự cleanup key không active

-- Sau EXEC:
count = result[2]  -- kết quả ZCARD
IF count > limit:
  oldest_in_window = ZRANGE key 0 0 WITHSCORES  -- lấy event cũ nhất
  retry_after_ms = (oldest_in_window.score + window_ms) - now_ms
  RETURN 429, headers: {
    Retry-After: ceil(retry_after_ms / 1000),
    X-RateLimit-Limit: limit,
    X-RateLimit-Remaining: 0,
    X-RateLimit-Reset: ceil((oldest_in_window.score + window_ms) / 1000)
  }
ELSE:
  RETURN proceed, headers: {
    X-RateLimit-Limit: limit,
    X-RateLimit-Remaining: limit - count,
    X-RateLimit-Reset: ceil((now_ms + window_ms) / 1000)
  }
```

**Thứ tự kiểm tra tier và behavior khi vi phạm:**

Với một request đến `POST /workshops/:id/register`, server kiểm tra T1 → T2 → T3 theo thứ tự. Dừng ngay khi tier đầu tiên vi phạm và trả 429 — không kiểm tra các tier còn lại (tiết kiệm Redis round-trip). Response 429 phải bao gồm `Retry-After` để client không retry ngay lập tức và gây storm.

```
Request đến POST /workshops/:id/register (authenticated)
  ↓
[T2] rl:user:{user_id} > 30?  → 429 Retry-After: N
  ↓ pass
[T3] rl:reg:{user_id}:{id} > 5?  → 429 Retry-After: M
  ↓ pass
Chuyển sang OL flow (ADR-03)
```

T1 không kiểm tra cho request đã authenticated (token valid ⟹ IP đã vượt qua T1 ở bước login).

**Hành vi khi Redis down (fail-open):**

Nếu Redis không phản hồi, ZREMRANGEBYSCORE/ZADD/ZCARD đều fail. Quyết định: **fail-open** — cho request đi qua mà không rate-limit. Lý do: Redis down đồng nghĩa với cache (ADR-13) cũng down — hệ thống đang trong degraded mode; mất rate limiting là acceptable vì Optimistic Locking (ADR-03) vẫn bảo đảm correctness về chỗ ngồi, và DB constraint `seats_available >= 0` là last-resort protection. Fail-closed (block tất cả request khi Redis down) sẽ làm hệ thống hoàn toàn unavailable — đây là overprotection không chấp nhận được.

Log cảnh báo mỗi khi fail-open được trigger để monitoring nhận biết Redis health.

**Tính toán tải giảm được:**

Không có Rate Limiting: 12.000 sinh viên × trung bình 3 attempts = 36.000 requests trong 10 phút = 60 req/s đều, nhưng thực tế spike đầu có thể là 500+ req/s trong 30 giây đầu.

Với T3 limit 5 req/60s per user per workshop: mỗi user bị giới hạn tối đa 5 attempts cho workshop đó. 12.000 users × 5 attempts = 60.000 attempts tổng — nhưng trải đều hơn vì sau 5 attempts phải chờ. Quan trọng hơn: eliminates retry storm từ client impatient — người dùng spam click 20 lần trong 5 giây sẽ chỉ tạo 5 requests vào backend.

---

### Xử lý cổng thanh toán không ổn định

#### Bối cảnh và vấn đề

Payment gateway là dependency ngoài kiểm soát của team — có thể chậm (latency cao), lỗi thoáng qua (5xx trong vài giây), hoặc down kéo dài (5–30 phút). Nếu không có cơ chế cách ly, mỗi request đến payment endpoint sẽ chờ timeout 5 giây rồi mới nhận lỗi. Với tải đỉnh, điều này có nghĩa là pool connection bị chiếm bởi hàng trăm request đang chờ timeout — các endpoint *không liên quan đến payment* (xem workshop, check-in) cũng bị block.

#### Giải pháp: Circuit Breaker với 3 trạng thái

**Nguyên lý hoạt động — State Machine:**

Circuit Breaker là một state machine bao bọc tất cả lời gọi ra ngoài đến payment gateway. Nó không thay đổi logic nghiệp vụ; nó quyết định *có cho phép request tiếp cận gateway không*.

```
                  threshold vượt
    CLOSED ──────────────────────────→ OPEN
      ↑                                  │
      │ 2 successes                      │ 30 giây
      │ liên tiếp                        ↓
    HALF-OPEN ←─────────────────── OPEN (chờ)
                  probe request
```

**Trạng thái CLOSED — hoạt động bình thường:**

- Tất cả request đến gateway được phép đi qua.
- Mỗi response được ghi nhận: success (2xx, 4xx client error) hoặc failure (5xx, timeout, network error).
- Bộ đếm theo dõi hai điều kiện song song:
  - `consecutive_failures`: số lỗi liên tiếp (reset về 0 sau mỗi success)
  - `failure_rate_in_window`: tỉ lệ lỗi trong 60 giây gần nhất

Chuyển sang OPEN khi: `consecutive_failures >= 5` **HOẶC** `failure_rate_in_window >= 50%`

Hai điều kiện dùng logic OR vì chúng bắt hai pattern lỗi khác nhau:

- 5 lỗi liên tiếp bắt *burst failure* nhanh (gateway đột ngột crash)
- 50%/60s bắt *sustained degradation* (gateway trả lỗi xen kẽ success trong thời gian dài)

Chỉ dùng một điều kiện sẽ bỏ sót một pattern.

**Trạng thái OPEN — fail fast:**

- Tất cả request bị từ chối ngay lập tức (0ms latency) với 503 Service Unavailable.
- Không có request nào chạm đến gateway — bảo vệ gateway đang gặp sự cố và bảo vệ connection pool.
- Trạng thái được giữ trong **30 giây** (hard timeout, không reset khi có request đến).
- Sau 30 giây, tự động chuyển sang HALF-OPEN.

Tại sao 30 giây: đủ để gateway phục hồi sau restart, quá ngắn thì CB mở quá nhanh tạo thundering herd (tất cả request được thả ra cùng lúc khi CB đóng), quá dài thì payment bị block oan khi gateway đã phục hồi.

**Trạng thái HALF-OPEN — thăm dò:**

- Chỉ **một** request được phép đi qua gateway làm probe. Các request còn lại vẫn bị từ chối như OPEN.
- Cơ chế chọn probe: atomic compare-and-swap trên state flag `probe_sent`. Request đầu tiên đặt `probe_sent = true` và đi qua; các request sau thấy `probe_sent = true` → bị từ chối.

Kết quả probe:

- **Success:** tăng `success_count`. Khi `success_count >= 2` → chuyển sang CLOSED, reset tất cả counter.
- **Failure:** quay về OPEN ngay lập tức, reset timer 30 giây.

Tại sao cần 2 success: 1 success có thể là lucky fluke (gateway vừa phục hồi nhưng chưa stable). 2 successes liên tiếp đủ tự tin để mở lại.

**Implementation detail quan trọng — CB state lưu in-memory:**

CB state (`CLOSED`/`OPEN`/`HALF-OPEN`, bộ đếm, timestamp) lưu trong process memory của Node.js/Python process, không lưu Redis. Lý do: với Modular Monolith một process (ADR-01), tất cả request đều đi qua cùng một CB instance — không có shared state problem giữa các process. Redis-based CB chỉ cần thiết khi có nhiều application instances.

Hệ quả quan trọng: restart process reset CB về CLOSED. Đây là behavior đúng — process mới không có failure history cũ, gateway có thể đã phục hồi trong lúc deploy/restart.

**Thứ tự bắt buộc trong payment request flow:**

```
POST /payments đến server

① Idempotency check (ADR-08) — PHẢI TRƯỚC CB check
   Lý do: Nếu key K đã completed (success/failure), client phải nhận
   cached response kể cả khi CB đang OPEN.
   Đảo thứ tự: CB OPEN → từ chối 503 → client không biết request trước
   đã thành công → client tiếp tục retry → UX tệ + tăng tải lúc CB phục hồi.

② CB check — SAU idempotency, TRƯỚC khi claim key
   IF OPEN → trả 503 WITHOUT claiming idempotency key
   Lý do: Nếu claim key trước CB check, rồi CB check thấy OPEN → trả 503,
   key bị kẹt in_progress 30 giây → client retry trong 30s gặp 409 "Processing"
   dù request không được xử lý gì. Đây là bug xác nhận tại review round.

③ Claim idempotency key (in_progress)
④ Gọi gateway với 5s timeout
⑤ Finalize key: completed hoặc unresolved (nếu timeout)
```

**Graceful degradation — tác động phân biệt theo loại workshop:**

```
Workshop miễn phí  → Không ảnh hưởng. Luồng thanh toán không chạy.
                     Đăng ký hoàn thành ngay khi CB đang OPEN.

Workshop có phí    → Trả lỗi có nghĩa với user:
                     HTTP 503
                     {
                       "error": "payment_service_unavailable",
                       "message": "Hệ thống thanh toán tạm thời gián đoạn. Vui lòng thử lại sau ~30 giây.",
                       "retry_after": 30
                     }

Các tính năng khác → Xem workshop, AI summary, check-in QR: hoàn toàn không bị ảnh hưởng.
                     CB chỉ bao bọc HTTP call đến gateway, không bao bọc các module khác.
```

**Xử lý timeout là loại lỗi đặc biệt:**

Khi gateway timeout sau 5 giây: CB ghi nhận là failure (đóng góp vào threshold). Idempotency key được mark `unresolved` — KHÔNG `completed`. Lý do: gateway có thể đã charge hoặc chưa — server không biết. `unresolved` cho phép client retry với cùng key để gateway dedup. Xem chi tiết tại phần Idempotency bên dưới.

---

### Chống trừ tiền hai lần

#### Bối cảnh và vấn đề

Trừ tiền hai lần là lỗi nghiêm trọng nhất về nghiệp vụ — gây tổn thất tài chính trực tiếp cho sinh viên và tổn hại uy tín hệ thống. Tình huống dẫn đến double-charge:

1. **Client retry bình thường:** User click "Thanh toán" lần 2 vì lần 1 trang web đơ (nhưng request đã đến server và đang xử lý)
2. **Network timeout:** Server gọi gateway, gateway charge xong, nhưng response mất trên mạng → server timeout → client retry với request mới → gateway nhận request mới, charge lần 2
3. **Mobile reconnect:** App đóng giữa chừng, user mở lại và thử lại
4. **Browser back-forward:** User nhấn Back rồi Submit lại

Không có cơ chế nào trong TCP/HTTP ngăn được client retry. Cần idempotency ở tầng application.

#### Giải pháp: Client-Generated Idempotency Key với 3 trạng thái

**Cơ chế sinh key — tại sao client-generated:**

```
Client-generated (cách chọn):
  1. Client sinh UUID v4 ngay khi user click "Thanh toán"
  2. Lưu vào localStorage: payment_key = uuid()
  3. Gửi trong mỗi POST /payments request — KHÔNG sinh key mới khi retry
  → 1 round-trip, không có orphan key nếu client crash

Server-generated (đã cân nhắc nhưng loại):
  1. Client gọi GET /payments/initiate → server trả key
  2. Client dùng key trong POST /payments
  → 2 round-trips; nếu client crash sau bước 1, key là orphan entry trong DB
```

Key phải là UUID v4 (122 bit entropy). Server validate format UUID v4 tại middleware trước khi tiếp nhận — từ chối key không đúng format (400 Bad Request) để giữ schema sạch và ngăn client dùng predictable strings.

**Nơi lưu trữ — PostgreSQL, không phải Redis:**

Key lưu trong bảng `idempotency_keys` (PostgreSQL), không phải Redis:

- Redis là volatile: crash mất toàn bộ idempotency state → in-progress key biến mất → request đang xử lý mất crash recovery
- PostgreSQL với PRIMARY KEY trên `key` (TEXT) + B-tree index: lookup O(log n), với vài nghìn payment/ngày không đo được khác biệt so với Redis O(1)
- PostgreSQL durability: crash recovery còn nguyên — server restart sau crash có thể query key `in_progress` với `locked_until` đã quá hạn để tự phục hồi

**3 trạng thái và ý nghĩa phân biệt:**

```
in_progress  — Request đang được xử lý. locked_until = now() + 30s.
               Concurrent request với cùng key → 409 "Request đang xử lý"
               Nếu locked_until hết hạn (crash): crash recovery — coi như chưa xử lý

completed    — Kết quả xác định đã nhận (200 OK, 402 Declined, 4xx client error).
               response_body đã populate.
               Idempotency check → trả cached response ngay, KHÔNG gọi gateway lại.
               Terminal state — không chuyển sang trạng thái khác.

unresolved   — Đã gọi gateway nhưng timeout/network drop — không biết kết quả.
               response_body = NULL (không có gì để cache).
               Idempotency check KHÔNG trả cache — cho phép retry tiếp cận gateway.
               NOT terminal — retry với cùng key để gateway dedup.
```

Sự khác biệt then chốt giữa `completed` và `unresolved`: khi idempotency check thấy `unresolved`, nó không trả 409 và không trả cached response — thay vào đó, cho phép request tiếp tục đến gateway. Gateway sẽ dedup vì nhận cùng `Idempotency-Key` header. Nếu mark `unresolved` là `completed` với response 504: client nhận 504 được cache → không bao giờ biết tiền đã trừ hay chưa → bắt buộc dùng key mới → double-charge.

**Cơ chế forward key đến gateway — điểm phân biệt quan trọng:**

Server không chỉ dùng idempotency key cho dedup nội bộ — server còn forward key này đến gateway như `Idempotency-Key` header trong HTTP request đến gateway:

```
Client → Server: POST /payments {registration_id, payment_key: "uuid-K1"}
Server → Gateway: POST /charge
                  Headers: Idempotency-Key: uuid-K1
                  Body: {amount, currency, card_token}
```

Tại sao forward: nếu không forward và gateway timeout, retry của client với cùng K1 sẽ đến server → server tạo gateway request mới (không có idempotency key) → gateway xem là request mới → charge lần 2. Với forward: retry của client → server retry với K1 → gateway thấy K1 đã xử lý → trả kết quả cached → không charge lại.

**Luồng idempotency check đầy đủ:**

```
Client chuẩn bị:
  payment_key = localStorage.getItem('payment_key') || uuid()
  localStorage.setItem('payment_key', payment_key)  -- persist trước khi gửi

POST /payments {registration_id, amount, payment_key}

① Server: SELECT status, response_body, status_code, locked_until
          FROM idempotency_keys
          WHERE key = :payment_key AND resource_type = 'payment'

   CASE:
   key KHÔNG TỒN TẠI              → tiếp tục ③ (flow bình thường)
   
   status = 'completed'            → RETURN response_body với status_code đã lưu
                                      (true duplicate: client nhận kết quả xác định)
   
   status = 'unresolved'           → tiếp tục ③ (retry xuyên qua để gateway dedup)
   
   status = 'in_progress'
     AND locked_until > now()      → RETURN 409 {message: "Request đang xử lý,
                                      thử lại sau", retry_after: seconds}
   
   status = 'in_progress'
     AND locked_until <= now()     → crash recovery: server cũ đã crash
                                     tiếp tục ③ (cập nhật locked_until)

② CB check (ADR-07): IF OPEN → RETURN 503 (không touch idempotency table)

③ Claim / refresh key:
   IF key không tồn tại:
     INSERT INTO idempotency_keys
       (key, resource_type, status, locked_until, created_at)
     VALUES
       (:payment_key, 'payment', 'in_progress', now()+30s, now())
   
   ELSE (status = 'unresolved' hoặc in_progress expired):
     UPDATE idempotency_keys
       SET status = 'in_progress', locked_until = now() + 30s
     WHERE key = :payment_key
       AND (status = 'unresolved'
            OR (status = 'in_progress' AND locked_until <= now()))
     -- IF rowsAffected = 0: race condition — re-check ① logic

④ Gọi gateway:
   POST gateway.com/charge
   Headers: Idempotency-Key: {payment_key}
   Timeout: 5s

   CASE:
   200 OK (charged)    → ⑤ completed; payment.status = 'succeeded'
   402 (declined)      → ⑤ completed; payment.status = 'failed'
   4xx client error    → ⑤ completed; payment.status = 'failed'
   5xx / timeout       → CB ghi failure; ⑤ unresolved; payment.status = 'unresolved'

⑤ Finalize (PostgreSQL transaction):
   BEGIN;
     UPDATE idempotency_keys
       SET status = :new_status,     -- 'completed' hoặc 'unresolved'
           response_body = :body,    -- NULL nếu unresolved
           status_code = :code,
           expires_at = now() + 24h,
           locked_until = NULL
     WHERE key = :payment_key;
     
     UPDATE payments
       SET status = :payment_status,
           gateway_charge_id = :charge_id,
           resolved_at = now()
     WHERE idempotency_key = :payment_key;
   COMMIT;

RETURN:
   Nếu completed:   response_body với status_code thực
   Nếu unresolved:  504 + body {error: "payment_timeout",
                                retry_with_same_key: true,
                                payment_key: payment_key,
                                retry_after: 30}
```

**TTL và cleanup:**

Key có TTL 24 giờ (`expires_at = created_at + 24h`). Background job chạy mỗi đêm:

```sql
DELETE FROM idempotency_keys
WHERE expires_at < now()
  AND key NOT IN (
    -- skip key vẫn đang được reference bởi payments chưa resolved
    SELECT idempotency_key FROM payments WHERE status = 'unresolved'
  );
```

Lý do giữ 24 giờ: workshop registration diễn ra trong ngày, client retry trong ngày hợp lý. Sau 24h, intent payment đã cũ — client tạo key mới cho attempt mới.

**Xử lý worst case — client không retry và key kẹt `unresolved`:**

Nếu client nhận 504 rồi đóng app, không retry trong 24 giờ:

- `idempotency_keys.status = 'unresolved'` (sẽ bị xóa sau 24h, nhưng FK constraint bảo vệ)
- `payments.status = 'unresolved'` (KHÔNG bị xóa — payment record tồn tại vĩnh viễn đến khi resolved)
- Tiền có thể đã bị trừ ở gateway

Recovery: **Reconciliation job** chạy mỗi 5 phút query:

```sql
SELECT * FROM payments
WHERE status = 'unresolved'
  AND created_at < now() - interval '5 minutes'  -- đủ thời gian cho client retry
```

Với mỗi payment `unresolved`, job gọi gateway API `GET /charges/{gateway_charge_id}` để biết trạng thái thực, update `payments.status` và `registrations.status` tương ứng. Chi tiết spec tại `specs/payment-reconciliation.md` (Stage 5).

---

## Mối quan hệ giữa 3 cơ chế

Ba cơ chế không hoạt động song song mà theo thứ tự phòng thủ nhiều lớp (defense-in-depth):

```
Request đến POST /workshops/:id/register hoặc POST /payments
         │
         ▼
┌─────────────────────┐
│  Rate Limiting      │  Lớp 1: Giảm volume
│  (ADR-06)           │  Từ chối sớm nếu user spam
│  T1 → T2 → T3       │  Bảo vệ tất cả endpoint phía sau
└─────────┬───────────┘
          │ pass
          ▼
┌─────────────────────┐
│  Idempotency Check  │  Lớp 2a: Dedup (chỉ payment)
│  (ADR-08, bước ①)  │  Trả cached response nếu đã xử lý
│                     │  ← PHẢI TRƯỚC Circuit Breaker
└─────────┬───────────┘
          │ không phải duplicate
          ▼
┌─────────────────────┐
│  Circuit Breaker    │  Lớp 2b: Cách ly (chỉ payment)
│  (ADR-07, bước ②)  │  Fail-fast nếu gateway down
│                     │  Bảo vệ connection pool
└─────────┬───────────┘
          │ CLOSED / HALF-OPEN
          ▼
┌─────────────────────┐
│  Business Logic     │  Lớp 3: Correctness
│  + Optimistic Lock  │  Seats, UNIQUE constraint
│  (ADR-03)           │  Last-resort protection
└─────────────────────┘
```

Rate Limiting không thể thay thế Circuit Breaker: RL giảm *volume* nhưng không ngăn *cascading failure* khi gateway down — 30 req/s × 5s timeout vẫn chiếm 150 connections. Circuit Breaker không thể thay thế Idempotency: CB fail-fast trong 0ms nhưng không giải quyết *duplicate request* từ client retry hợp lệ. Ba cơ chế bù trừ lẫn nhau, không thể rút bỏ một cái và tăng cường cái khác để bù.
