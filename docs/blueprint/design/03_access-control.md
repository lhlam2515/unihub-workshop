# UniHub Workshop - Thiết kế kiểm soát truy cập

## 1. Mô hình phân quyền

**RBAC (Role-Based Access Control)** với 3 roles cứng, không có role hierarchy, không có attribute-level condition trong phạm vi đồ án. Permission được gắn với role tại deployment time — không lưu trong DB, không thay đổi trong runtime.

> **Quyết định RBAC và so sánh với ABAC:** Xem ADR-05. Tài liệu này mô tả **HOW** ba lớp enforcement kiểm soát truy cập, không phải WHY lựa chọn RBAC.

**Nguồn dữ liệu roles:**

| Role | Bảng nguồn | Cách lấy |
|---|---|---|
| `student` | `students` | Hardcode khi tạo JWT tại `POST /auth/login/student` |
| `btc` | `staff.role` | Đọc từ column `staff.role` tại `POST /auth/login/staff` |
| `checkin_staff` | `staff.role` | Đọc từ column `staff.role` tại `POST /auth/login/staff` |

Cả ba role được nhúng vào JWT payload dưới field `"role"`. Middleware RBAC đọc claim này trực tiếp — không có DB lookup trên mỗi request.

---

## 2. RBAC Permission Matrix

> **Ký hiệu:** ✓ = được phép · — = bị từ chối (403) · ◐ = được phép có điều kiện (xem chú thích)

| Permission | student | btc | checkin_staff |
|---|:---:|:---:|:---:|
| **WORKSHOP — Public** | | | |
| Xem danh sách workshop (`GET /workshops`) | ✓ | ✓ | ✓ |
| Xem chi tiết workshop + AI summary (`GET /workshops/:id`) | ✓ | ✓ | ✓ |
| **WORKSHOP — Student** | | | |
| Đăng ký workshop (`POST /workshops/:id/registrations`) | ✓ | — | — |
| Xem danh sách đăng ký của chính mình (`GET /students/me/registrations`) | ✓ | — | — |
| Xem QR code của chính mình (`GET /registrations/:id/qr`) | ◐¹ | — | — |
| **PAYMENT** | | | |
| Tạo payment cho registration của chính mình (`POST /payments`) | ◐² | — | — |
| **WORKSHOP — Admin** | | | |
| Tạo workshop (`POST /admin/workshops`) | — | ✓ | — |
| Sửa thông tin workshop (`PATCH /admin/workshops/:id`) | — | ✓ | — |
| Thay đổi trạng thái workshop (`PATCH /admin/workshops/:id/status`) | — | ✓ | — |
| Xóa / hủy workshop (`DELETE /admin/workshops/:id`) | — | ✓ | — |
| Xem tất cả registrations của một workshop (`GET /admin/workshops/:id/registrations`) | — | ✓ | — |
| Xem thống kê đăng ký (`GET /admin/workshops/:id/stats`) | — | ✓ | — |
| Upload PDF tài liệu workshop (`POST /admin/workshops/:id/pdf`) | — | ✓ | — |
| Xem trạng thái AI summary (`GET /admin/workshops/:id/summary-status`) | — | ✓ | — |
| Retry AI summary thủ công (`POST /admin/workshops/:id/summary/retry`) | — | ✓ | — |
| **CHECK-IN** | | | |
| Quét QR và ghi nhận check-in (`POST /checkin/scan`) | — | — | ✓ |
| Xem lịch sử check-in đã thực hiện bởi chính mình (`GET /checkin/history`) | — | — | ✓ |
| Sync batch check-in offline (`POST /checkin/sync`) | — | — | ✓ |
| **AUTH** | | | |
| Đăng nhập sinh viên (`POST /auth/login/student`) | public | public | public |
| Đăng nhập staff (`POST /auth/login/staff`) | public | public | public |
| Refresh token (`POST /auth/refresh`) | ✓ | ✓ | ✓ |
| Đăng xuất (`POST /auth/logout`) | ✓ | ✓ | ✓ |

**Chú thích:**

¹ **QR code — student chỉ xem của chính mình:** Route RBAC cho phép role `student` vào endpoint, nhưng query layer phải kiểm tra `registrations.student_id = req.user.id`. Nếu không khớp → 403. Đây là row-level filter, không phải RBAC middleware.

