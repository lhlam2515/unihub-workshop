# Spec: Authorization (`authorization`)

> **ASR hiện thực hóa:** ASR-9 (Security — phân quyền 3 nhóm khác biệt rõ)
>
> **ADR tham chiếu:** ADR-05 (RBAC 3 roles, 3 enforcement points)
>
> **Cơ chế triển khai:** Xem `access-control.md` §1–§3 và §7 — mô tả cơ chế 3 lớp enforcement (JWT middleware, Route RBAC middleware, Query-level filter), TypeScript decorator pattern, SQL ownership scope, và giới hạn đã biết (không có real-time revocation, không có ABAC).
>
> **Tài liệu này định nghĩa:** Permission matrix đầy đủ, route → role mapping, IDOR protection behavior, frontend guard observable behavior, HTTP contract 403/404, và AC có thể test.

---

## 1. Mô tả

Authorization kiểm tra *"user được phép làm gì?"* sau khi identity đã được xác thực (xem `specs/authentication.md`). Hệ thống dùng RBAC với 3 roles cứng, không có role hierarchy, không có attribute-level condition (ABAC) trong phạm vi đồ án.

Ba lớp enforcement theo thứ tự:

- **Layer ②** Route-level: role có vào được route này không?
- **Layer ③** Query-level: resource này có thuộc về user không?
- **Frontend guard:** UX protection (không phải security boundary)

---

## 2. Permission Matrix

> **Ký hiệu:** ✓ = được phép · — = 403 Forbidden · ◐ = được phép với điều kiện owner (xem chú thích)

| Permission | student | btc | checkin_staff |
|---|:---:|:---:|:---:|
| **WORKSHOP — Xem** | | | |
| Danh sách workshop (`GET /workshops`) | ✓ | ✓ | ✓ |
| Chi tiết + AI summary (`GET /workshops/:id`) | ✓ | ✓ | ✓ |
| **WORKSHOP — Student** | | | |
| Đăng ký workshop (`POST /registrations`) | ✓ | — | — |
| Danh sách đăng ký của mình (`GET /registrations`) | ✓ | — | — |
| QR code của mình (`GET /registrations/:id`) | ◐¹ | — | — |
| **PAYMENT** | | | |
| Thanh toán registration của mình (`POST /payments`) | ◐² | — | — |
| **WORKSHOP — Admin** | | | |
| Tạo workshop (`POST /admin/workshops`) | — | ✓ | — |
| Sửa thông tin (`PATCH /admin/workshops/:id`) | — | ✓ | — |
| Thay đổi status (`POST /admin/workshops/:id/publish`) | — | ✓ | — |
| Hủy workshop (`POST /admin/workshops/:id/cancel`) | — | ✓ | — |
| Xem tất cả registrations (`GET /admin/workshops/:id/registrations`) | — | ✓ | — |
| Thống kê đăng ký (`GET /admin/workshops/:id/stats`) | — | ✓ | — |
| Upload PDF (`POST /admin/workshops/:id/summary`) | — | ✓ | — |
| Trạng thái AI summary (`GET /admin/workshops/:id/summary`) | — | ✓ | — |
| Retry AI summary (`POST /admin/workshops/:id/summary/retry`) | — | ✓ | — |
| **CHECK-IN** | | | |
| Quét QR + ghi nhận check-in (`POST /checkins`) | — | — | ✓ |
| Sync batch offline (`POST /checkins/sync`) | — | — | ✓ |

**Chú thích:**

¹ **QR code — owner check:** Layer ② cho phép role `student` vào endpoint. Layer ③ (query) kiểm tra `registrations.student_id = req.user.id`. Nếu không khớp → 403/404 (xem §5 về IDOR).

² **Payment — owner check:** Tương tự: Layer ② cho phép `student`, Layer ③ verify `registrations.student_id = req.user.id` trước khi tạo payment. Không khớp → 403.

---

## 3. Route → Role Mapping (Layer ②)

| Route | Method | Allowed Roles |
|---|---|---|
| `/workshops` | GET | *(public — không cần JWT)* |
| `/workshops/:id` | GET | *(public — không cần JWT)* |
| `/registrations` | GET | `student` |
| `/registrations/:id` | GET | `student` + owner check |
| `/registrations` | POST | `student` |
| `/payments` | POST | `student` + owner check |
| `/admin/workshops` | POST | `btc` |
| `/admin/workshops/:id` | PATCH | `btc` |
| `/admin/workshops/:id` | DELETE | `btc` |
| `/admin/workshops/:id/publish` | POST | `btc` |
| `/admin/workshops/:id/cancel` | POST | `btc` |
| `/admin/workshops/:id/registrations` | GET | `btc` |
| `/admin/workshops/:id/stats` | GET | `btc` |
| `/admin/workshops/:id/summary` | POST | `btc` |
| `/admin/workshops/:id/summary` | GET | `btc` |
| `/admin/workshops/:id/summary/retry` | POST | `btc` |
| `/checkins` | POST | `checkin_staff` |
| `/checkins/history` | GET | `checkin_staff` |
| `/checkins/sync` | POST | `checkin_staff` |
| `/auth/refresh` | POST | *(tất cả đã authenticated)* |
| `/auth/logout` | POST | *(tất cả đã authenticated)* |

