# UniHub Workshop — RESTful API Design

> **Phạm vi:** Đặc tả toàn bộ HTTP API cho hệ thống UniHub Workshop, gắn với 13 ADR đã chốt trong `design.md` và schema PostgreSQL/SQLite.
> **Đối tượng đọc:** Backend developer cài đặt module, frontend/mobile developer tích hợp, QA viết test plan.
> **Phiên bản:** v1 (URL prefix `/api/v1`).

---

## 0. Quy ước chung

### 0.0. Quy ước đặt tên field — camelCase toàn bộ

Toàn bộ hệ sinh thái là TypeScript (NestJS backend, Next.js frontend, Expo mobile). Do đó **mọi JSON field trong request body và response đều dùng camelCase** — không có ngoại lệ.

| Tầng | Convention | Ví dụ |
|---|---|---|
| **API (request/response JSON)** | **camelCase** | `workshopId`, `startsAt`, `seatsAvailable`, `registeredAt` |
| **Database (PostgreSQL columns)** | snake_case | `workshop_id`, `starts_at`, `seats_available`, `registered_at` |
| **TypeScript DTO / Entity** | camelCase | `workshopId`, `startsAt` (Drizzle map → DTO) |

**NestJS configuration bắt buộc:**

```typescript
// main.ts
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

// Drizzle ORM — map snake_case columns → camelCase DTO properties
// Option A: Drizzle casing config
const db = drizzle(client, { casing: 'camelCase' });

// Option B: Explicit mapping trong schema definition
export const workshops = pgTable('workshops', {
  workshopId: uuid('workshop_id').primaryKey(),
  startsAt:   timestamp('starts_at').notNull(),
  // ...
});
```

**Frontend không cần transform layer** — tiêu thụ JSON trực tiếp, type-safe với generated types từ `openapi.yaml`.

---

### 0.1. Cấu trúc URL & versioning

```
https://api.unihub.example.com/api/v1/<resource>[/<id>][/<sub-resource>]
```

* **Versioning theo path** (`/api/v1`) — đơn giản, dễ proxy/cache, không phải thương lượng header.
* Resource theo số nhiều (`/workshops`), action không-CRUD theo verb (`/workshops/{id}/publish`).
* Cấp admin được tách rõ vào subtree `/api/v1/admin/...` — đối tượng RBAC khác (`btc` thay vì `student`), rate limit tier khác, có thể đặt sau API Gateway riêng nếu cần.

### 0.2. Authentication & Authorization (ADR-04, ADR-05)

| Header | Bắt buộc với | Ghi chú |
|---|---|---|
| `Authorization: Bearer <jwt>` | Mọi endpoint không phải public | JWT 15 phút, RS256 signed |

**Refresh token transport — phân biệt theo client type (`authentication.md` INV-02):**

| Client | Access token | Refresh token |
|---|---|---|
| **Web (browser)** | JSON body → lưu trong JS memory (không localStorage) | `Set-Cookie: HttpOnly; SameSite=Strict; Path=/auth/refresh` — JavaScript không đọc được |
| **Mobile (checkin_staff)** | JSON body | JSON body — app lưu vào Android Keystore / iOS Keychain |

`POST /auth/refresh`: Web client không cần body — browser tự gửi cookie. Mobile gửi `refresh_token` trong JSON body.

**3 enforcement points (ADR-05):**

1. **API Gateway / Middleware** — verify JWT RS256 signature, check `exp`, decode claims. Reject 401 trước khi vào handler. Không có DB lookup (INV-01).
2. **Module/Service layer** — kiểm tra `role` trong claims có thuộc whitelist của resource không. Reject 403.
3. **Method/Row level** — kiểm tra ownership cụ thể (vd: sinh viên A không xem registration của sinh viên B). Reject 404 — không 403, tránh enumeration.

JWT claims tối thiểu:

```json
{
  "sub": "21127001",                    // student_id (TEXT) hoặc staff.id (UUID)
  "role": "student | btc | checkin_staff",
  "userType": "student | staff",
  "email": "...",
  "allowedWorkshopIds": ["..."],      // Chỉ với checkin_staff (ADR-05 + mobile schema)
  "iat": 1714946400,
  "exp": 1714947300
}
```

### 0.3. Rate Limiting (ADR-06) — 3 tier Sliding Window Redis Sorted Set (`rate-limiting.md`)

Kiểm tra theo thứ tự T1 → T2 → T3. Vi phạm tier đầu tiên → **429** với `Retry-After` chính xác (tính từ ZRANGE, không hard-coded).

| Tier | Redis key | Limit | Window | Áp dụng cho |
|---|---|---|---|---|
| **T1 — IP** | `rl:ip:{ip}` | 60 req | 60s | Unauthenticated endpoints (`/auth/login`, `GET /workshops` public) |
| **T2 — User** | `rl:user:{user_id}` | 30 req | 60s | Tất cả authenticated endpoints |
| **T3 — User×Workshop** | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | `POST /registrations` và `POST /payments` **only** |

**T1 không áp dụng sau khi authenticated** — tránh penalize nhiều sinh viên ký túc xá cùng NAT IP. Sau login, T2 per `user_id` là binding.

**T3 là tier quan trọng nhất** — giảm hot-row contention tại `workshops.version` (ADR-03 + ADR-13). Spam 10 lần cho workshop A không cản đăng ký workshop B (key scope khác nhau).

**Fail-open khi Redis down** — rate limiting tắt, business logic proceed bình thường. OL (ADR-03) vẫn bảo đảm correctness về chỗ ngồi.

Response headers (trên mọi 2xx):

```
X-RateLimit-Limit: 5           # Limit của tier hẹp nhất đang áp dụng
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1714947345  # Unix timestamp khi entry cũ nhất trong window hết hạn
```

Response 429:

```json
{
  "error": "rate_limit_exceeded",
  "tier": "T3_user_workshop",
  "retryAfter": 23
}
```

### 0.4. Idempotency Key (ADR-08, ADR-15) — header `Idempotency-Key`