² **Payment — student chỉ thanh toán registration của chính mình:** Tương tự QR: middleware cho phép role `student`, nhưng handler phải verify `registrations.student_id = req.user.id` trước khi tạo payment. Nếu student cố thanh toán registration_id của người khác → 403.

---

## 3. Điểm Enforcement — 3 lớp theo thứ tự lọc từ ngoài vào trong

Hệ thống áp dụng **defense-in-depth theo chiều dọc**: mỗi lớp bắt một loại vi phạm khác nhau. Lớp ngoài lọc sớm nhất để tiết kiệm tài nguyên; lớp trong bảo đảm correctness kể cả khi lớp ngoài có lỗi.

```
Request HTTP
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Lớp ①  JWT Middleware (auth/jwt-verify)                   │
│  Kiểm tra: token hợp lệ? chưa hết hạn?                      │
│  Từ chối: 401 Unauthorized                                  │
│  Pass: gắn req.user = { id, role, email, ... }              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Lớp ②  Route-level RBAC Middleware                        │
│  Kiểm tra: req.user.role ∈ allowed_roles cho route này?     │
│  Từ chối: 403 Forbidden                                     │
│  Pass: tiếp tục vào handler                                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Lớp ③  Query-level Filter (Repository Layer)              │
│  Kiểm tra: SQL WHERE clause scope data xuống đúng owner     │
│  Từ chối: 403 nếu resource không thuộc req.user.id          │
│  Pass: trả về chỉ data thuộc về user đang request           │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.1 Lớp ① — JWT Middleware (áp dụng cho mọi route được bảo vệ)

**Vị trí:** Middleware đầu tiên trong request pipeline, chạy trước RBAC và handler.

**Thuật toán xử lý:**

```
1. Đọc header Authorization: Bearer <token>
   → Nếu không có header → 401 "Missing authentication token"

2. Verify chữ ký JWT bằng public key (RS256)
   → Nếu chữ ký không hợp lệ → 401 "Invalid token signature"

3. Kiểm tra exp claim
   → Nếu token đã hết hạn (exp < now) → 401 "Token expired"
   → Client cần gọi POST /auth/refresh với refresh_token cookie

4. Extract payload: { sub, role, user_type, email, iat, exp }
   → Gắn vào req.user để các middleware sau dùng
   → Không DB lookup tại bước này
```

**JWT Payload Structure:**

```json
{
  "sub": "STU-20210001",
  "role": "student",
  "user_type": "student",
  "email": "alice@university.edu",
  "iat": 1700000000,
  "exp": 1700000900
}
```

```json
{
  "sub": "a1b2c3d4-...",
  "role": "btc",
  "user_type": "staff",
  "email": "btc01@unihub.edu",
  "iat": 1700000000,
  "exp": 1700000900
}
```

**Exceptions — routes không đi qua JWT middleware:**

| Route | Lý do không cần token |
|---|---|
| `POST /auth/login/student` | Endpoint lấy token |
| `POST /auth/login/staff` | Endpoint lấy token |
| `POST /auth/refresh` | Dùng refresh_token cookie, không phải access token |
| `GET /workshops` | Public — sinh viên chưa đăng nhập vẫn xem được lịch |
| `GET /workshops/:id` | Public — xem chi tiết không cần login |

**Lỗi trả về:**

| Tình huống | HTTP | Body |
|---|---|---|
| Không có Bearer token | 401 | `{ "error": "MISSING_TOKEN" }` |
| Chữ ký không hợp lệ | 401 | `{ "error": "INVALID_TOKEN" }` |
| Token hết hạn | 401 | `{ "error": "TOKEN_EXPIRED" }` |

---

### 3.2 Lớp ② — Route-level RBAC Middleware

**Vị trí:** Chạy sau JWT middleware, trước business handler. Mỗi route group khai báo allowed roles.

**Cơ chế:**

```typescript
// Decorator pattern (ví dụ NestJS/Express)
function requireRole(...allowedRoles: Role[]): Middleware {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "INSUFFICIENT_PERMISSION",
        required: allowedRoles,
        actual: req.user.role
      });
    }
    next();
  };
}

