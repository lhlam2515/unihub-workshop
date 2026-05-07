# Spec: Rate Limiting (`rate-limiting`)

> **ASR hiện thực hóa:** ASR-10 (API Protection — ngăn spam, đảm bảo fairness), ASR-1 (Spike Load — giảm write load vào DB)
>
> **ADR tham chiếu:** ADR-06 (Sliding Window Counter)
>
> **Thuật toán và lý do thiết kế:** Xem `safety-mechanism.md` § "Kiểm soát tải đột biến" — giải thích tại sao Sliding Window thay vì Fixed Window, tại sao Redis Sorted Set, tại sao fail-open, và tính toán load reduction dưới spike 12,000 users.
>
> **Tài liệu này định nghĩa:** Endpoint nào áp dụng tier nào, HTTP contract khi bị từ chối, error scenarios quan sát được từ ngoài, và acceptance criteria.

---

## 1. Mô tả

Ba tier rate limiting độc lập, kiểm tra theo thứ tự T1 → T2 → T3. Request vi phạm bất kỳ tier nào nhận 429 với `Retry-After` header. Fail-open khi Redis down — OL (ADR-03) vẫn đảm bảo correctness về seat allocation.

---

## 2. Định nghĩa 3 Tier

| Tier | Redis Key | Limit | Window | Áp dụng cho |
|------|-----------|-------|--------|-------------|
| T1 — IP | `rl:ip:{ip_address}` | 60 req | 60s | Unauthenticated endpoints |
| T2 — User | `rl:user:{user_id}` | 30 req | 60s | Tất cả authenticated endpoints |
| T3 — User×Workshop | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | POST register + POST payment |

**T3 là tier quan trọng nhất** — là vòng ngoài cùng bảo vệ hot-row contention (ADR-03): user spam 1 workshop bị chặn tại đây trước khi chạm DB.

---

## 3. Endpoint Mapping

| Endpoint | T1 | T2 | T3 |
|---|---|---|---|
| POST /auth/login/ | ✓ | — | — |
| GET /workshops (public) | ✓ | — | — |
| GET /workshops/:id | — | ✓ | — |
| POST /registrations | — | ✓ | ✓ |
| POST /payments | — | ✓ | ✓ |
| POST /checkins/sync | — | ✓ | — |
| POST /admin/workshops | — | ✓ | — |
| POST /admin/workshops/:id/summary | — | ✓ | — |
| GET /admin/\* | — | ✓ | — |

**Lưu ý T1:** Sau khi authenticated, T1 không áp dụng nữa — T2 per `user_id` là binding. Điều này giải quyết vấn đề NAT (nhiều user sau cùng IP ký túc xá).

---

## 4. HTTP Contract

### Request bị từ chối (429)

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1746539123

{
  "error": "rate_limit_exceeded",
  "tier": "T3_user_workshop",
  "retry_after": 23
}
```

`Retry-After` = số giây đến khi event cũ nhất trong window hết hạn — tính chính xác từ ZRANGE, không hard-coded.

### Request pass (2xx)

Headers bổ sung trên mọi 2xx response:

```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1746539160
```

### Redis down (fail-open)

```http
HTTP/1.1 <business logic response>
(không có X-RateLimit headers)
```

Server log warning. Request được xử lý bình thường. Rate limiting tắt tạm thời.

---

## 5. Kịch bản lỗi

### E-01: Spam cùng workshop (T3 vi phạm)

```
Điều kiện: Student gửi 6 POST /registrations cho workshop X trong 60s
Request 1–5: pass (count = 1, 2, 3, 4, 5)
Request 6:   429, Retry-After chính xác
```

### E-02: Nhiều workshop khác nhau — không bị chặn oan

```
Điều kiện: Student đăng ký 6 workshop khác nhau trong 60s
T3: mỗi workshop là key riêng → 1 request/key, không vi phạm
T2: 6 requests trong 60s << 30 limit
Kết quả: tất cả 6 pass
```

### E-03: NAT — nhiều student cùng IP ký túc xá

```
Điều kiện: 70 students đã login, cùng IP, gửi request
T1: không áp dụng (đã authenticated)
T2: mỗi user_id là key riêng → 70 × 30 capacity
Kết quả: không bị block oan
```

### E-04: Redis down

```
Điều kiện: Redis không phản hồi
Hành vi: MULTI/EXEC throw ConnectionError → LOG warning → proceed
         Request không bị block
         Rate limiting tắt cho đến khi Redis phục hồi
         OL (ADR-03) vẫn chặn oversell
```

### E-05: Boundary test — Window accuracy

```
Điều kiện: Student gửi 5 request lúc T=0, gửi request thứ 6 lúc T=30s
Window logic: 5 entries từ T=0 vẫn nằm trong window hiện tại [T=-30s, T=30s]
Kết quả: request lúc T=30s → 429 ✓ (chính xác)

Điều kiện: 1 request lúc T=61s (entries từ T=0 đã hết hạn window 60s)
Kết quả: request lúc T=61s → pass ✓
```

---

## 6. Ràng buộc (Invariants)

**INV-01 — Tier Ordering:**
T1 kiểm tra trước T2, T2 trước T3. Fail-fast ở tier đầu tiên vi phạm.

**INV-02 — Retry-After Chính Xác:**
`Retry-After` dựa trên `oldest_entry.score + window_ms - now_ms`, không phải hard-coded.
Client retry sau đúng số giây này phải pass (giả sử không có request mới).

**INV-03 — Atomic Counter Update:**
Counter increment và count check phải atomic — khi request được count, tất cả concurrent request sau đó đều thấy count mới.
Chi tiết implementation: xem `safety-mechanism.md`.

**INV-04 — Fail-Open, Không Fail-Closed:**
Redis error KHÔNG được propagate như HTTP 5xx.
Không được block business logic khi Redis down.

**INV-05 — T3 Key Scope Per Workshop:**
`rl:reg:{user_id}:{workshop_id}` — spam workshop A không ảnh hưởng quota khi đăng ký workshop B.

---

## 7. Tiêu chí chấp nhận

**AC-01 — T3 blocks spam:**
Given: Student gửi 6 POST /registrations cho cùng workshop trong 60s.
Then: Request 1–5 → 2xx. Request 6 → 429 với `Retry-After` > 0.

**AC-02 — Multi-workshop không bị chặn:**
Given: Student đăng ký 6 workshop khác nhau trong 60s.
Then: Tất cả 6 → pass (không có 429 từ T3).

**AC-03 — Sliding Window accuracy:**
Given: 5 requests lúc T=0s. 1 request lúc T=30s.
Then: Request T=30s → 429 (vì 5 entries T=0 vẫn trong window [T=-30, T=30]).
Given: 1 request lúc T=61s (entries T=0 đã out of window).
Then: Request T=61s → pass.

**AC-04 — Retry-After accuracy:**
Given: T3 hit, response `Retry-After: X`.
Then: Sau đúng X giây, request tiếp theo → pass.

**AC-05 — Fail-open:**
Given: Redis down.
Then: POST /registrations không nhận 429 hoặc 5xx từ rate limiter.
And: Server log chứa warning về Redis unavailable.
And: OL vẫn chặn oversell (AC tách biệt, test riêng).

**AC-06 — T2 aggregate:**
Given: User gửi 31 requests tới các endpoints khác nhau trong 60s.
Then: Request thứ 31 → 429 (T2 aggregate = 31 > 30).
