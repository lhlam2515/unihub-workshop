# Spec: Authentication (`authentication`)

> **ASR hiện thực hóa:** ASR-9 (Security — xác thực đúng danh tính trước khi phân quyền)
>
> **ADR tham chiếu:** ADR-04 (JWT 15 phút + Refresh Token 7 ngày)
>
> **Cơ chế triển khai:** Xem `access-control.md` §3.1 và §5.1 — mô tả thuật toán verify JWT, RS256 signature flow, và offline verification cho mobile.
>
> **Tài liệu này định nghĩa:** HTTP contract của 401 errors, danh sách public vs protected routes, token lifecycle observable từ client, mobile offline behavior, và AC có thể test.

---

## 1. Mô tả

Xác thực được thực hiện bởi **JWT Middleware (Layer ①)** — chạy đầu tiên trong request pipeline, trước RBAC và business logic. Middleware chỉ xác minh danh tính; phân quyền là nhiệm vụ của Layer ② (xem `specs/authorization.md`).

Hai loại client:

- **Web (browser):** Dùng Bearer token trong header, refresh token trong HttpOnly cookie.
- **Mobile (checkin_staff):** Lưu token trong secure storage; có thể verify JWT offline bằng public key bundle.

---

## 2. Token Structure

### Access Token Payload

**Student:**

```json
{
  "sub":       "STU-20210001",
  "role":      "student",
  "user_type": "student",
  "email":     "alice@university.edu",
  "iat":       1700000000,
  "exp":       1700000900
}
```

**Staff (BTC hoặc checkin_staff):**

```json
{
  "sub":       "a1b2c3d4-uuid",
  "role":      "btc",
  "user_type": "staff",
  "email":     "btc01@unihub.edu",
  "iat":       1700000000,
  "exp":       1700000900
}
```

TTL access token: **15 phút** (`exp - iat = 900s`).
Signing algorithm: **RS256** (asymmetric — private key chỉ ở auth service, public key verify ở mọi nơi kể cả mobile bundle).

---

## 3. Login Flow

### Endpoint: `/auth/login` (public)

```
POST /auth/login
Body: { account_type: "student", "student_id": "STU-20210001", "password": "..." }
→ Tra cứu trong bảng `students`

POST /auth/login
Body: { account_type: "staff", "email": "btc01@unihub.edu", "password": "..." }
→ Tra cứu trong bảng `staff`, đọc staff.role để xác định role token
```

**Response khi login thành công (cả hai endpoint):**

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=Strict; Path=/auth/refresh; Max-Age=604800

{
  "access_token": "<JWT>",
  "token_type":   "Bearer",
  "expires_in":   900,
  "role":         "student"
}
```

`refresh_token` trong HttpOnly cookie → JavaScript không đọc được → mitigates XSS.
`access_token` trong JSON body → frontend lưu trong memory (không localStorage để tránh XSS).

**Mobile exception:** Mobile app nhận thêm `refresh_token` trong response body để lưu vào Android Keystore / iOS Keychain, vì mobile không có cookie jar.

---

## 4. Token Lifecycle

### Web client (silent refresh)

```
Mỗi request: gửi access_token trong Authorization: Bearer <token>

Khi access_token còn < 2 phút hết hạn:
  → Frontend tự gọi POST /auth/refresh (background, không ngắt UX)
  → Nhận access_token mới
  → Tiếp tục request bình thường

Khi refresh_token hết hạn (7 ngày):
  → POST /auth/refresh trả 401
  → Redirect về trang login
```

### Mobile client (offline-capable)

```
Online — bình thường:
  1. Login → nhận access_token (15 phút) + refresh_token (secure storage)
  2. Khi access_token còn < 2 phút → silent refresh qua POST /auth/refresh

Offline — verify local:
  1. Đọc access_token từ secure storage
  2. Verify RS256 signature bằng public key đã bundle trong app binary
  3. Kiểm tra exp claim so với device clock
  4. Nếu hợp lệ → cho phép offline features (quét QR, ghi local)
  5. Nếu hết hạn → disable nút Quét, hiển thị "Cần kết nối để làm mới phiên"

Khi có mạng trở lại (trong vòng TTL refresh_token):
  → Silent refresh tự động
  → Tiếp tục dùng bình thường
```

---

## 5. Public Routes (không cần JWT)

| Route | Method | Lý do public |
|---|---|---|
| `/auth/login` | POST | Endpoint lấy token |
| `/auth/refresh` | POST | Dùng refresh_token cookie, không phải access token |
| `/workshops` | GET | Sinh viên chưa login vẫn xem lịch được |
| `/workshops/:id` | GET | Xem chi tiết không cần login |

Tất cả endpoints còn lại yêu cầu `Authorization: Bearer <token>` hợp lệ.

---

## 6. HTTP Contract — 401 Errors

| Tình huống | HTTP | Error code | Hành vi client |
|---|---|---|---|
| Không gửi Authorization header | 401 | `MISSING_TOKEN` | Redirect về login |
| Chữ ký JWT không hợp lệ | 401 | `INVALID_TOKEN` | Redirect về login, xóa local token |
| Access token hết hạn | 401 | `TOKEN_EXPIRED` | Silent refresh; nếu refresh fail → redirect login |
| Refresh token hết hạn / invalid | 401 | `REFRESH_EXPIRED` | Redirect về login (full re-auth) |

**Response format chuẩn:**

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"

{ "error": "TOKEN_EXPIRED", "message": "Access token đã hết hạn" }
```