// Áp dụng tại route definition:
router.post('/admin/workshops',           requireRole('btc'),           createWorkshop);
router.patch('/admin/workshops/:id',      requireRole('btc'),           updateWorkshop);
router.post('/checkin/scan',             requireRole('checkin_staff'), scanQR);
router.post('/workshops/:id/registrations', requireRole('student'),     registerWorkshop);
```

**Mapping Route → Allowed Roles (exhaustive list):**

| Route | Method | Allowed Roles | Guard |
|---|---|---|---|
| `/workshops` | GET | *(public, no JWT)* | — |
| `/workshops/:id` | GET | *(public, no JWT)* | — |
| `/students/me/registrations` | GET | `student` | requireRole('student') |
| `/registrations/:id/qr` | GET | `student` | requireRole('student') + owner check |
| `/workshops/:id/registrations` | POST | `student` | requireRole('student') |
| `/payments` | POST | `student` | requireRole('student') + owner check |
| `/admin/workshops` | POST | `btc` | requireRole('btc') |
| `/admin/workshops/:id` | PATCH | `btc` | requireRole('btc') |
| `/admin/workshops/:id` | DELETE | `btc` | requireRole('btc') |
| `/admin/workshops/:id/status` | PATCH | `btc` | requireRole('btc') |
| `/admin/workshops/:id/registrations` | GET | `btc` | requireRole('btc') |
| `/admin/workshops/:id/stats` | GET | `btc` | requireRole('btc') |
| `/admin/workshops/:id/pdf` | POST | `btc` | requireRole('btc') |
| `/admin/workshops/:id/summary-status` | GET | `btc` | requireRole('btc') |
| `/admin/workshops/:id/summary/retry` | POST | `btc` | requireRole('btc') |
| `/checkin/scan` | POST | `checkin_staff` | requireRole('checkin_staff') |
| `/checkin/history` | GET | `checkin_staff` | requireRole('checkin_staff') |
| `/checkin/sync` | POST | `checkin_staff` | requireRole('checkin_staff') |
| `/auth/refresh` | POST | *(all authenticated)* | JWT only |
| `/auth/logout` | POST | *(all authenticated)* | JWT only |

**Lỗi trả về:**

| Tình huống | HTTP | Body |
|---|---|---|
| Role không đủ quyền | 403 | `{ "error": "INSUFFICIENT_PERMISSION" }` |

**Boundary của Lớp ②:** Lớp này chỉ kiểm tra *"role có được vào route không"*, KHÔNG kiểm tra *"resource này có thuộc về user không"*. Ví dụ: `requireRole('student')` trên `GET /registrations/:id/qr` chỉ ngăn BTC và checkin_staff gọi endpoint đó — nó không ngăn student A xem QR của student B nếu student A biết registration ID. Đó là nhiệm vụ của Lớp ③.

---

### 3.3 Lớp ③ — Query-level Filter (Repository Layer)

**Vị trí:** Bên trong business handler, tại SQL query construction. Không phải middleware — là một phần của repository/data-access logic.

**Nguyên tắc:** SQL WHERE clause phải scope data xuống đúng owner ngay từ đầu. KHÔNG fetch toàn bộ bảng rồi filter tại application layer.

**Áp dụng cho các trường hợp:**

**① Student xem registrations của mình:**

```sql
-- ĐÚNG: filter tại DB
SELECT r.*, w.title, w.starts_at
FROM registrations r
JOIN workshops w ON r.workshop_id = w.id
WHERE r.student_id = :current_user_id   -- ← scope từ JWT sub claim
ORDER BY r.registered_at DESC;

-- SAI: fetch hết rồi filter
SELECT * FROM registrations;  -- sau đó filter ở code
```

**② Student lấy QR code:**

```sql
SELECT qr_code
FROM registrations
WHERE id = :registration_id
  AND student_id = :current_user_id;   -- ← nếu không match → 0 row → 403
```

**③ Student thanh toán — verify ownership trước khi tạo payment:**

```sql
SELECT id FROM registrations
WHERE id = :registration_id
  AND student_id = :current_user_id
  AND status = 'pending';