| Endpoint | Header bắt buộc | Ghi chú |
|---|---|---|
| `POST /registrations` | `Idempotency-Key: <UUID v4>` | Dedup lần đăng ký |
| `POST /payments` | `Idempotency-Key: <UUID v4>` | Dedup + forward đến gateway |
| `POST /checkins/sync` | ❌ (per-item `local_id` trong body) | Batch idempotency qua DB UNIQUE |
| Còn lại | ❌ | |

**Header, không phải body** (ADR-15). Key là transport concern — không thuộc business payload. Nhất quán với Stripe/Adyen convention. Có thể filter riêng khỏi request body log.

**Behavior trên server (3-state lifecycle, `registration-paid.md` §Bước 2):**

```
Client gửi POST với header Idempotency-Key: K
        │
        ▼
SELECT * FROM idempotency_keys WHERE key = K
  ┌─ status='COMPLETED'
  │    → trả lại response_body đã cache (idempotent replay, kể cả khi CB đang OPEN)
  ├─ status='IN_PROGRESS' AND locked_until > now()
  │    → 409 { "error": "request_in_progress", "retryAfter": <seconds> }
  ├─ status='IN_PROGRESS' AND locked_until <= now()
  │    → crash recovery: UPDATE locked_until = now+30s → tiếp tục xử lý
  ├─ status='UNRESOLVED'  [chỉ payment]
  │    → gateway forward (gọi lại gateway với cùng key, không tạo charge mới)
  └─ không có row
       → INSERT (key, 'IN_PROGRESS', locked_until=now+30s) → xử lý
```

**Client KHÔNG sinh key mới khi retry** — tái sử dụng đúng key cũ. Với payment timeout (504), server embed key vào response body như một hint:

```json
{ "error": "PAYMENT_TIMEOUT", "idempotencyKey": "<key-from-header>", "retrySameKey": true }
```

### 0.5. Optimistic Locking qua ETag/If-Match (ADR-03)

Áp dụng cho admin update resource có `version` column (chính là `workshops.version`):

```http
GET /api/v1/admin/workshops/{id}
→ 200 OK
  ETag: "42"               # giá trị workshops.version
  { ..., "version": 42 }

PATCH /api/v1/admin/workshops/{id}
  If-Match: "42"
  { "startsAt": "..." }
→ 200 OK   (version → 43)  hoặc
→ 412 Precondition Failed  (đã có người sửa, version hiện tại ≠ 42)
```

Trên endpoint `POST /registrations`, OL **không expose ra ngoài** — client không cần biết về `version`. Server tự handle retry trong vòng lặp đăng ký (max 3 retries) như đã đặc tả trong invariant số (4) ở `design.md`.

### 0.6. Pagination, Filtering, Sorting

Quy ước cursor-based cho list dài (registrations, checkin queue), offset-based cho admin dashboard.

```
GET /api/v1/workshops?
  status=open
  &day=2026-05-12
  &cursor=eyJsYXN0X2lkIjoiLi4uIn0=
  &limit=20
  &sort=-starts_at
```

Response wrapper:

```json
{
  "data": [ ... ],
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJsYXN0X2lkIjoiLi4uIn0=",
    "hasMore": true,
    "total": 86                  // chỉ với offset-based; null với cursor-based
  }
}
```

### 0.7. Error response format (RFC 7807-inspired)

Mọi response 4xx/5xx có cùng schema:

```json
{
  "error": {
    "type": "registration.workshop_full",
    "title": "Workshop đã đầy chỗ",
    "status": 409,
    "detail": "Workshop 'AI Agents 101' không còn chỗ trống.",
    "instance": "/api/v1/workshops/3f2a.../register",
    "traceId": "01HXYZ..."
  }
}
```

`type` là URN ổn định mà client có thể switch trên đó. Danh mục error type tập trung trong `specs/error-codes.md` (Stage 5).

### 0.8. Caching headers (ADR-13)

Endpoint danh sách/chi tiết workshop trả `Cache-Control` ngắn:

```
Cache-Control: public, max-age=10
ETag: W/"<hash-of-payload>"
```

10 giây phản chiếu đúng TTL của Redis cache để **hai cấp cache (CDN/browser ↔ Redis ↔ PostgreSQL) đồng bộ ngữ nghĩa**.

---

## 1. Module **Identity & Auth**

> **Bounded context:** Identity. **Tables:** `students`, `staff`, `device_tokens`.
> **Liên quan ADR:** ADR-04 (JWT), ADR-05 (RBAC), ADR-09 (push notification token).

### 1.1. `POST /auth/login`

Đăng nhập cho cả 3 role. Server tự phân biệt qua `account_type`.

**Auth:** Public.

**Request (body fields phân biệt theo account_type):**

```json
// account_type = "student"
{ "accountType": "student", "studentId": "21127001", "password": "..." }

// account_type = "staff"
{ "accountType": "staff", "email": "btc01@unihub.edu.vn", "password": "..." }
```

`student_id` và `email` là hai fields tách biệt — không dùng `identifier` chung — để giữ validation format rõ ràng (MSSV format vs email format).

**Response 200 — Web client:**

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=Strict; Path=/auth/refresh; Max-Age=604800

{
  "accessToken": "<JWT>",
  "tokenType":   "Bearer",
  "expiresIn":   900,
  "role":         "student",
  "refreshToken": null,
  "user": { "id": "21127001", "role": "student", "fullName": "...", "email": "..." }
}
```

**Response 200 — Mobile client (checkin_staff):**

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=<token>; HttpOnly; ...  (vẫn set, mobile bỏ qua)

{
  "accessToken": "<JWT>",
  "tokenType":   "Bearer",
  "expiresIn":   900,
  "role":         "checkin_staff",
  "refreshToken": "<token>",       ← CÓ trong body để mobile lưu vào Keystore/Keychain
  "user": {
    "id": "uuid",
    "role": "checkin_staff",
    "fullName": "...",
    "email": "...",
    "allowedWorkshopIds": ["uuid1", "uuid2"]
  }
}
```

**Errors:** `401 auth.invalid_credentials`, `403 auth.account_disabled`.

**Rate limit:** T1 — 60 req/60s per IP.

---

### 1.2. `POST /auth/refresh`

**Auth:** Không dùng Bearer.