**Nguyên tắc:** Layer ② chỉ kiểm tra *"role có vào được route không"* — không kiểm tra ownership. Student A gọi `GET /registrations/:id_of_B/qr` qua Layer ② bình thường; Layer ③ mới chặn.

---

## 4. Data Ownership — Layer ③ Behavior

Layer ③ là query-level filter bên trong handler — không phải middleware. Từ góc nhìn caller:

### 4.1 Student xem registrations

```
GET /registrations
→ Chỉ trả registrations có student_id = JWT.sub
→ KHÔNG bao giờ trả registrations của student khác
```

### 4.2 Student lấy QR code

```
GET /registrations/:id

Nếu registrations.student_id = JWT.sub:
  → 200 { qr_code: "..." }

Nếu registrations.student_id ≠ JWT.sub:
  → 404 Not Found  ← (không phải 403, xem §5)
```

### 4.3 Student tạo payment

```
POST /payments { registration_id, payment_key }

Server verify trước: registrations.student_id = JWT.sub AND status='pending'

Nếu không khớp:
  → 403 { "error": "REGISTRATION_NOT_OWNED",
           "message": "Registration này không thuộc về bạn" }
```

### 4.4 Check-in staff xem history

```
GET /checkins/history
→ Chỉ trả checkins có checked_by = JWT.sub
→ Staff A không thấy check-ins của Staff B
```

---

## 5. IDOR Protection — 403 vs 404

Khi Layer ③ từ chối vì resource không thuộc user hiện tại, response cố ý trả **404 Not Found** thay vì 403 Forbidden.

**Lý do:** 403 xác nhận resource tồn tại nhưng user không có quyền — attacker có thể dùng để enumerate valid IDs. 404 không lộ thông tin về sự tồn tại (OWASP IDOR mitigation).

**Áp dụng cho:**

- `GET /registrations/:id` — student cố xem QR của người khác
- `GET /registrations/:id` — bất kỳ access nào không phải owner

**Ngoại lệ — trả 403 (không phải 404):**

- `POST /payments` với `registration_id` của người khác → trả 403 (đây là write action, attacker biết ID từ URL của mình, không phải enumeration)

---

## 6. Frontend Guard Behavior

Frontend guard là **UX protection**, không phải security boundary. API backend luôn enforce đầy đủ kể cả khi frontend bị bypass.

### Admin Web

```
Route /admin/* được bảo vệ bởi AdminGuard:
  - Đọc role từ JWT đã parse trong memory
  - Nếu role ≠ 'btc': redirect về /login
  - Nếu role = 'btc': render AdminLayout

checkin_staff đăng nhập tại cùng /auth/login nhưng role='checkin_staff'
  → AdminGuard redirect về /login
  → checkin_staff dùng mobile app, không phải web admin
```

**Conditional UI theo role (sau khi đã trong admin):**

| UI Element | btc | checkin_staff |
|---|:---:|:---:|
| Menu: Quản lý Workshop | ✓ hiển thị | ✗ ẩn |
| Menu: Thống kê đăng ký | ✓ hiển thị | ✗ ẩn |
| Menu: Quét QR | ✗ ẩn | ✓ hiển thị |
| Nút "Tạo Workshop mới" | ✓ hiển thị | ✗ ẩn |
| Nút "Upload PDF" | ✓ hiển thị | ✗ ẩn |
| Bảng danh sách registrations | ✓ hiển thị | ✗ ẩn |

**Quan trọng:** Ẩn UI không đồng nghĩa với bảo vệ API. Nếu attacker bypass frontend và gọi `POST /admin/workshops` với token `checkin_staff` → Layer ② từ chối 403.

---

## 7. HTTP Contract — 403 Errors

| Tình huống | HTTP | Error code | Lớp phát hiện |
|---|---|---|---|
| Role không có quyền vào route | 403 | `INSUFFICIENT_PERMISSION` | Layer ② |
| Student thanh toán reg của người khác | 403 | `REGISTRATION_NOT_OWNED` | Layer ③ |
| Student xem QR của người khác | 404 | *(không lộ thông tin)* | Layer ③ |

**Response format 403:**

```http
HTTP/1.1 403 Forbidden

{
  "error": "INSUFFICIENT_PERMISSION",
  "required_roles": ["btc"],
  "actual_role": "student"
}
```

---

## 8. Kịch bản lỗi

### E-01: Student gọi admin endpoint

```
POST /admin/workshops với token role='student'
Layer ② check: 'student' ∉ ['btc'] → 403 INSUFFICIENT_PERMISSION
Business logic không chạy.
```

### E-02: BTC cố đăng ký workshop

```
POST /registrations với token role='btc'
Layer ②: 'btc' ∉ ['student'] → 403 INSUFFICIENT_PERMISSION
```