-- Nếu 0 row: registration không tồn tại HOẶC không thuộc về user này → 403
```

**④ Check-in staff xem lịch sử của chính mình:**

```sql
SELECT c.*, r.qr_code, s.full_name
FROM checkins c
JOIN registrations r ON c.registration_id = r.id
JOIN students s ON r.student_id = s.student_id
WHERE c.checked_by = :current_staff_id   -- ← scope từ JWT sub claim
ORDER BY c.received_at DESC;
```

**Quy tắc khi thêm endpoint mới:**  
Mỗi endpoint trả về data thuộc về user phải trả lời câu hỏi *"query này có thể trả data của người khác không?"*. Nếu có → bắt buộc thêm WHERE scope. Đây là checklist code review bắt buộc, được kiểm tra cùng với Lớp ② khi review.

---

## 4. Enforcement tại Trang Admin Web

Trang admin được phục vụ bởi web app riêng (hoặc route prefix `/admin` trên cùng app). Cơ chế bảo vệ gồm hai cấp:

### 4.1 Route Guard phía Frontend

Client-side guard kiểm tra `role` từ JWT được lưu trong memory sau login. Nếu user không có role `btc`, frontend redirect về trang login trước khi render bất kỳ component admin nào.

```typescript
// Ví dụ: React Router guard
function AdminGuard({ children }) {
  const { user } = useAuth();          // đọc từ JWT đã parse trong memory
  if (!user || user.role !== 'btc') {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Áp dụng:
<Route path="/admin/*" element={
  <AdminGuard>
    <AdminLayout />
  </AdminGuard>
} />
```

**Quan trọng:** Frontend guard chỉ là UX protection — ngăn user thấy UI không liên quan. Nó KHÔNG phải security boundary. Security boundary thực sự là API backend (Lớp ① và ②). Nếu attacker bypass frontend và gọi API trực tiếp, Lớp ② sẽ từ chối.

### 4.2 Conditional UI Rendering theo Role

Trang admin hiển thị khác nhau tùy role đang đăng nhập:

| UI Element | btc | checkin_staff |
|---|:---:|:---:|
| Menu: Quản lý Workshop | ✓ hiển thị | ✗ ẩn |
| Menu: Thống kê đăng ký | ✓ hiển thị | ✗ ẩn |
| Menu: Quét QR | ✗ ẩn | ✓ hiển thị |
| Nút "Tạo Workshop mới" | ✓ hiển thị | ✗ ẩn |
| Nút "Upload PDF" | ✓ hiển thị | ✗ ẩn |
| Bảng danh sách registrations | ✓ hiển thị | ✗ ẩn |

```typescript
// Conditional render dựa trên role từ JWT:
const { user } = useAuth();
{user.role === 'btc' && <AdminWorkshopMenu />}
{user.role === 'checkin_staff' && <CheckinMenu />}
```

**Lưu ý thiết kế:** `checkin_staff` đăng nhập tại cùng endpoint `POST /auth/login/staff` nhưng nhận JWT với `role: "checkin_staff"`. Trang admin web có thể dùng cho cả hai — routing phân nhánh theo role sau login. Trong thực tế, checkin_staff chủ yếu dùng mobile app.

---

## 5. Enforcement tại Mobile App (checkin_staff)

Mobile app phục vụ duy nhất role `checkin_staff`. Cơ chế đặc biệt vì app phải hoạt động offline (ADR-11).

### 5.1 JWT Verification Offline

Khi mất mạng, mobile app vẫn verify JWT bằng **public key được bundle sẵn** trong app binary (không cần call server để verify):

```
App startup:
  1. Đọc access_token từ secure storage (Android Keystore / iOS Keychain)
  2. Verify chữ ký RS256 bằng public key đã bundle
  3. Kiểm tra exp claim — so sánh với device clock
  4. Nếu hợp lệ: cho phép dùng offline features
  5. Nếu hết hạn: yêu cầu kết nối mạng để refresh
```

**Token lifecycle trên mobile:**

```
Online:
  Login → nhận access_token (15 phút) + refresh_token (7 ngày, secure storage)
  Khi access_token còn < 2 phút → silent refresh qua POST /auth/refresh

Offline:
  Dùng access_token hiện có — verify locally bằng public key bundle
  Nếu access_token đã expire khi vẫn offline → app yêu cầu kết nối
  Nếu online lại trong vòng TTL của refresh_token → silent refresh tự động
```

### 5.2 UI Enable/Disable theo Role từ JWT

Mobile app không có RBAC phức tạp — toàn bộ app chỉ dành cho `checkin_staff`. Nhưng các UI action được enable/disable dựa trên trạng thái token:

| UI State | Điều kiện |
|---|---|
| Nút "Quét QR" — ENABLED | JWT hợp lệ (online hoặc offline với token còn hạn) |
| Nút "Quét QR" — DISABLED (gray) | JWT hết hạn, yêu cầu refresh |
| Nút "Sync" — ENABLED | Có kết nối mạng + JWT hợp lệ |
| Nút "Sync" — DISABLED | Không có mạng |
| Badge "Chờ sync: N records" | Luôn hiển thị nếu có records offline chưa sync |

```typescript
// Ví dụ logic enable/disable:
const { token, isExpired } = useJWT();
const { isOnline } = useNetwork();

<ScanButton
  disabled={isExpired}
  onPress={handleScan}
/>

<SyncButton
  disabled={!isOnline || isExpired}
  onPress={handleSync}
/>
```

**Không nhúng permissions phức tạp vào JWT cho mobile:** Vì mobile chỉ serve một role (`checkin_staff`), không cần encode permission list. Flag enable/disable chỉ phụ thuộc vào token validity và network state. Role `btc` không bao giờ dùng mobile app để quản lý — họ dùng web admin.

### 5.3 Server-side Enforcement vẫn là source of truth

Khi mobile sync batch check-in lên server (`POST /checkin/sync`), server thực hiện đầy đủ 3 lớp enforcement:

```
Lớp ①: Verify JWT trong Authorization header
Lớp ②: requireRole('checkin_staff')
Lớp ③: Mỗi checkin record trong batch phải có registration_id hợp lệ
         → server verify từng record trước khi INSERT
         → INSERT với ON CONFLICT (registration_id) DO NOTHING
           (first-check-in-wins, xem ADR-02)
```

Mobile app offline chỉ tin tưởng local data tạm thời — server là nơi enforce business rules cuối cùng.

---

## 6. Kịch bản Lỗi và Xử lý

| Kịch bản | Lớp phát hiện | HTTP Code | Hành vi client |
|---|---|---|---|
| Không gửi token | ① | 401 | Redirect đến login |
| Token hết hạn | ① | 401 `TOKEN_EXPIRED` | Silent refresh; nếu refresh fail → redirect login |
| Token bị giả mạo chữ ký | ① | 401 `INVALID_TOKEN` | Redirect đến login, xóa local token |
| Student gọi endpoint BTC | ② | 403 `INSUFFICIENT_PERMISSION` | Hiển thị "Bạn không có quyền truy cập" |
| Student lấy QR của người khác | ③ | 403 | API trả 403 như không tìm thấy (không lộ sự tồn tại) |
| Student thanh toán registration người khác | ③ | 403 | "Registration không thuộc về bạn" |
| checkin_staff gọi admin endpoint | ② | 403 | App không cho phép — UI đã ẩn button |
| Token hết hạn khi mobile offline | Local verify | — | Disable nút Quét, badge "Cần kết nối để làm mới phiên" |

**Về information disclosure:** Khi Lớp ③ từ chối (student cố xem data của người khác), response trả `404 Not Found` thay vì `403 Forbidden` để tránh lộ sự tồn tại của resource. Đây là security best practice (OWASP IDOR).

---

## 7. Ràng buộc và Giới hạn đã biết

**Không có real-time role revocation:** JWT TTL 15 phút. Nếu admin hạ quyền một tài khoản staff (ví dụ: `btc` → `checkin_staff`), JWT cũ vẫn có role `btc` cho đến khi hết hạn. Window tối đa là 15 phút — chấp nhận được với TTL ngắn. Nếu yêu cầu immediate revoke: cần token blacklist trong Redis, pointer đến `specs/auth-revocation.md` (Stage 5).

**BTC không có attribute-level ownership check:** Bất kỳ BTC nào đều có thể sửa workshop của BTC khác. Chấp nhận được vì đồ án không có multi-BTC competition — toàn bộ BTC là internal trusted users. Schema đã có `workshops.created_by` để mở rộng ABAC check sau nếu cần, chỉ cần thêm WHERE clause tại Lớp ③.

**IP-based rate limiting và RBAC không liên kết:** Rate Limiting (ADR-06) là cơ chế song song, không phải một lớp của RBAC. Rate limit chạy trước JWT middleware để bảo vệ cả unauthenticated endpoints. Hai hệ thống độc lập và không chia sẻ state.

**Mobile app không enforce RBAC phía client:** Enforcement thực sự là server. Nếu một checkin_staff tìm cách gọi admin API từ công cụ ngoài app → Lớp ① và ② từ chối ngay. App chỉ cung cấp UI đúng cho role đúng.

---