* **Web:** Browser tự gửi HttpOnly cookie `refresh_token` (nhờ `Path=/auth/refresh` attribute — cookie chỉ đính kèm đúng endpoint này).
* **Mobile:** Gửi `{ "refreshToken": "<stored_token>" }` trong JSON body.

**Response 200:** Tương tự login — rotate refresh token (one-time use). Web nhận cookie mới, mobile nhận body mới.

**Errors:** `401 auth.refresh_invalid`, `401 auth.refresh_expired`.

---

### 1.3. `POST /auth/logout`

**Auth:** Bearer.

**Behavior:** Revoke refresh token (lưu jti vào denylist Redis với TTL = thời gian còn lại của token). Access token tự hết hạn sau 15 phút — không cần denylist từng access token (cost-benefit ADR-04).

**Response 204 No Content.**

---

### 1.4. `GET /auth/me`

**Auth:** Bearer (mọi role).

Trả thông tin profile của user đang đăng nhập. Frontend gọi sau login để hiển thị tên, role.

---

### 1.5. `POST /device-tokens`

Đăng ký FCM/APNs token cho push notification (ADR-09 — InAppChannel).

**Auth:** Bearer (chỉ `student`).

**Request:**

```json
{
  "token": "fcm_or_apns_token_string",
  "platform": "ios | android"
}
```

**Behavior:**

* `INSERT ... ON CONFLICT (token) DO UPDATE SET student_id = EXCLUDED.student_id, last_seen = now(), is_active = true`.
* Cùng device đổi user → token được rebind (1 token chỉ thuộc 1 student tại một thời điểm).

**Response 201 / 200 (upsert).**

---

### 1.6. `DELETE /device-tokens/{token}`

User logout trên device → mobile app gọi để gỡ subscription.

**Behavior:** `UPDATE device_tokens SET is_active = false` (giữ row để debug, không hard delete).

**Response 204.**

---

## 2. Module **Catalog (Workshop Browsing — Public)**

> **Bounded context:** Event Core. **Tables:** `workshops`, `rooms`, `speakers`. **View:** `v_workshop_availability`.
> **Liên quan ADR:** ADR-13 (cache TTL 10s), ADR-06 (rate limit per-IP — đây là endpoint hot nhất trong spike).

### 2.1. `GET /workshops`

Danh sách workshop công khai. Đây là endpoint **chịu tải lớn nhất** trong 10 phút spike đăng ký — đánh trực tiếp vào Redis cache trước khi xuống PostgreSQL.

**Auth:** Public (anonymous OK) hoặc Bearer (để personalize "đã đăng ký chưa").

**Query params:**

```
?status=open               # default 'open'; admin có thể xem 'all' qua admin endpoint
?day=YYYY-MM-DD            # lọc theo ngày trong tuần lễ
?topic=ai|career|...       # tag filter (Stage 5 nếu có tagging)
?has_seats=true            # ẩn workshop hết chỗ
?cursor=...&limit=20
&sort=starts_at|-starts_at|seats_available
```

**Response 200:** Mảng `data` với mỗi item lấy từ `v_workshop_availability` + cờ `is_registered` (nếu có Bearer):

```json
{
  "data": [{
    "id": "3f2a...",
    "title": "AI Agents 101",
    "startsAt": "2026-05-12T09:00:00+07:00",
    "endsAt": "2026-05-12T11:00:00+07:00",
    "seatsTotal": 60,
    "seatsAvailable": 12,        // Cache hint, có thể trễ ≤ 10s
    "price": 0,
    "speaker": { "id": "...", "fullName": "...", "title": "...", "avatarUrl": "..." },
    "room": { "id": "...", "name": "B2-01", "building": "...", "floorPlanUrl": "..." },
    "isRegistered": false        // null nếu anonymous
  }],
  "pagination": { ... }
}
```

**Caching:** `Cache-Control: public, max-age=10`. Cache key Redis: `workshops:list:<query-hash>`.

**Rate limit:** `per-ip` 120/phút (cao — endpoint ai cũng gọi). `per-endpoint` global 50k/phút.

---

### 2.2. `GET /workshops/{id}`

Trang chi tiết — bao gồm AI Summary, sơ đồ phòng, bio diễn giả.

**Auth:** Public hoặc Bearer.

**Response 200:**

```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "startsAt": "...", "endsAt": "...",
  "seatsTotal": 60, "seatsAvailable": 12,
  "price": 200000, "currency": "VND",
  "status": "open",
  "speaker": { ..., "bio": "..." },
  "room": { ..., "floorPlanUrl": "...", "facilities": {...} },
  "summary": {
    "status": "done | queued | processing | failed | none",
    "text": "..."                  // null nếu chưa done
  },
  "isRegistered": false,
  "myRegistrationId": null       // populated nếu is_registered=true
}
```

**Caching:** `Cache-Control: public, max-age=10`, `ETag` từ `workshops.updated_at`.

---

### 2.3. `GET /workshops/{id}/availability`

Endpoint nhẹ chỉ trả `seats_available` — frontend dùng để **polling** (mỗi 5–10s) trên trang chi tiết khi sinh viên đang đắn đo bấm "Đăng ký". Tách riêng để cache separately và không kéo theo speaker/room/summary.

**Response 200:**

```json
{
  "workshopId": "...",
  "seatsAvailable": 12,
  "asOf": "2026-05-12T08:59:55+07:00"     // server time của cache hit
}
```

**Caching:** Đánh thẳng cache `workshop:{id}:seats` (TTL 10s) — **bỏ qua DB hoàn toàn nếu cache hit**.

---

### 2.4. `GET /rooms/{id}` và `GET /speakers/{id}`

Public detail endpoint cho room và speaker. Cache 5 phút (data ít đổi).

---

## 3. Module **Registration**

> **Bounded context:** Transaction. **Tables:** `registrations`, `idempotency_keys`, `workshops` (OL update).
> **Liên quan ADR:** ADR-03 (OL + 3-state idempotency), ADR-08, ADR-06 (rate limit chặt cho POST).
> **Tham chiếu spec:** `specs/registration-paid.md`.

### 3.1. `POST /registrations` ⭐ Endpoint quan trọng nhất