---

## 7. Kịch bản lỗi

### E-01: Token hết hạn trong khi đang request

```
Client gửi request với access_token đã exp < now.
Server trả 401 TOKEN_EXPIRED.
Client: gọi POST /auth/refresh → nhận token mới → retry request gốc.
Transparent với user nếu silent refresh thành công.
```

### E-02: Token bị giả mạo

```
Attacker tạo token với payload hợp lệ nhưng ký bằng private key khác.
Server verify RS256 signature thất bại → 401 INVALID_TOKEN.
Không có DB lookup — verify hoàn toàn bằng public key.
```

### E-03: Gọi protected endpoint không có header

```
GET /registrations (không có Authorization header)
→ 401 MISSING_TOKEN
Không có business logic nào chạy.
```

### E-04: Mobile offline, token còn hạn

```
Staff tắt wifi, mở app.
App verify JWT local bằng public key bundle → hợp lệ.
Nút Quét: ENABLED.
Check-in ghi vào SQLite local bình thường.
```

### E-05: Mobile offline, token đã hết hạn

```
Staff tắt wifi, token exp < device_clock.
App verify local → hết hạn.
Nút Quét: DISABLED (gray).
Badge: "Cần kết nối để làm mới phiên".
Check-in không thể thực hiện cho đến khi refresh token.
```

### E-06: Device clock lệch (mobile)

```
Device clock bị đặt sai (quá sớm) → token chưa expire theo clock nhưng thực tế đã expire.
Hệ thống verify local thấy "còn hạn" → cho phép offline features.
Khi sync lên server: server verify lại bằng server clock → có thể 401.
Mitigation: server timestamp trong sync response để alert user.
Note: Không ảnh hưởng security — server luôn verify lại khi có network.
```

---

## 8. Ràng buộc (Invariants)

**INV-01 — JWT Không DB Lookup:**
Layer ① KHÔNG query DB để verify token.
Verify hoàn toàn bằng public key + exp claim.
DB lookup chỉ xảy ra ở business handler khi cần data.

**INV-02 — Refresh Token Trong HttpOnly Cookie (Web):**
`refresh_token` KHÔNG được gửi trong JSON body cho web client.
KHÔNG accessible qua `document.cookie` hay JavaScript.
Mobile exception được document rõ ràng.

**INV-03 — Mobile Public Key Bundle:**
Public key phải được bundle trong app binary, không fetch động từ server.
Fetch động tại thời điểm verify = vô nghĩa khi offline.

**INV-04 — Access Token Không Lưu localStorage (Web):**
`access_token` lưu trong memory (JS variable), không `localStorage`.
`localStorage` accessible bởi XSS → không dùng cho token.

**INV-05 — Server Là Source of Truth:**
Mobile offline verification chỉ là UX enablement (cho phép quét khi offline).
Server luôn verify lại JWT khi có network request.
Mobile offline state không phải authorization — chỉ là temporary UX.

---

## 9. Tiêu chí chấp nhận

**AC-01 — Missing token:**
Given: Request đến `/registrations` không có Authorization header.
Then: 401 `{ "error": "MISSING_TOKEN" }`.

**AC-02 — Expired token:**
Given: Access token có exp = now - 60s.
Then: 401 `{ "error": "TOKEN_EXPIRED" }`.
And: Client có thể retry sau khi gọi POST /auth/refresh thành công.

**AC-03 — Tampered token:**
Given: JWT với chữ ký không match public key.
Then: 401 `{ "error": "INVALID_TOKEN" }`.

**AC-04 — Silent refresh:**
Given: access_token còn 90s (< 2 phút), frontend đang active.
Then: Frontend tự gọi POST /auth/refresh trước khi token expire.
And: User không nhận interruption (transparent).

**AC-05 — Mobile offline, token valid:**
Given: Device offline, access_token còn hạn, public key bundled.
Then: Nút "Quét QR" ENABLED. App cho phép ghi check-in local.

**AC-06 — Mobile offline, token expired:**
Given: Device offline, access_token đã hết hạn.
Then: Nút "Quét QR" DISABLED. Badge hiển thị yêu cầu kết nối.

**AC-07 — Sync rejected khi token invalid:**
Given: POST /checkins/sync với access_token hết hạn.
Then: 401 TOKEN_EXPIRED. Batch không được lưu vào server DB.

**AC-08 — Public routes không cần token:**
Given: GET /workshops và GET /workshops/:id không có Authorization header.
Then: 200 với data bình thường (không phải 401).