### E-03: Student lấy QR của student khác (IDOR attempt)

```
GET /registrations/{reg_id_of_B}/qr với token student A
Layer ②: 'student' ∈ ['student'] → PASS
Layer ③: WHERE student_id = A → 0 rows → 404 Not Found
Không lộ: (a) resource có tồn tại không, (b) student B là ai
```

### E-04: checkin_staff gọi admin endpoint

```
GET /admin/workshops/:id/registrations với token role='checkin_staff'
Layer ②: 'checkin_staff' ∉ ['btc'] → 403 INSUFFICIENT_PERMISSION
Note: Mobile app không hiển thị UI để gọi endpoint này — UX guard đã ẩn.
      Nhưng nếu attacker dùng curl → vẫn bị từ chối đúng.
```

### E-05: Student thanh toán registration của người khác

```
POST /payments { registration_id: <id_of_B> } với token student A
Layer ②: 'student' ∈ ['student'] → PASS
Layer ③: SELECT WHERE id=:id AND student_id=A → 0 rows
→ 403 { "error": "REGISTRATION_NOT_OWNED" }
Note: Trả 403 (không phải 404) vì đây là write action có explicit error message.
```

### E-06: Attacker gọi API trực tiếp bypass frontend

```
Attacker biết URL /admin/workshops và có token role='student'
→ POST /admin/workshops với valid JWT role='student'
Layer ②: 'student' ∉ ['btc'] → 403
Frontend guard irrelevant — API enforce đúng.
```

---

## 9. Ràng buộc (Invariants)

**INV-01 — Layer Ordering:**
Layer ① (auth) luôn trước Layer ② (RBAC) luôn trước Layer ③ (query filter).
Request không authenticated KHÔNG BAO GIỜ đến Layer ②.

**INV-02 — Layer ③ Là Mandatory, Không Optional:**
Mọi endpoint trả data thuộc về user phải có WHERE scope tại SQL.
Không được fetch toàn bộ bảng rồi filter tại application layer.
Thiếu Layer ③ trên endpoint mới = security bug phải fix trước merge.

**INV-03 — IDOR: 404 Cho GET, 403 Cho Write:**
GET request lên resource không thuộc mình → 404 (không lộ existence).
POST/PATCH write request → 403 với explicit error message.

**INV-04 — Frontend Guard Không Phải Security Boundary:**
Bypass frontend guard (direct API call) phải vẫn bị từ chối đúng bởi Layer ②.
Frontend guard chỉ là UX — không được dùng thay thế API enforcement.

**INV-05 — Role Cứng, Không Runtime-Configurable:**
Permission matrix không thay đổi trong runtime.
Không có "admin đổi permission cho role qua UI" — đây là code-time decision.

**INV-06 — No Real-time Role Revocation (Known Limitation):**
JWT cũ (role đã thay đổi) vẫn có hiệu lực tối đa 15 phút.
Nếu cần immediate revoke → implement `specs/auth-revocation.md`.

---

## 10. Tiêu chí chấp nhận

**AC-01 — Student không vào admin:**
Given: Token role='student', POST /admin/workshops.
Then: 403 `INSUFFICIENT_PERMISSION`. Workshop không được tạo.

**AC-02 — BTC không đăng ký workshop:**
Given: Token role='btc', POST /registrations.
Then: 403 `INSUFFICIENT_PERMISSION`.

**AC-03 — checkin_staff không xem registrations:**
Given: Token role='checkin_staff', GET /admin/workshops/:id/registrations.
Then: 403 `INSUFFICIENT_PERMISSION`.

**AC-04 — Student A không xem QR của Student B (IDOR):**
Given: Token student A, GET /registrations/{reg_id_of_B}/qr.
Then: 404 Not Found (không lộ existence của registration B).

**AC-05 — Student chỉ thấy registrations của mình:**
Given: Student A có 3 registrations. Student B có 5 registrations.
Then: GET /registrations với token A → trả đúng 3, không trả 5 của B.

**AC-06 — Admin web guard:**
Given: Login với role='checkin_staff', navigate đến /admin.
Then: Redirect về /login. Không render bất kỳ admin component nào.

**AC-07 — Conditional UI BTC:**
Given: Login với role='btc' vào web admin.
Then: Menu "Quản lý Workshop" hiển thị. Menu "Quét QR" ẩn.

**AC-08 — Conditional UI checkin_staff trên web:**
Given: checkin_staff access web admin (nếu không bị redirect).
Then: Menu "Quản lý Workshop" ẩn. Menu "Quét QR" hiển thị.

**AC-09 — API enforce khi bypass frontend:**
Given: Attacker gọi POST /admin/workshops với token role='student' (bypass frontend).
Then: 403. Không có side effect trong DB.

**AC-10 — Layer ③ owner check — payment:**
Given: Student A gửi POST /payments với registration_id thuộc Student B.
Then: 403 `REGISTRATION_NOT_OWNED`. Payment không được tạo.
