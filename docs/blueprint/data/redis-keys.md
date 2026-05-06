# UniHub Workshop — Redis Keys Blueprint

> **Redis là lớp phụ trợ (cache, rate limiting, message queue).**
> **PostgreSQL là sole source of truth cho mọi dữ liệu persistent.**
> (xem design.md dòng 14, ADR-02 Section 1)

---

## 1. Seat Availability Cache (Cache-Aside)

```
Key:  cache:workshop:{workshop_id}:seats
Type: String (integer)
Cmd:  GET / SET EX 10 / DEL
TTL:  10 giây (xem ADR-13: co-designed với ADR-03 OL để cân bằng cache hit vs stale)
```

**Pattern: Cache-Aside + Write-Invalidate**

- **Read path:** `GET cache:workshop:{id}:seats` → hit trả về, miss → `SELECT seats_available FROM workshops` → `SET ... EX 10` → trả về
- **Write path:** Sau `UPDATE workshops SET seats_available = seats_available - 1, version = version + 1` commit (ADR-03 Step 3) → `DEL cache:workshop:{id}:seats` (fire-and-forget, ngoài transaction)
- **Admin path:** `PATCH /admin/workshops/:id { seats_total: ... }` → UPDATE + COMMIT → `DEL cache:workshop:{id}:seats` (MANDATORY — xem ADR-13 Section 7)

**KHÔNG dùng DECR trên key này.** Redis DECR không phải enforcement mechanism — enforcement là PostgreSQL Optimistic Lock (WHERE version = :v AND seats_available > 0).

**Stale data OK:** TTL 10s cân bằng cache hit rate vs OL collision rate. Cache stale dưới 10s → OL collision → retry → đọc DB → đúng (ADR-13 Section 8 rationale).

**Write-Invalidate race condition:** COMMIT và DEL có竞争窗口 nhỏ. Thread đọc cache cũ → vào OL → DB `WHERE seats_available > 0` fail → an toàn. Race này chỉ gây thêm 1 DB round trip, không gây sai correctness (ADR-13 Section 9).

**Thêm** — Workshop list cache:
```
Key:  cache:workshop:list
Type: String (JSON array)
TTL:  60 giây
Cmd:  GET / SET EX 60 / DEL
```

---

## 2. Rate Limiting (Sliding Window Counter — ADR-06)

**Thuật toán:** Sliding Window Counter với Redis Sorted Set.
**Loại cũ (Token Bucket) đã bị reject** — xem design.md ADR-06 Section 4: Token Bucket cho phép burst, Sliding Window phù hợp hơn cho registration flow.

**Pipeline (MULTI/EXEC):**
```
MULTI
  ZREMRANGEBYSCORE <key> 0 <window_start_timestamp>
  ZADD <key> <now_timestamp> <now_timestamp>  -- member = score = timestamp
  ZCARD <key>
  EXPIRE <key> 60
EXEC
→ IF count > threshold → 429 Too Many Requests
```

### 3-tier độc lập:

| Tier | Key | Threshold | Window | Purpose |
|------|-----|-----------|--------|---------|
| T1 — IP | `rl:ip:{ip}` | 60 req | 60s | Bảo vệ unauthenticated (chặn quét, DDoS nhẹ) |
| T2 — User | `rl:user:{user_id}` | 30 req | 60s | Per user authenticated — chặn spam automation |
| T3 — Per registration | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | Per user per workshop — chặn retry loop tấn công hết chỗ |

**Xử lý lỗi:** Nếu Redis down → rate limiting tắt — tất cả request đi qua. Acceptable vì:
- OL (ADR-03) vẫn đảm bảo correctness (không double-booking)
- Cache (ADR-13) cũng tắt → hệ thống đã ở degraded mode
- (ADR-06 Section 8 rationale)

---

## 3. Circuit Breaker — In-Memory (ADR-07)

**KHÔNG có Redis key cho Circuit Breaker state.**

Circuit Breaker state được lưu **in-process memory** (process variable), không phải Redis.

- State machine: CLOSED → OPEN → HALF-OPEN → CLOSED
- Threshold: 5 failures trong 60s → OPEN (hoặc failure rate ≥ 50%)
- Cool-down: 30s → HALF-OPEN (thăm dò)
- **Restart process = reset CB về CLOSED** — đây là correctness guarantee, không phải limitation
  (xem design.md ADR-07 Section 5: "gateway có thể đã hồi phục trong lúc restart")

**Tại sao không Redis:** Modular Monolith single-process (ADR-01). Tất cả request qua cùng CB instance. Không cần distributed state coordination. (design.md dòng 577-581).

---

## 4. Token Blacklist (Deferred — Out of Scope)

```
Key:  token:blacklist:{jti}
Type: String
Value: "revoked"
Cmd:  SET EX {remaining_ttl}   -- TTL = JWT.exp - Current_Time
```

⚠️ **Chưa implement trong scope hiện tại — chỉ là design placeholder.**

JWT revocation via blacklist được defer đến Stage 5. Hiện tại dùng short-lived access tokens (15 phút web, 8 giờ mobile) với refresh token rotation (ADR-04).

---

## 5. Redis Streams (Message Queue — ADR-10)

Dùng Redis Streams cho async processing pipeline. Three stream groups:

```
stream:ai-summary          → AISummaryConsumer (workshop document → AI summary)
stream:notifications       → NotificationConsumer (email/push/telegram dispatch)
stream:payments-expiry     → PaymentTimeoutConsumer (timeout unresolved payments)

DLQ (Dead Letter Queue — retries exhausted):
stream:ai-summary-dlq
stream:notifications-dlq
```

**Pattern:** Consumer Group với XREADGROUP + XACK + PEL.

**Crash recovery:** XAUTOCLAIM sau 60s — pending message bị claim bởi consumer khác (hoặc cùng consumer sau restart).

**DLQ:** Retry 3 lần → XADD vào DLQ. DLQ có consumer riêng (alert admin, manual retry qua admin UI).

**TTL:** Stream không có TTL mặc định. Job đêm dọn message > 7 ngày từ cả main stream và DLQ (XDEL / XTRIM MAXLEN).

---

## Tổng kết: Redis Key Namespace

| Pattern | Purpose | TTL | ADR |
|---------|---------|-----|-----|
| `cache:workshop:{id}:seats` | Seat availability cache | 10s | ADR-13 |
| `cache:workshop:list` | Workshop list cache | 60s | ADR-13 |
| `rl:ip:{ip}` | IP rate limit | 60s | ADR-06 |
| `rl:user:{user_id}` | User rate limit | 60s | ADR-06 |
| `rl:reg:{user_id}:{workshop_id}` | Per-registration rate limit | 60s | ADR-06 |
| `token:blacklist:{jti}` | JWT revocation (out of scope) | TTL = JWT remaining | ADR-04 |
| `stream:ai-summary` | AI summary job queue | ∞ (cleaned nightly) | ADR-10/14 |
| `stream:notifications` | Notification dispatch queue | ∞ (cleaned nightly) | ADR-09/10 |
| `stream:payments-expiry` | Payment timeout job queue | ∞ (cleaned nightly) | ADR-08/10 |