Đăng ký workshop. Một endpoint cho cả free và paid — server phân nhánh nội bộ dựa trên `workshops.price`.

**Auth:** Bearer (chỉ `student`).

**Headers bắt buộc:**

```
Idempotency-Key: <UUID v4 sinh từ client, trước request đầu tiên>
```

**Request body:**

```json
{ "workshopId": "3f2a..." }
```

**Rate limit:** T2 (user: 30/60s) + T3 (user×workshop: 5/60s). T1 không áp dụng (đã authenticated).

**Behavior trên server:**

```
Bước 0: Rate limit check T2, T3
Bước 1: Pre-check seats_available qua Redis cache (fail-fast, không chạm DB nếu cache hit "0")
Bước 2: Claim idempotency_key (3-state, crash recovery với locked_until)
Bước 3: OL retry loop (MAX_RETRIES=1, tổng 2 attempts):
  BEGIN
    INSERT registrations (status='PENDING' hoặc 'CONFIRMED') ON CONFLICT DO NOTHING
    IF rowsAffected=0 → ROLLBACK, trả existing registration (idempotent)
    UPDATE workshops SET seats_available-=1, version+=1
           WHERE id=? AND version=? AND seats_available>0
    IF rowsAffected=0 → ROLLBACK, retry (OL conflict)
  COMMIT
Bước 4: Finalize idempotency key → 'COMPLETED'
Bước 5: DEL cache key (fire-and-forget)
Bước 6: enqueue notification job (async, không block response)
```

**Response 201 (free):**

```json
{ "id": "reg_uuid", "workshopId": "...", "status": "confirmed",
  "qrCode": "qr_uuid_v4", "registeredAt": "...", "nextStep": null }
```

**Response 201 (paid):**

```json
{ "id": "reg_uuid", "workshopId": "...", "status": "pending",
  "qrCode": null, "registeredAt": "...",
  "nextStep": { "action": "create_payment", "endpoint": "/api/v1/payments",
                 "amount": 200000, "currency": "VND", "expiresAt": "..." } }
```

**Response 200:** Idempotent replay — key đã `completed`, trả lại response gốc.

**Errors:**

| HTTP | `error` | Trigger |
|---|---|---|
| 400 | `registration.workshop_not_open` | status ≠ 'OPEN' |
| 409 | `request_in_progress` | key đang `in_progress`, locked_until chưa hết |
| 422 | `registration.workshop_full` | seats=0 (cache pre-check hoặc OL confirm) |
| 422 | `registration.already_registered` | UNIQUE(workshop_id, student_id) hit |
| 422 | `registration.student_not_in_csv` | student_id không có trong students table (ADR-12 known 24h gap) |
| 422 | `registration.conflict_exhausted` | OL retry ceiling vượt (extreme contention) |

---

### 3.2. `GET /registrations`

Danh sách registration của user đang login.

**Auth:** Bearer (`student`).

**Query:** `?status=confirmed,paid,pending,cancelled` `?upcoming=true`

**Response:** mảng `data`. Mỗi item có `qr_code` nếu status ∈ `{confirmed, paid}`.

**Authorization (Method-level — enforcement point #3):** WHERE student_id = JWT.sub. **Không** có khả năng truyền student_id qua query — tránh lộ data ngang hàng.

---

### 3.3. `GET /registrations/{id}`

Detail của một registration (kèm QR, thông tin workshop, payment status nếu paid).

**Auth:** Bearer. Method-level check: `registrations.student_id = JWT.sub`. Trả 404 nếu không sở hữu (không 403 — tránh enumeration).

---

### 3.4. `DELETE /registrations/{id}`

Hủy đăng ký (trước khi workshop bắt đầu N giờ — chính sách trong `specs/registration-paid.md`).

**Auth:** Bearer (chính chủ).

**Behavior:**

```
BEGIN
  UPDATE registrations SET status='CANCELLED' WHERE id=? AND student_id=? AND status IN ('CONFIRMED','PAID','PENDING')
  IF rowsAffected = 0 → 409 không thể hủy (đã hủy / sai trạng thái)
  UPDATE workshops SET seats_available = seats_available + 1, version = version + 1 WHERE id = ?
COMMIT
```

Nếu là paid → đẩy job hoàn tiền vào BullMQs.

**Response 200** với registration đã update.

---

## 4. Module **Payment**

> **Bounded context:** Transaction. **Tables:** `payments`, `idempotency_keys`, `registrations`.
> **Liên quan ADR:** ADR-07 (Circuit Breaker), ADR-08 (idempotency 3-state với 'UNRESOLVED').
> **Tham chiếu spec:** `specs/registration-paid.md`, `specs/payment-reconciliation.md`, `specs/circuit-breaker.md`.

### 4.1. `POST /payments`

**Auth:** Bearer (`student`).

**Headers bắt buộc:**

```
Idempotency-Key: <UUID v4 sinh từ client, trước request đầu tiên>
```

**Request body:**

```json
{
  "registrationId": "reg_uuid",
  "gateway":         "VNPAY | STRIPE | MOMO | MOCK",
  "returnUrl":      "https://app.unihub.../payment-result"
}
```

Server forward giá trị `Idempotency-Key` header làm `Idempotency-Key` header khi gọi ra gateway (ADR-08 INV-04). Server embed lại key trong 504 response body như hint retry.

**Rate limit:** T2 (user: 30/60s) + T3 (user×workshop: 5/60s).

**Step ordering bắt buộc (`registration-paid.md` INV-03):**

```
Bước ①: Idempotency check (PHẢI TRƯỚC Circuit Breaker)
  - status='COMPLETED' → trả cache, kể cả khi CB đang OPEN
  - status='UNRESOLVED' → gateway forward (không tạo charge mới)
  - status='IN_PROGRESS' locked → 409 payment_in_progress
  - không có → tiếp tục

Bước ②: Circuit Breaker check (PHẢI SAU Idempotency)
  - OPEN → 503 PAYMENT_GATEWAY_OPEN, Retry-After: 30

Bước ③: Claim/refresh idempotency key → 'IN_PROGRESS'
Bước ④: INSERT payment (status='INITIATED')
         POST gateway với header Idempotency-Key: {payment_key}, timeout 5s
Bước ⑤: Finalize (atomic):
  gateway 200  → payment='SUCCEEDED', key='COMPLETED', registration='PAID' → 200
  gateway 4xx  → payment='FAILED',    key='COMPLETED'                      → 402
  timeout/5xx  → payment='UNRESOLVED', key='UNRESOLVED'                   → 504
```

**Response 200 (success / idempotent replay):**

```json
{ "status": "succeeded", "receiptId": "gateway_charge_id", "qrCode": "qr_uuid" }
```

**Response 504 (timeout — đặc biệt):**

```json
{
  "error": "PAYMENT_TIMEOUT",
  "idempotencyKey": "<same-as-request-header>",
  "retrySameKey": true,
  "retryAfter": 30
}
```

Client **phải dùng lại `Idempotency-Key` header này**, không sinh key mới.

**Errors:** `503 PAYMENT_GATEWAY_OPEN` (CB OPEN), `402 payment.declined`, `409 payment_in_progress`.

---

### 4.2. `GET /payments/{id}`

Tra cứu trạng thái payment. Polling endpoint cho trang `/payment-result`.

**Auth:** Bearer (chính chủ qua registration → student).

---

### 4.3. `POST /payments/webhook/{gateway}` ⚠ Auth riêng

Endpoint nhận callback từ gateway xác nhận payment (trong trường hợp redirect-flow).

**Auth:** **KHÔNG dùng JWT** — verify HMAC signature từ gateway (`X-Webhook-Signature` header). Mỗi gateway có signing secret riêng cấu hình ở `notification_channel_configs` không phải — đặt ở `payment_gateway_configs` (Stage 5 nếu cần CRUD trên đó).

**Behavior:** Verify signature → look up payment by `gateway_charge_id` → cập nhật status → trigger downstream.

Endpoint này **idempotent tự nhiên** vì gateway có thể gửi lại webhook nhiều lần.

---

## 5. Module **Check-in (Mobile + Staff)**

> **Bounded context:** Transaction (server) + Mobile SQLite (client).
> **Liên quan ADR:** ADR-11 (offline + Outbox sync).
> **Tham chiếu spec:** `specs/checkin-offline.md`. Mobile schema: `mobile-schema.sql`.

### 5.1. `GET /checkin/workshops/{id}/registrations`

**Mục đích:** Pre-load `cached_registrations` xuống mobile SQLite trước khi vào khu vực mất mạng.

**Auth:** Bearer (`checkin_staff`).

**Authorization:** `workshop_id ∈ JWT.allowed_workshop_ids`. Nếu không → 403.

**Query:**

```
?cursor=...&limit=200          # batch lớn vì để cache offline
?include_status=paid,confirmed  # default = paid,confirmed (mirror filter trong mobile schema)
```

**Response 200:**

```json
{
  "data": [{
    "registrationId": "...",
    "qrCode": "...",
    "studentId": "21127001",
    "studentCode": "21127001",
    "studentName": "...",
    "registrationStatus": "paid"
  }],
  "pagination": {
    "limit": 200,
    "nextCursor": "...",
    "hasMore": true,
    "total": 60                  // server_total — mobile dùng cho is_fully_loaded check
  }
}
```

Response header bổ sung: `X-Total-Count: 60` để mobile populate `cache_metadata.server_total` (Gap fix M3).

---

### 5.2. `POST /checkins`

Check-in **online** (mạng ổn định) — single-record.

**Auth:** Bearer (`checkin_staff`).

**Idempotency:** Không cần application-level key — `ON CONFLICT (registration_id) DO NOTHING` trên bảng `checkins` đảm nhận. Cùng QR quét 2 lần → DB tự xử lý, response giải thích `duplicate=true`.

**Request:**

```json
{
  "qrCode": "qr_uuid_v4",
  "workshopId": "...",
  "checkedInAt": "2026-05-12T09:15:23+07:00",
  "clientLocalId": "device_uuid"
}
```

**Behavior:**

```
1. SELECT id, status, workshop_id FROM registrations WHERE qr_code = ?
   - Không có → 404 checkin.qr_invalid
   - status NOT IN ('PAID','CONFIRMED') → 403 checkin.registration_not_active
   - workshop_id mismatch → 422 checkin.wrong_workshop

2. Verify staff được phân công workshop này (ADR-05 enforcement #3):
   workshop_id ∈ JWT.allowed_workshop_ids → nếu không, 403

3. INSERT INTO checkins (registration_id, checked_in_at, received_at, checked_by, client_local_id)
   ON CONFLICT (registration_id) DO NOTHING
   - rowsAffected = 1 → 201, trả checkin record
   - rowsAffected = 0 → 200 với flag "already_checked_in", trả checkin record gốc
```

**Response 201 (mới):**

```json
{
  "id": "...",
  "registrationId": "...",
  "checkedInAt": "...",
  "receivedAt": "2026-05-12T09:15:24+07:00",
  "student": { "code": "21127001", "name": "..." },
  "duplicate": false
}
```

**Response 200 (đã check-in trước):**

```json
{ ..., "duplicate": true, "originallyCheckedInAt": "2026-05-12T09:14:50+07:00" }
```

---

### 5.3. `POST /checkins/sync` ⭐ Outbox sync (offline → online)

**Mục đích:** Mobile flush `checkin_queue` lên server theo batch.

**Auth:** Bearer (`checkin_staff`).

**Không dùng Idempotency-Key header** — mỗi item có `local_id` riêng làm per-item key. Idempotency tự nhiên qua `ON CONFLICT DO NOTHING`.

**Request (body trực tiếp là mảng items, per `checkin-offline.md` §2.2):**

```json
[
  { "localId": "uuid_v4", "qrCode": "...", "checkedAt": "2025-05-06T10:30:00+07:00" },
  { "localId": "uuid_v4", "qrCode": "...", "checkedAt": "2025-05-06T10:31:00+07:00" }
]
```

Tối đa 50 items / batch (per spec). `checked_at` là ISO 8601 có timezone (device time).

**Behavior server (per `checkin-offline.md` §2.3):**

```
FOR EACH item:
  Lookup: SELECT ... FROM registrations JOIN workshops WHERE r.qr_code = item.qr_code

  Không tìm thấy → rejected, reason: "qr_invalid"
  r.status ≠ 'PAID' → rejected, reason: "not_paid"
  w.status = 'CANCELLED' → rejected, reason: "workshop_cancelled"

  INSERT INTO checkins (registration_id, checked_in_at, received_at, checked_by, client_local_id)
  ON CONFLICT (registration_id) DO NOTHING

  rowsAffected = 1 → ok, server_id = <new_checkins.id>
  rowsAffected = 0 → duplicate (first-check-in-wins, query ai check-in trước)
```

**Response 200 (`checkin-offline.md` §Bước 3):**

```json
[
  { "localId": "uuid_v4", "result": "ok",        "serverId": "uuid" },
  { "localId": "uuid_v4", "result": "duplicate", "firstCheckinAt": "...",
                                                   "firstStaffName": "Staff Nguyễn" },
  { "localId": "uuid_v4", "result": "rejected",  "reason": "qr_invalid" }
]
```

**Enum `result`:** `ok | duplicate | rejected` — phải đúng chính xác các giá trị này vì mobile schema mapping `local_checkins.status = 'SYNCED' | 'DUPLICATE' | 'REJECTED'` tương ứng. Đổi tên enum = mobile app broken.

Mobile update từng row theo `local_id` (không theo thứ tự index):

* `ok` → `local_checkins.status = 'SYNCED'`, lưu `server_id`
* `duplicate` → `local_checkins.status = 'DUPLICATE'`, hiển thị "Đã check-in lúc {first_checkin_at} bởi {first_staff_name}"
* `rejected` → `local_checkins.status = 'REJECTED'`, `sync_error = reason`

**Rate limit:** T2 — 30 req/60s per user.

---

### 5.4. `POST /auth/login` cho mobile (M0 — ràng buộc với mobile schema)

Khi mobile gọi `/auth/login`, server cần trả thêm `allowed_workshop_ids` để mobile lưu vào `app_session.allowed_workshop_ids`. Đây là customization của 1.1 cho role `checkin_staff`:

```json
"user": {
  "id": "staff_uuid",
  "role": "checkin_staff",
  "allowedWorkshopIds": ["uuid1", "uuid2", "uuid3"]
}
```

---

## 6. Module **Workshop Admin (BTC)**

> **Bounded context:** Event Core (write side). **Tables:** `workshops`, `rooms`, `speakers`.
> **Liên quan ADR:** ADR-03 (OL trên `version`), ADR-05 (RBAC role=`btc`).

### 6.1. `POST /admin/workshops`

Tạo workshop (mặc định status = `draft`).

**Auth:** Bearer (`btc`).

**Request:**

```json
{
  "title": "...",
  "description": "...",
  "speakerId": "...",         // optional ở draft
  "roomId": "...",            // optional ở draft
  "startsAt": "...", "endsAt": "...",
  "seatsTotal": 60,
  "price": 0,
  "status": "DRAFT"            // hoặc 'OPEN' nếu muốn publish luôn
}
```

**Validation:**

* `ends_at > starts_at` (DB CHECK).
* Nếu `status='OPEN'`: `room_id` và `speaker_id` phải có giá trị, và phòng không xung đột lịch (custom check).
* `seats_available = seats_total` (auto khởi tạo).

**Response 201** với workshop full + `version: 0`.

---

### 6.2. `GET /admin/workshops`

Admin view — bao gồm cả `draft`, `cancelled`, `closed` (khác với public endpoint chỉ trả `open`).

**Auth:** Bearer (`btc`).

**Query:** filter theo status, ngày, tìm theo title.

---

### 6.3. `GET /admin/workshops/{id}`

Detail. Response có header `ETag: "<version>"` cho OL.

---

### 6.4. `PATCH /admin/workshops/{id}`

Update với Optimistic Locking.

**Headers bắt buộc:** `If-Match: "<version>"`.

**Request body:** chỉ field cần đổi (PATCH semantics).

**Behavior:**

```sql
UPDATE workshops
SET <fields>, version = version + 1
WHERE id = ? AND version = ?       -- version từ If-Match
RETURNING version;
-- rowsAffected = 0 → 412 Precondition Failed (đã có người sửa)
```

**Side effect:** Nếu đổi `room_id` hoặc `starts_at`/`ends_at` → đẩy job notification "workshop changed" cho tất cả `registrations` đang ở status active.

**Edge case:** Đổi `seats_total` xuống thấp hơn `seats_total - seats_available` (số chỗ đã đăng ký) → 422 `workshop.seats_total_below_registered`.

---

### 6.5. `POST /admin/workshops/{id}/publish`

Promote draft → open. Tách action riêng để có validation chuyên biệt.

**Behavior:** Verify `room_id`, `speaker_id`, room không xung đột lịch → UPDATE status='OPEN'.

---

### 6.6. `POST /admin/workshops/{id}/cancel`

**Request:**

```json
{
  "reason": "Diễn giả đột xuất không tham gia",
  "notifyRegistered": true
}
```

**Behavior (transaction):**

```
UPDATE workshops SET status='CANCELLED', version = version + 1
UPDATE registrations SET status='CANCELLED' WHERE workshop_id = ? AND status IN ('PAID','CONFIRMED','PENDING')
FOR EACH paid registration → enqueue refund job (BullMQs)
FOR EACH registration → enqueue notification (workshop_cancelled)
```

---

### 6.7. `GET /admin/workshops/{id}/registrations`

Danh sách sinh viên đã đăng ký workshop.

**Query:** `?status=paid,confirmed` `?include=student` (eager load student detail).

---

### 6.8. `GET /admin/workshops/{id}/stats`

```json
{
  "registrations": {
    "total": 60, "byStatus": { "paid": 45, "pending": 3, "confirmed": 10, "cancelled": 2 }
  },
  "checkins": { "total": 38, "rate": 0.66 },
  "revenue": { "amount": 9000000, "currency": "VND" }
}
```

---

## 7. Module **AI Summary**

> **Bounded context:** Async. **Liên quan ADR:** ADR-10 (BullMQs worker), ADR-14 (summary fields trên `workshops`).

### 7.1. `POST /admin/workshops/{id}/summary` — Upload PDF

**Auth:** Bearer (`btc`).

**Content-Type:** `multipart/form-data` với field `file` là PDF.

**Behavior:**

```
1. Validate: extension .pdf, size ≤ 10MB
2. Lưu file vào object storage (hoặc local fs cho dev) → pdf_url
3. UPDATE workshops SET pdf_url = ?, summary_status = 'QUEUED', version = version + 1
4. addJob vào stream summary_jobs với {workshop_id, pdf_url}
5. Return 202 Accepted với link polling
```

**Response 202:**

```json
{
  "workshopId": "...",
  "summaryStatus": "queued",
  "pollUrl": "/api/v1/admin/workshops/{id}/summary"
}
```

---

### 7.2. `GET /admin/workshops/{id}/summary`

Polling status. Cũng public-readable (sinh viên xem summary trên trang workshop chi tiết — nằm trong response của 2.2).

```json
{
  "status": "queued | processing | done | failed | none",
  "text": "...",                      // null trừ khi 'DONE'
  "updatedAt": "...",
  "errorDetail": "..."               // null trừ khi 'FAILED'
}
```

---

### 7.3. `POST /admin/workshops/{id}/summary/retry`

Re-trigger sau failed (đã chạm DLQ).

---

### 7.4. `PUT /admin/workshops/{id}/summary`

Override thủ công — BTC chỉnh sửa text AI generated.

**Request:** `{ "text": "..." }`. Set `summary_status='DONE'`.

---

## 8. Module **Resource Management (Speakers, Rooms)**

CRUD đơn giản cho master data. Tất cả prefix `/admin/`, role `btc`.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/speakers` | Pagination |
| POST | `/admin/speakers` | Tạo mới |
| GET | `/admin/speakers/{id}` | Detail |
| PATCH | `/admin/speakers/{id}` | Update |
| DELETE | `/admin/speakers/{id}` | Soft delete (chặn nếu đang được tham chiếu trong workshop chưa kết thúc) |
| GET | `/admin/rooms` | Pagination |
| POST | `/admin/rooms` | Tạo mới (kèm upload `floor_plan_url` qua endpoint upload riêng) |
| GET | `/admin/rooms/{id}` | Detail + danh sách workshop đã book |
| PATCH | `/admin/rooms/{id}` | Update |

---

## 9. Module **CSV Import & Student Sync**

> **Bounded context:** Async. **Liên quan ADR:** ADR-12. **Tham chiếu spec:** `specs/csv-import.md`.

### 9.1. `GET /admin/imports`

Danh sách lần chạy import (mỗi đêm 1 row tự động).

**Response:**

```json
{
  "data": [{
    "id": "...",
    "runAt": "2026-05-12T02:00:00+07:00",
    "triggeredBy": "cron",
    "status": "success",
    "totalRows": 12500,
    "successCount": 12498,
    "failedCount": 2,
    "durationMs": 18432,
    "errorFileUrl": "/api/v1/admin/imports/{id}/errors"
  }]
}
```

### 9.2. `GET /admin/imports/{id}` — chi tiết

### 9.3. `GET /admin/imports/{id}/errors`

Download CSV chứa các dòng lỗi.

**Response:** `Content-Type: text/csv; charset=utf-8`. Stream file từ `import_logs.error_file_path`.

### 9.4. `POST /admin/imports/trigger`

Manual trigger — BTC kích hoạt import ngoài lịch (vd. khi nhận CSV bổ sung sinh viên mới nhập học).

**Request:**

```json
{
  "filePath": "/imports/2026-05-12-supplement.csv"     // hoặc multipart upload
}
```

**Concurrency guard:** Reject 409 nếu có row `import_logs.status='IN_PROGRESS'`.

---

## 10. Module **Statistics & Reports**

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats/overview` | Dashboard tổng quan: tổng đăng ký, fill rate trung bình, top workshop |
| GET | `/admin/stats/checkins?from=&to=` | Aggregated check-in stats |
| GET | `/admin/stats/revenue?from=&to=` | Doanh thu paid workshops |
| GET | `/admin/stats/export?type=registrations&workshop_id=` | Export CSV |

Tất cả endpoint stats dùng heavy caching (5 phút) vì BTC không cần real-time.

---

## 11. Module **Notification Channels**

> **Liên quan ADR:** ADR-09 (Strategy Pattern).

### 11.1. `GET /admin/notification-channels`

Liệt kê các channel đã config (`notification_channel_configs`).

### 11.2. `PATCH /admin/notification-channels/{id}`

Bật/tắt channel hoặc cập nhật config (vd. thêm Telegram bot token cho học kỳ mới — đúng với requirement "dễ dàng bổ sung kênh thông báo mới").

```json
{ "isActive": true, "configJson": { "botToken": "...", "chatIdPattern": "..." } }
```

### 11.3. `GET /admin/notifications/logs?status=failed`

Audit trail từ `notification_logs` — debug push thất bại.

---

## 12. Module **System Admin (Circuit Breaker + Reconciliation)**

> **Bounded context:** Operational. Owner: `payment` (CB + Reconcile) + `background` (cron).
> **Liên quan ADR:** ADR-07 (CB), ADR-08 (`unresolved` state).
> **Tham chiếu spec:** `circuit-breaker.md` §3.4, `payment-reconciliation.md` §2.1.

### 12.1. `GET /admin/system/circuit-breaker`

Trạng thái CB của tất cả payment gateway đang cấu hình.

**Auth:** Bearer (`btc`).

**Response 200:**

```json
{
  "data": [{
    "gateway": "VNPAY",
    "state": "OPEN",
    "failureCount": 5,
    "openedAt": "2026-05-12T09:14:50+07:00",
    "lastAttempt": "2026-05-12T09:14:50+07:00",
    "autoCloseAt": "2026-05-12T09:15:20+07:00"
  }]
}
```

CB state là **in-memory** — reset về CLOSED khi process restart. BTC dùng endpoint này để monitor khi có sự cố gateway trong sự kiện.

---

### 12.2. `POST /admin/system/circuit-breaker/{gateway}/reset`

Reset CB về `CLOSED`, `failure_count = 0` cho gateway cụ thể.

**Auth:** Bearer (`btc`).

**Path param:** `gateway` ∈ `VNPAY | STRIPE | MOMO | MOCK`.

**Khi nào dùng:** Sau khi incident gateway được xử lý và BTC xác nhận gateway bình thường. Manual reset bỏ qua 30s OPEN timeout.

**Response 200:** CB state sau reset (`state: "CLOSED", failure_count: 0`).

---

### 12.3. `POST /admin/payments/reconcile`

Trigger reconciliation job ngay lập tức thay vì chờ cron 5 phút.

**Auth:** Bearer (`btc`).

**Concurrency guard:** Job dùng PostgreSQL advisory lock — nếu cron đang chạy → `409 reconciliation.already_running`.

**Scope:** Query `payments WHERE status='UNRESOLVED' AND created_at BETWEEN now()-24h AND now()-5min`, gọi gateway query API cho từng payment, update `payments.status` + `idempotency_keys.status` atomic.

**Response 202:**

```json
{
  "startedAt": "2026-05-12T09:20:00+07:00",
  "unresolvedCount": 3
}
```

---

## Phụ lục A — Ma trận RBAC × Endpoint

| Module | student | btc | checkin_staff | public |
|---|:---:|:---:|:---:|:---:|
| `/auth/*` | ✅ | ✅ | ✅ | login/refresh only |
| `/workshops` (GET) | ✅ | ✅ | ✅ | ✅ |
| `/registrations` | ✅ own | — | — | — |
| `/payments` | ✅ own | — | — | — |
| `/checkins`, `/checkin/*` | — | — | ✅ assigned ws | — |
| `/admin/workshops/*` | — | ✅ | — | — |
| `/admin/speakers`, `/admin/rooms` | — | ✅ | — | — |
| `/admin/imports/*` | — | ✅ | — | — |
| `/admin/stats/*` | — | ✅ | — | — |
| `/admin/notification-channels/*` | — | ✅ | — | — |
| `/admin/system/circuit-breaker/*` | — | ✅ | — | — |
| `/admin/payments/reconcile` | — | ✅ | — | — |

---

## Phụ lục B — Map Endpoint × ADR × Schema

| Endpoint | ADR chính | Bảng / View |
|---|---|---|
| `POST /registrations` | ADR-03, ADR-08, ADR-13, **ADR-15** | `registrations`, `workshops`, `idempotency_keys` |
| `POST /payments` | ADR-07, ADR-08, **ADR-15** | `payments`, `idempotency_keys`, `registrations` |
| `POST /checkins` | (chỉ DB) | `checkins`, `registrations` |
| `POST /checkins/sync` | ADR-11 | `checkins` (server) ↔ `local_checkins` (mobile) |
| `GET /workshops` | ADR-13 | `v_workshop_availability`, Redis cache |
| `GET /workshops/{id}/availability` | ADR-13 | Redis-only (cache hit), fallback PG |
| `PATCH /admin/workshops/{id}` | ADR-03 | `workshops.version` |
| `POST /admin/workshops/{id}/summary` | ADR-10, ADR-14 | `workshops.summary_status`, BullMQs |
| `POST /auth/login` | ADR-04 | `students`, `staff` |
| `POST /auth/refresh` | ADR-04 | HttpOnly cookie (web), body (mobile) |
| `GET /admin/imports/*` | ADR-12 | `import_logs` |
| `* /device-tokens` | ADR-09 | `device_tokens` |
| `GET /admin/system/circuit-breaker` | ADR-07 | In-memory CB state |
| `POST /admin/system/circuit-breaker/{gw}/reset` | ADR-07 | In-memory CB state |
| `POST /admin/payments/reconcile` | ADR-08 | `payments`, `idempotency_keys` |

---

## Phụ lục C — Ma trận Rate Limit Tier (ADR-06, `rate-limiting.md`)

| Endpoint | T1 — IP (60/60s) | T2 — User (30/60s) | T3 — User×Workshop (5/60s) |
|---|:---:|:---:|:---:|
| `POST /auth/login` | ✅ | — | — |
| `GET /workshops` (public) | ✅ | — | — |
| `GET /workshops/:id` | — | ✅ | — |
| `POST /registrations` | — | ✅ | ✅ |
| `POST /payments` | — | ✅ | ✅ |
| `POST /checkins/sync` | — | ✅ | — |
| `POST /admin/workshops` | — | ✅ | — |
| `POST /admin/workshops/:id/summary` | — | ✅ | — |
| `GET /admin/*` | — | ✅ | — |

**Ghi chú:**

* T1 chỉ áp dụng cho unauthenticated. Sau login, T2 per `user_id` thay thế T1 — giải quyết NAT ký túc xá.
* T3 scope per `{user_id}:{workshop_id}` — đăng ký workshop A không tiêu quota của workshop B.
* Fail-open khi Redis down — rate limiting tắt, OL (ADR-03) vẫn bảo đảm correctness.

---

## Phụ lục D — Tổng kết Idempotency (ADR-08, ADR-15)

| Endpoint | Vị trí key | Header / Field | Cơ chế server | Lưu ý |
|---|---|---|---|---|
| `POST /registrations` | **Header** | `Idempotency-Key` | 3-state (`in_progress`/`completed`) | OL retry ẩn trong server |
| `POST /payments` | **Header** | `Idempotency-Key` | 3-state (kể cả `unresolved`) | Forward đến gateway — ADR-08 INV-04 |
| `POST /checkins` (online) | DB UNIQUE | — | `ON CONFLICT (registration_id) DO NOTHING` | Không cần application-level key |
| `POST /checkins/sync` | Body, per-item | `local_id` | DB UNIQUE per item | Batch idempotent tự nhiên |
| `POST /payments/webhook/*` | Lookup | `gateway_charge_id` | DB lookup | Gateway gửi lại nhiều lần — OK |

**Quy tắc chung:** Header `Idempotency-Key` (ADR-15) — key là transport concern, không phải business field. Client không sinh key mới khi retry. Tất cả `PUT/PATCH/DELETE` có idempotency tự nhiên qua HTTP semantics.
