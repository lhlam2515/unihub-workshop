# UniHub Workshop — Phân rã Chức năng Hệ thống

**Phiên bản:** 1.0 | **Ngày:** 2026-04-27  
**Phương pháp:** Business Process → System Function Transformation (ISO/IEC/IEEE 29148)  
**Nguồn đầu vào:** Architecture Design, Storage Strategy, Safety Mechanisms, ADR, User Journeys (4 Actors)

---

## Lịch sử thay đổi

| Phiên bản | Ngày | Mô tả | Tác giả |
|-----------|------|-------|---------|
| 1.0 | 2026-04-27 | Phiên bản khởi tạo — phân rã từ 4 User Journeys | UniHub Team |

---

## Mục lục

1. [System Overview](#1-system-overview)
2. [Actor Mapping](#2-actor-mapping)
3. [Functional Requirements theo Module](#3-functional-requirements-theo-module)
   - F01: Identity & Access Management
   - F02: Workshop Management
   - F03: Content & AI Pipeline
   - F04: Registration & Seat Management
   - F05: Payment Processing
   - F06: Ticket & QR Code
   - F07: Check-in (Online & Offline)
   - F08: Notification
   - F09: Student Data Synchronization
   - F10: Background Jobs & System Maintenance
4. [Business Rules](#4-business-rules)
5. [Ma trận Truy xuất Nguồn gốc (Traceability Matrix)](#5-traceability-matrix)
6. [Analysis Report](#6-analysis-report)

---

## 1. System Overview

```
Scope:
  Hệ thống quản lý toàn bộ vòng đời của Workshop trường đại học — từ tạo sự kiện,
  đăng ký, thanh toán, check-in ngoại tuyến, cho đến đồng bộ dữ liệu sinh viên.

System Boundary (IN-scope):
  - Xác thực & phân quyền người dùng (RBAC + Dual-Token)
  - Quản lý danh mục Workshop (CRUD, publish, cancel, đổi phòng/giờ)
  - Upload tài liệu PDF và sinh tóm tắt AI
  - Đăng ký và giữ chỗ (với Rate Limiting và chống Race Condition)
  - Thanh toán qua cổng bên ngoài (với Circuit Breaker và Idempotency)
  - Phát hành vé điện tử (QR Token)
  - Điểm danh Online & Offline-First (Mobile App)
  - Đồng bộ hàng loạt dữ liệu sinh viên từ CSV
  - Gửi thông báo qua nhiều kênh (Email, App, Telegram)
  - Các tiến trình nền (Background Jobs): reconciliation, timeout, circuit monitor

System Boundary (OUT-of-scope):
  - Nghiệp vụ tài chính nội bộ sau khi thanh toán (kế toán, quyết toán trường)
  - Cổng thanh toán bên ngoài (VNPay, Stripe, MoMo) — tích hợp dạng Adapter
  - Hệ thống quản lý sinh viên của trường — chỉ nhận dữ liệu qua file CSV xuất ra
  - SMTP Server / Telegram Bot — tích hợp qua API

Assumptions (Các giả định định hình kiến trúc):
  [A-01] Mỗi sinh viên có đúng 1 tài khoản UniHub, liên kết với 1 student profile từ CSV.
  [A-02] Ban tổ chức (ORGANIZER) là nhân viên/cán bộ trường, không phải sinh viên.
  [A-03] Môi trường hội trường có wifi không ổn định — Mobile App PHẢI hoạt động Offline-First.
  [A-04] Lượng truy cập dồn dập (12.000 CCU) — Hệ thống PHẢI có Rate Limiting và Redis DECR.
  [A-05] Workshop chỉ có 2 hình thức: miễn phí (is_paid = FALSE) và có phí (is_paid = TRUE, price > 0).
  [A-06] Một đơn đăng ký hợp lệ chỉ sinh ra đúng 1 vé (1:1 Registration → Ticket).

Gaps Detected:
  [GAP-01] Chưa rõ quy trình hoàn tiền (Refund) khi Organizer hủy workshop sau khi sinh viên đã thanh toán.
  [GAP-02] Chưa định nghĩa danh sách chờ (Waitlist) — khi hết chỗ, sinh viên có được xếp vào queue không?
  [GAP-03] Chưa rõ logic "đổi phòng/giờ" có cho phép khi workshop đã có người đăng ký hay không,
           và các ràng buộc tương ứng.
  [GAP-04] Chưa rõ cơ chế HALF-OPEN test trong Circuit Breaker: bao nhiêu request test, ai phát sinh?
  [GAP-05] Student tự hủy Registration — có được hoàn tiền không? Trong thời hạn nào?

Scope Boundaries & Resolved Gaps (Các ranh giới đã được chốt):
  [B-01] Đổi phòng/giờ khẩn cấp: ĐƯỢC PHÉP thực hiện khi Workshop đã PUBLISHED. Hệ thống chỉ xử lý cập nhật dữ liệu nội bộ và "phát thanh" (Broadcast) thông báo qua Message Queue, KHÔNG giải quyết bài toán xếp thời khóa biểu toàn trường.
  [B-02] Hoàn tiền (Refund): NẰM NGOÀI PHẠM VI (Out-of-scope). Hệ thống không gọi API Refund sang Payment Gateway. Việc hoàn tiền do Ban tổ chức xử lý thủ công ngoài hệ thống.
  [B-03] Danh sách chờ (Waitlist): NẰM NGOÀI PHẠM VI. Áp dụng nguyên lý "First-come, first-served". Ghế trống do hủy đăng ký sẽ tự động nhả lại lên Redis để người đến sau tự đăng ký.
  [B-04] Circuit Breaker HALF-OPEN: Hệ thống KHÔNG dùng Job ngầm. Sử dụng request thực tế đầu tiên sau thời gian cool-down làm "Canary Request" để đo lường.
```

---

## 2. Actor Mapping

| Business Actor | System Role (ENUM) | Quyền hạn chính | Phạm vi |
|---|---|---|---|
| Sinh viên | `STUDENT` | Xem workshop, đăng ký, thanh toán, xem vé, xem lịch sử | Chỉ trên tài nguyên của chính mình (`WHERE student_id = jwt.sub`) |
| Ban tổ chức | `ORGANIZER` | CRUD Workshop, Upload PDF, Publish, Hủy, Quản lý nhân sự, kích hoạt CSV Sync, xem thống kê | Toàn bộ Workshop (không giới hạn theo scope) |
| Nhân sự điểm danh | `CHECKIN_STAFF` | Quét QR, đồng bộ offline | Chỉ trong `allowed_workshop_ids` được nhúng trong JWT |
| Hệ thống (Jobs) | `SYSTEM` | Reconciliation, Payment Timeout, Notification Dispatch, CSV Import, Circuit Monitor | Toàn hệ thống — không qua HTTP user-facing |

---

## 3. Functional Requirements theo Module

> **Quy ước ID:** `FR-F{module}-{seq}` — ví dụ `FR-F01-001` là FR đầu tiên của Module 01.  
> **Phân loại:** `HUMAN` | `SYSTEM-SUPPORTED` | `FULLY AUTOMATED`  
> **Ưu tiên:** `MUST` | `SHOULD` | `COULD` | `WON'T` (MoSCoW)

---

### MODULE F01 — Identity & Access Management (IAM)

**Mục tiêu module:** Xác thực danh tính, cấp phát token, bảo vệ tài nguyên theo vai trò và phạm vi, thu hồi khẩn cấp.

---

#### FR-F01-001 — Xác thực người dùng (Login)

```
ID:             FR-F01-001
Name:           Authenticate User
Description:    Hệ thống SHALL xác thực người dùng bằng email và mật khẩu (bcrypt hash).
                Nếu hợp lệ, hệ thống sinh cặp Dual-Token (Access Token + Refresh Token)
                phù hợp với nền tảng gọi (Web hoặc Mobile).
Classification: SYSTEM-SUPPORTED
Actor:          Student, Organizer, CheckinStaff
Trigger:        Người dùng gửi POST /auth/login với {email, password, platform}
Inputs:         email: String, password: String (plaintext), platform: Enum(WEB | MOBILE)
Outputs:        accessToken: JWT (trả về body),
                refreshToken: JWT
                  - WEB: Set-Cookie HttpOnly Secure SameSite=Strict
                  - MOBILE: trả về body để app lưu vào Keychain
Business Rules: BR-001, BR-002
Acceptance Criteria:
  Given email và password hợp lệ, platform = WEB
  When POST /auth/login
  Then HTTP 200, body chứa accessToken (exp: 15 phút),
       Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict (exp: 7 ngày)

  Given email không tồn tại hoặc sai mật khẩu
  When POST /auth/login
  Then HTTP 401, body: { error: "INVALID_CREDENTIALS" }
       Không tiết lộ email hay password cái nào sai (chống enumeration)

  Given platform = MOBILE
  When POST /auth/login
  Then Access Token exp = 8 giờ, Refresh Token trả về body (không Set-Cookie)
Priority:       MUST
```

---

#### FR-F01-002 — Cấp JWT với payload chuẩn theo Role

```
ID:             FR-F01-002
Name:           Issue Role-scoped JWT
Description:    Hệ thống SHALL nhúng các claim sau vào Access Token:
                sub (user_id), role (user_role), jti (UUID duy nhất cho blacklist).
                Với role = CHECKIN_STAFF: SHALL nhúng thêm allowed_workshop_ids: UUID[].
Classification: FULLY AUTOMATED
Actor:          System (triggered by FR-F01-001)
Trigger:        Sau khi xác thực thành công
Inputs:         user record từ DB (user_id, role, student_id nếu có)
                allowed_workshop_ids (query từ assignment table, nếu role = CHECKIN_STAFF)
Outputs:        Access Token JWT với claims đầy đủ
Business Rules: BR-001, BR-003
Acceptance Criteria:
  Given user có role = CHECKIN_STAFF được phân công workshop [wid-A, wid-B]
  When JWT được sinh ra
  Then payload.allowed_workshop_ids = ["wid-A", "wid-B"]
  And payload.role = "CHECKIN_STAFF"

  Given user có role = STUDENT
  When JWT được sinh ra
  Then payload không chứa allowed_workshop_ids
Priority:       MUST
```

---

#### FR-F01-003 — Silent Token Refresh với Mutex (Web)

```
ID:             FR-F01-003
Name:           Refresh Access Token with Mutex Lock
Description:    Khi Access Token hết hạn (HTTP 401), Frontend Web SHALL áp dụng
                Mutex Lock để chỉ duy nhất 1 request gọi POST /auth/refresh.
                Các request khác bị block trong queue và tự tiếp tục với token mới
                sau khi refresh thành công.
Classification: SYSTEM-SUPPORTED (Frontend logic + Backend endpoint)
Actor:          Student, Organizer (Web Portal)
Trigger:        Nhận HTTP 401 Unauthorized từ bất kỳ API nào
Inputs:         refreshToken (từ HttpOnly Cookie, gửi tự động)
Outputs:        accessToken mới (in-memory, 15 phút),
                refreshToken mới (xoay vòng — Refresh Token Rotation)
Business Rules: BR-001, BR-002
Acceptance Criteria:
  Given 3 API calls đồng thời gặp 401
  When tất cả cùng trigger refresh
  Then chỉ 1 POST /auth/refresh được gửi đến server
  And 2 request còn lại được queue
  And sau khi nhận token mới, cả 3 request được gửi lại với Authorization header mới

  Given refreshToken đã hết hạn hoặc bị blacklist
  When POST /auth/refresh
  Then HTTP 401, frontend xóa token khỏi memory và redirect về /login
Priority:       MUST
```

---

#### FR-F01-004 — Xác thực JWT & Kiểm tra Blacklist

```
ID:             FR-F01-004
Name:           Validate JWT and Check Blacklist
Description:    Middleware SHALL xác thực chữ ký JWT, kiểm tra exp chưa hết hạn,
                và tra cứu Redis key "token:blacklist:{jti}". Nếu key tồn tại,
                SHALL từ chối request ngay lập tức (HTTP 401).
Classification: FULLY AUTOMATED
Actor:          System (mọi request có Authorization header)
Trigger:        Mọi API request cần xác thực
Inputs:         Authorization: Bearer {accessToken}
Outputs:        Tiếp tục xử lý hoặc HTTP 401
Business Rules: BR-001, BR-004
Acceptance Criteria:
  Given jti của token tồn tại trong Redis blacklist
  When request đến bất kỳ protected endpoint nào
  Then HTTP 401, body: { error: "TOKEN_REVOKED" }
  And lookup thực hiện trong < 2ms (Redis in-memory)

  Given token hợp lệ, chưa hết hạn, không trong blacklist
  When request đến
  Then middleware decode và đính kèm user context, tiếp tục xử lý
Priority:       MUST
```

---

#### FR-F01-005 — Kiểm tra phân quyền theo Role (RBAC)

```
ID:             FR-F01-005
Name:           Enforce Role-Based Authorization
Description:    Sau khi xác thực, hệ thống SHALL kiểm tra jwt.role có khớp với
                permission yêu cầu của endpoint. Nếu không khớp, trả HTTP 403.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        Sau FR-F01-004 thành công
Inputs:         jwt.role, required_role của endpoint
Outputs:        Tiếp tục hoặc HTTP 403 Forbidden
Business Rules: BR-003
Acceptance Criteria:
  Given jwt.role = STUDENT truy cập POST /admin/workshops
  When authorization check
  Then HTTP 403, body: { error: "INSUFFICIENT_PERMISSIONS" }
Priority:       MUST
```

---

#### FR-F01-006 — Kiểm tra phạm vi Workshop cho Check-in Staff

```
ID:             FR-F01-006
Name:           Enforce Workshop Scope for CheckinStaff
Description:    Tại các endpoint check-in, hệ thống SHALL kiểm tra workshop_id
                trong request CÓ nằm trong jwt.allowed_workshop_ids không.
                Nếu không, trả HTTP 403.
Classification: FULLY AUTOMATED
Actor:          System, CheckinStaff
Trigger:        CheckinStaff gọi bất kỳ API check-in nào
Inputs:         workshop_id từ request, allowed_workshop_ids từ JWT
Outputs:        Tiếp tục hoặc HTTP 403
Business Rules: BR-003, BR-005
Acceptance Criteria:
  Given jwt.allowed_workshop_ids = ["wid-A"] và request.workshop_id = "wid-B"
  When validate scope
  Then HTTP 403, body: { error: "WORKSHOP_NOT_IN_SCOPE" }
Priority:       MUST
```

---

#### FR-F01-007 — Ngăn chặn IDOR

```
ID:             FR-F01-007
Name:           Prevent Insecure Direct Object Reference (IDOR)
Description:    Mọi query dữ liệu cá nhân của STUDENT SHALL bắt buộc thêm
                điều kiện WHERE student_id = {jwt.sub} vào SQL.
                Backend không tin vào student_id trong URL/body nếu role = STUDENT.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        STUDENT truy cập tài nguyên cá nhân (registrations, tickets, payments)
Inputs:         jwt.sub (student_id đã xác thực)
Outputs:        Chỉ trả dữ liệu của chính sinh viên đó
Business Rules: BR-006
Acceptance Criteria:
  Given Student A (jwt.sub = "sid-A") gọi GET /registrations?student_id=sid-B
  When query chạy
  Then kết quả chỉ chứa registrations của sid-A (tham số bị bỏ qua)
Priority:       MUST
```

---

#### FR-F01-008 — Thu hồi Token khẩn cấp (Blacklist)

```
ID:             FR-F01-008
Name:           Revoke Access Token via Redis Blacklist
Description:    Organizer hoặc System SHALL thêm jti vào Redis key
                "token:blacklist:{jti}" với TTL = thời gian còn lại của JWT
                để vô hiệu hóa ngay lập tức một Access Token đang còn hạn.
Classification: SYSTEM-SUPPORTED
Actor:          Organizer (kích hoạt qua Admin UI)
Trigger:        Organizer khóa tài khoản nhân sự hoặc nhận báo cáo mất thiết bị
Inputs:         user_id hoặc jti của token cần thu hồi
Outputs:        Redis key được tạo; mọi request từ jti đó bị chặn ngay lập tức
Business Rules: BR-004
Acceptance Criteria:
  Given Organizer POST /admin/users/{uid}/revoke-token
  When hệ thống xử lý
  Then Redis SET token:blacklist:{jti} "revoked" EX {remaining_seconds}
  And request tiếp theo của user đó trả HTTP 401 trong < 2ms
Priority:       MUST
```

---

### MODULE F02 — Workshop Management

**Mục tiêu module:** Quản lý toàn bộ vòng đời của Workshop từ DRAFT đến COMPLETED/CANCELLED.

---

#### FR-F02-001 — Tạo Workshop

```
ID:             FR-F02-001
Name:           Create Workshop
Description:    Hệ thống SHALL cho phép ORGANIZER tạo một Workshop mới ở trạng thái
                DRAFT với đầy đủ thông tin bắt buộc. Hệ thống SHALL tạo đồng thời
                bản ghi WorkshopSlot với total_capacity tương ứng.
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /organizer/workshops
Inputs:         title, description, speaker_id, room_id, starts_at, ends_at,
                capacity, is_paid, price (bắt buộc nếu is_paid=TRUE)
Outputs:        Workshop record (status=DRAFT), WorkshopSlot record,
                HTTP 201 với workshop_id
Business Rules: BR-007, BR-008, BR-009
Acceptance Criteria:
  Given Organizer gửi request với is_paid=TRUE và price=NULL
  When tạo workshop
  Then HTTP 422, body: { error: "PRICE_REQUIRED_FOR_PAID_WORKSHOP" }

  Given tất cả fields hợp lệ, ends_at > starts_at
  When tạo workshop
  Then Workshop được tạo với status=DRAFT
  And WorkshopSlot.total_capacity = request.capacity
  And Redis key seat:available:{workshop_id} CHƯA được khởi tạo (chỉ khởi tạo khi Publish)
Priority:       MUST
```

---

#### FR-F02-002 — Kiểm tra xung đột phòng họp

```
ID:             FR-F02-002
Name:           Detect Room Scheduling Conflict
Description:    Khi tạo hoặc cập nhật Workshop (đổi phòng/giờ), hệ thống SHALL
                kiểm tra xem room_id đã có Workshop PUBLISHED nào khác trong
                khoảng thời gian [starts_at, ends_at] chưa. Nếu có, từ chối.
Classification: FULLY AUTOMATED
Actor:          System (triggered by FR-F02-001, FR-F02-005)
Trigger:        Tạo mới hoặc cập nhật Workshop với room_id và time slot
Inputs:         room_id, starts_at, ends_at, workshop_id (khi update)
Outputs:        Cho phép tiếp tục hoặc HTTP 409 Conflict
Business Rules: BR-010
Acceptance Criteria:
  Given Phòng B2-01 đã có Workshop PUBLISHED từ 8:00–10:00 ngày 01/05
  When Organizer tạo Workshop mới cùng phòng từ 9:00–11:00
  Then HTTP 409, body: { error: "ROOM_CONFLICT", conflicting_workshop_id: "..." }
Priority:       MUST
```

---

#### FR-F02-003 — Publish Workshop

```
ID:             FR-F02-003
Name:           Publish Workshop
Description:    Hệ thống SHALL chuyển Workshop từ DRAFT sang PUBLISHED.
                Đồng thời, hệ thống SHALL khởi tạo bộ đếm Redis:
                SET seat:available:{workshop_id} {total_capacity}
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /organizer/workshops/{id}/publish
Inputs:         workshop_id
Outputs:        Workshop.status = PUBLISHED,
                Redis key seat:available:{workshop_id} = {total_capacity}
Business Rules: BR-011
Acceptance Criteria:
  Given Workshop ở trạng thái DRAFT với capacity = 100
  When Organizer publish
  Then Workshop.status = PUBLISHED
  And Redis: GET seat:available:{id} = "100"
  And Workshop xuất hiện trong danh sách của Student

  Given Workshop đã ở trạng thái PUBLISHED hoặc CANCELLED
  When Organizer cố publish lại
  Then HTTP 409, body: { error: "INVALID_STATUS_TRANSITION" }
Priority:       MUST
```

---

#### FR-F02-004 — Hủy Workshop

```
ID:             FR-F02-004
Name:           Cancel Workshop
Description:    Hệ thống SHALL cho phép ORGANIZER hủy Workshop PUBLISHED hoặc DRAFT.
                Khi hủy: (1) Chuyển status = CANCELLED, (2) VOID tất cả Ticket ACTIVE,
                (3) Huỷ tất cả Registration CONFIRMED/PENDING_PAYMENT,
                (4) Đẩy event vào Message Queue để gửi thông báo cho sinh viên đã đăng ký.
                [ASSUMED] Hoàn tiền cho các đơn CONFIRMED có phí cần xử lý thủ công
                hoặc qua quy trình riêng (GAP-01 chưa được định nghĩa).
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /organizer/workshops/{id}/cancel
Inputs:         workshop_id, cancellation_reason (optional)
Outputs:        Workshop.status = CANCELLED,
                Tất cả Ticket.status = VOID,
                Tất cả Registration.status = CANCELLED,
                Event WORKSHOP_CANCELLED trong Message Queue
Business Rules: BR-012
Acceptance Criteria:
  Given Workshop có 50 đăng ký CONFIRMED và 10 PENDING_PAYMENT
  When Organizer hủy workshop
  Then Workshop.status = CANCELLED
  And 50 Ticket chuyển sang VOID
  And 60 Registration chuyển sang CANCELLED
  And 60 sự kiện WORKSHOP_CANCELLED được đẩy vào Queue
  And Redis key seat:available:{id} bị DEL hoặc set về 0
Priority:       MUST
```

---

#### FR-F02-005 — Cập nhật phòng / giờ

```
ID:             FR-F02-005
Name:           Update Workshop Room or Schedule (Published)
Description:    Hệ thống SHALL cho phép ORGANIZER cập nhật room_id, starts_at, hoặc
                ends_at của một Workshop đã PUBLISHED để xử lý sự cố. 
                Hệ thống SHALL kiểm tra xung đột phòng nội bộ (FR-F02-002) trước khi lưu. 
                Sau khi lưu thành công DB, hệ thống SHALL đẩy event WORKSHOP_UPDATED 
                vào Message Queue và trả kết quả HTTP 200 ngay lập tức.
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        PATCH /organizer/workshops/{id}/emergency-update
Inputs:         room_id (optional), starts_at (optional), ends_at (optional)
Outputs:        Workshop record cập nhật, event WORKSHOP_UPDATED trong Queue
Business Rules: BR-010
Acceptance Criteria:
  Given Organizer đổi phòng từ B2-01 sang B2-02 (không xung đột nội bộ)
  When PATCH request
  Then Workshop.room_id cập nhật thành công
  And API trả về HTTP 200 OK trong < 300ms
  And 1 event WORKSHOP_UPDATED được đẩy vào Queue
  And Notification Worker chạy ngầm, truy xuất danh sách sinh viên đã CONFIRMED 
      để gửi thông báo (Email/App Push) mà không làm treo giao diện Admin.
Priority:       MUST
```

---

#### FR-F02-006 — Duyệt danh sách Workshop (Student)

```
ID:             FR-F02-006
Name:           List Published Workshops
Description:    Hệ thống SHALL trả về danh sách Workshop có status = PUBLISHED,
                kèm thông tin Speaker, Room, và số chỗ còn lại đọc từ Redis
                (seat:available:{workshop_id}). Hỗ trợ phân trang và lọc cơ bản.
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        GET /workshops?page=&limit=&faculty=&date=
Inputs:         Tham số lọc: faculty, date_from, date_to, is_paid
Outputs:        Danh sách workshop với available_seats (từ Redis)
Business Rules: BR-013
Acceptance Criteria:
  Given 5 Workshop PUBLISHED, 2 Workshop DRAFT
  When Student gọi GET /workshops
  Then chỉ 5 Workshop PUBLISHED được trả về
  And available_seats phản ánh giá trị Redis thời điểm hiện tại
Priority:       MUST
```

---

#### FR-F02-007 — Xem chi tiết Workshop

```
ID:             FR-F02-007
Name:           View Workshop Detail
Description:    Hệ thống SHALL trả về chi tiết đầy đủ của một Workshop PUBLISHED,
                bao gồm: thông tin Workshop, Speaker, Room (kèm floor_plan_url),
                AI Summary (nếu có, status=DONE), số chỗ còn lại (từ Redis).
Classification: SYSTEM-SUPPORTED
Actor:          Student, Organizer, CheckinStaff
Trigger:        GET /workshops/{id}
Inputs:         workshop_id
Outputs:        Workshop detail object với available_seats và ai_summary
Business Rules: BR-013
Acceptance Criteria:
  Given Workshop có AI Summary status = DONE
  When GET /workshops/{id}
  Then response chứa ai_summary.summary_text
  And available_seats = LGET seat:available:{id} từ Redis (không phải từ PostgreSQL)
Priority:       MUST
```

---

### MODULE F03 — Content & AI Pipeline

**Mục tiêu module:** Upload tài liệu, xử lý tóm tắt AI theo kiến trúc Pipe-and-Filter.

---

#### FR-F03-001 — Upload tài liệu Workshop

```
ID:             FR-F03-001
Name:           Upload Workshop Document to Object Storage
Description:    Hệ thống SHALL cho phép ORGANIZER upload file PDF cho Workshop.
                File SHALL được lưu vào Object Storage (S3/MinIO). Chỉ URL được
                lưu vào bảng workshop_documents (không lưu binary vào PostgreSQL).
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /organizer/workshops/{id}/documents (multipart/form-data)
Inputs:         file: PDF, workshop_id
Outputs:        workshop_documents record với file_url, upload_status = UPLOADED
Business Rules: BR-014
Acceptance Criteria:
  Given Organizer upload file PDF hợp lệ < 50MB
  When upload hoàn tất
  Then file được lưu vào Object Storage
  And workshop_documents record tạo với upload_status = UPLOADED
  And file_url trả về response

  Given file upload không phải PDF
  When upload
  Then HTTP 415 Unsupported Media Type
Priority:       MUST
```

---

#### FR-F03-002 — Kích hoạt AI Summary Pipeline

```
ID:             FR-F03-002
Name:           Trigger AI Summary Generation
Description:    Sau khi upload thành công (FR-F03-001), hệ thống SHALL tự động
                đẩy một job vào Async Queue để xử lý tóm tắt AI.
                [ASSUMED] Pipeline gồm 3 bước tuần tự theo Pipe-and-Filter:
                Extract Text → Clean Text → Generate Summary.
Classification: FULLY AUTOMATED
Actor:          System (triggered by document upload event)
Trigger:        Document upload_status chuyển sang UPLOADED
Inputs:         document_id, file_url
Outputs:        ai_summaries record với status = PENDING → PROCESSING → DONE/FAILED
Business Rules: BR-015
Acceptance Criteria:
  Given document upload_status = UPLOADED
  When AI pipeline job được dequeue
  Then ai_summaries.status = PROCESSING trong quá trình xử lý
  And ai_summaries.status = DONE với summary_text đã điền nếu thành công
  And ai_summaries.status = FAILED với error_message nếu lỗi

  Given tài liệu xử lý thành công
  When Student xem chi tiết Workshop
  Then summary_text hiển thị trên trang
Priority:       SHOULD
```

---

### MODULE F04 — Registration & Seat Management

**Mục tiêu module:** Luồng đăng ký, kiểm soát tải, chống Race Condition, quản lý vòng đời Registration.

---

#### FR-F04-001 — Kiểm tra Rate Limit (Token Bucket)

```
ID:             FR-F04-001
Name:           Enforce Registration Rate Limit via Token Bucket
Description:    Trước khi xử lý đăng ký, API Gateway SHALL kiểm tra Token Bucket
                của user ("ratelimit:register:{user_id}" trên Redis).
                Nếu xô rỗng (tokens = 0), SHALL từ chối ngay với HTTP 429.
                Nếu còn token, lấy 1 token và tiếp tục.
Classification: FULLY AUTOMATED
Actor:          System (API Gateway)
Trigger:        POST /registrations được nhận
Inputs:         jwt.sub (user_id)
Outputs:        Tiếp tục xử lý hoặc HTTP 429 Too Many Requests
Business Rules: BR-016, BR-017
Acceptance Criteria:
  Given Student đã gửi 5 request trong 10 giây (hết bucket)
  When gửi request thứ 6
  Then HTTP 429, body: { error: "RATE_LIMIT_EXCEEDED", retry_after: 10 }
  And Frontend vô hiệu hóa nút "Đăng ký" trong 2–3 giây

  Given Student có 3 tokens trong bucket
  When gửi 1 request
  Then tokens giảm về 2, request tiếp tục xử lý
Priority:       MUST
```

---

#### FR-F04-002 — Trừ ghế nguyên tử trên Redis (Atomic Seat Decrement)

```
ID:             FR-F04-002
Name:           Atomically Decrement Available Seat Counter
Description:    Hệ thống SHALL thực thi lệnh DECR nguyên tử trên Redis key
                "seat:available:{workshop_id}". Nếu kết quả trả về < 0,
                hệ thống SHALL thực thi INCR để hoàn lại và báo hết chỗ.
                Chỉ request nhận được giá trị DECR >= 0 mới được tiếp tục tạo Registration.
Classification: FULLY AUTOMATED
Actor:          System (Business Logic Layer)
Trigger:        Sau FR-F04-001 thành công
Inputs:         workshop_id
Outputs:        Kết quả DECR (số ghế còn lại sau khi trừ), hoặc báo Sold Out
Business Rules: BR-018
Acceptance Criteria:
  Given seat:available:{id} = 1 và 2 request đến đồng thời
  When cả 2 thực thi DECR
  Then 1 request nhận kết quả 0 (thành công), 1 request nhận -1 → INCR lại → báo Sold Out
  And không xảy ra overselling

  Given seat:available:{id} = 0
  When Student cố đăng ký
  Then HTTP 409, body: { error: "WORKSHOP_FULL" }
Priority:       MUST
```

---

#### FR-F04-003 — Tạo Registration (Workshop miễn phí)

```
ID:             FR-F04-003
Name:           Create Registration for Free Workshop
Description:    Với Workshop is_paid = FALSE, sau khi DECR Redis thành công,
                hệ thống SHALL tạo Registration với status = CONFIRMED ngay lập tức.
                Sau đó kích hoạt FR-F06-001 (phát hành Ticket) và đẩy event
                REGISTRATION_CONFIRMED vào Message Queue.
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        POST /registrations với workshop_id thuộc workshop miễn phí
Inputs:         student_id (từ JWT), workshop_id
Outputs:        Registration (status=CONFIRMED), Ticket (status=ACTIVE),
                Event REGISTRATION_CONFIRMED trong Queue
Business Rules: BR-018, BR-019, BR-020
Acceptance Criteria:
  Given Workshop miễn phí còn chỗ
  When Student POST /registrations
  Then Registration.status = CONFIRMED
  And Ticket được phát hành với qr_token duy nhất
  And HTTP 201 trả về registration_id và ticket_id

  Given Student đã có Registration cho Workshop này (bất kỳ status nào trừ CANCELLED)
  When Student cố đăng ký lại
  Then HTTP 409, body: { error: "ALREADY_REGISTERED" }
Priority:       MUST
```

---

#### FR-F04-004 — Tạo Registration với giữ chỗ (Workshop có phí)

```
ID:             FR-F04-004
Name:           Create Registration with Seat Lock for Paid Workshop
Description:    Với Workshop is_paid = TRUE, sau khi DECR Redis thành công:
                (1) Tạo Registration với status = PENDING_PAYMENT.
                (2) Tạo SeatLock trên Redis: SET NX seat:lock:{wid}:{reg_id} {payload} EX 900.
                (3) Sinh Idempotency Key và lưu vào DB (payments bảng, cột idempotency_key).
                (4) Trả về registration_id và payment_deadline (thời điểm hết TTL).
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        POST /registrations với workshop_id thuộc workshop có phí
Inputs:         student_id (từ JWT), workshop_id
Outputs:        Registration (status=PENDING_PAYMENT), SeatLock Redis key,
                payment_deadline = NOW() + 15 phút
Business Rules: BR-019, BR-021, BR-022
Acceptance Criteria:
  Given Workshop có phí còn chỗ
  When Student POST /registrations
  Then Registration.status = PENDING_PAYMENT
  And Redis: seat:lock:{wid}:{reg_id} tồn tại với TTL = 900s
  And HTTP 201 trả về { registration_id, payment_deadline, amount }

  Given SeatLock hết TTL (15 phút không thanh toán)
  When TTL expire
  Then Redis tự xóa key (không cần job dọn dẹp)
  And seat:available:{wid} sẽ được INCR lại bởi FR-F10-001 (Payment Timeout Job)
Priority:       MUST
```

---

#### FR-F04-005 — Hủy đăng ký (Student)

```
ID:             FR-F04-005
Name:           Cancel Registration by Student
Description:    Hệ thống SHALL cho phép Student hủy Registration của chính mình.
                Khi hủy: (1) Registration.status = CANCELLED,
                (2) Ticket.status = VOID (nếu tồn tại),
                (3) INCR seat:available:{wid} trên Redis,
                (4) Đẩy event REGISTRATION_CANCELLED vào Queue.
                [ASSUMED] Hoàn tiền không được xử lý trong scope này (GAP-05).
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        DELETE /registrations/{id}
Inputs:         registration_id, student_id từ JWT (IDOR protection)
Outputs:        Registration.status = CANCELLED, Ticket.status = VOID,
                Redis INCR, event REGISTRATION_CANCELLED
Business Rules: BR-006, BR-019, BR-023
Acceptance Criteria:
  Given Registration.status = CONFIRMED
  When Student DELETE /registrations/{id}
  Then Registration.status = CANCELLED
  And Ticket.status = VOID
  And seat:available:{wid} tăng 1
  And event REGISTRATION_CANCELLED được đẩy vào Queue

  Given Student A cố hủy registration_id của Student B
  When DELETE /registrations/{b_reg_id}
  Then HTTP 404 (IDOR protection — không lộ sự tồn tại của record)
Priority:       MUST
```

---

#### FR-F04-006 — Xem lịch sử đăng ký

```
ID:             FR-F04-006
Name:           View Registration History
Description:    Hệ thống SHALL trả về danh sách Registration của Student đang đăng nhập,
                kèm thông tin Workshop và Ticket (nếu có). Áp dụng IDOR protection.
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        GET /students/me/registrations
Inputs:         student_id từ JWT
Outputs:        Danh sách Registration với Workshop info và Ticket (qr_token)
Business Rules: BR-006
Acceptance Criteria:
  Given Student có 3 registration (1 CONFIRMED, 1 PENDING_PAYMENT, 1 CANCELLED)
  When GET /students/me/registrations
  Then Trả về đủ 3, kèm Workshop title và Ticket qr_token (nếu CONFIRMED)
Priority:       MUST
```

---

### MODULE F05 — Payment Processing

**Mục tiêu module:** Xử lý thanh toán an toàn với Circuit Breaker, Idempotency 2 lớp, Fail-Fast.

---

#### FR-F05-001 — Kiểm tra Idempotency Layer 1 (Redis)

```
ID:             FR-F05-001
Name:           Check Idempotency Key in Redis (Layer 1)
Description:    Trước mọi thao tác tạo payment, hệ thống SHALL thực thi
                SET NX idempotency:{key} {payment_id} EX 86400 trên Redis.
                Nếu key đã tồn tại (NX = 0), hệ thống trả về kết quả payment cũ
                mà không tạo bản ghi mới (không chạm DB).
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        POST /payments nhận được với idempotency_key trong header
Inputs:         idempotency_key (từ Client header X-Idempotency-Key)
Outputs:        Tiếp tục tạo payment MỚI, hoặc trả về payment_id cũ (HTTP 200)
Business Rules: BR-022, BR-024
Acceptance Criteria:
  Given Student gửi 3 request POST /payments với cùng idempotency_key
  When xử lý
  Then chỉ 1 payment record được tạo trong DB
  And request thứ 2 và 3 nhận lại kết quả của request đầu (HTTP 200)
  And DB không bị chạy thêm INSERT nào
Priority:       MUST
```

---

#### FR-F05-002 — Kiểm tra Circuit Breaker State

```
ID:             FR-F05-002
Name:           Check Payment Gateway Circuit Breaker State
Description:    Trước khi gọi Payment Gateway, hệ thống SHALL đọc Redis Hash
                "circuit:payment:{gateway}" và kiểm tra trường state.
                Nếu state = OPEN, từ chối ngay lập tức (Fail-Fast) và kích hoạt
                Graceful Degradation. Nếu state = HALF-OPEN, cho phép 1 request thử nghiệm.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        Trước bất kỳ lệnh gọi nào đến Payment Gateway
Inputs:         gateway (VNPAY | STRIPE | MOMO), Redis circuit state
Outputs:        Tiếp tục gọi, hoặc HTTP 503 với Graceful Degradation message
Business Rules: BR-025, BR-026
Acceptance Criteria:
  Given circuit:payment:VNPAY.state = OPEN
  When Student cố thanh toán qua VNPay
  Then HTTP 503, body: { error: "PAYMENT_SERVICE_UNAVAILABLE",
    message: "Dịch vụ thanh toán đang bảo trì, đơn đăng ký của bạn đã được ghi nhận ở trạng thái Chờ." }
  And không có HTTP request nào được gửi đến VNPay

  Given circuit state = CLOSED
  When gọi gateway
  Then request được gửi bình thường
Priority:       MUST
```

---

#### FR-F05-003 — Xử lý Thanh toán thành công

```
ID:             FR-F05-003
Name:           Process Successful Payment
Description:    Khi Payment Gateway xác nhận thành công:
                (1) Payment.status = SUCCESS, lưu gateway_txn_id.
                (2) Registration.status = CONFIRMED.
                (3) Xóa SeatLock Redis (DEL seat:lock:{wid}:{reg_id}).
                (4) Cập nhật workshop_slots.confirmed_count (trong DB transaction).
                (5) Kích hoạt FR-F06-001 (phát hành Ticket).
                (6) Đẩy event PAYMENT_SUCCESS vào Queue.
                Tất cả bước 1–4 thực hiện trong 1 DB transaction (ACID).
Classification: FULLY AUTOMATED
Actor:          System (Webhook từ Payment Gateway hoặc callback)
Trigger:        Gateway gửi callback/webhook với trạng thái SUCCESS
Inputs:         payment_id, gateway_txn_id, gateway response JSON
Outputs:        Payment.status = SUCCESS, Registration.status = CONFIRMED,
                Ticket ACTIVE, SeatLock bị xóa, event trong Queue
Business Rules: BR-024, BR-027
Acceptance Criteria:
  Given Payment đang PENDING, Gateway webhook đến với status=SUCCESS
  When xử lý
  Then Payment.status = SUCCESS trong cùng transaction
  And Registration.status = CONFIRMED
  And Ticket.status = ACTIVE với qr_token
  And SeatLock Redis key bị DEL
  And event PAYMENT_SUCCESS trong Queue
Priority:       MUST
```

---

#### FR-F05-004 — Cập nhật Circuit Breaker State

```
ID:             FR-F05-004
Name:           Update Circuit Breaker State after Gateway Call
Description:    Sau mỗi lần gọi Payment Gateway, hệ thống SHALL cập nhật Redis Hash
                circuit:payment:{gateway} với failure_count, last_attempt, state.
                Logic chuyển trạng thái tuân theo BR-025.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        Mỗi lần gọi Payment Gateway hoàn tất (thành công hoặc thất bại)
Inputs:         kết quả gọi (success | failure | timeout)
Outputs:        Redis Hash cập nhật (state, failure_count, opened_at)
Business Rules: BR-025, BR-026
Acceptance Criteria:
  Given failure_count = 4 (CLOSED state)
  When gateway call thứ 5 timeout
  Then failure_count = 5 → state chuyển sang OPEN, opened_at = NOW()
  And các request tiếp theo bị Fail-Fast ngay lập tức
Priority:       MUST
```

---

#### FR-F05-005 — Sử dụng Pessimistic Locking tại DB (Fail-Fast)

```
ID:             FR-F05-005
Name:           Acquire Pessimistic Lock on Workshop Slot with Fail-Fast
Description:    Khi ghi nhận đơn hàng vào DB (sau khi DECR Redis thành công),
                hệ thống SHALL dùng SELECT ... FOR UPDATE trên workshop_slots.
                Lock Wait Timeout = 3 giây. Nếu vượt quá, hủy transaction
                và trả HTTP 503 (Fail-Fast).
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        INSERT vào registrations hoặc UPDATE confirmed_count
Inputs:         workshop_id
Outputs:        Lock acquired hoặc HTTP 503 Service Unavailable
Business Rules: BR-028
Acceptance Criteria:
  Given Connection Pool đầy, lock wait > 3 giây
  When request cố acquire lock
  Then DB tự hủy transaction (Lock Wait Timeout)
  And HTTP 503, body: { error: "SYSTEM_OVERLOADED",
    message: "Hệ thống đang quá tải, vui lòng thử lại sau vài giây" }
Priority:       MUST
```

---

### MODULE F06 — Ticket & QR Code

**Mục tiêu module:** Phát hành vé điện tử độc lập với Registration, hỗ trợ offline sync.

---

#### FR-F06-001 — Phát hành Ticket

```
ID:             FR-F06-001
Name:           Issue Ticket upon Registration Confirmation
Description:    Khi Registration chuyển sang CONFIRMED (từ FR-F04-003 hoặc FR-F05-003),
                hệ thống SHALL tạo đúng 1 Ticket với:
                - qr_token: JWT signed hoặc UUID signed (không thể giả mạo)
                - status: ACTIVE
                Ticket KHÔNG được tạo trước khi Registration = CONFIRMED.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        Registration.status → CONFIRMED
Inputs:         registration_id, student_id, workshop_id
Outputs:        Ticket record với qr_token unique
Business Rules: BR-029, BR-030
Acceptance Criteria:
  Given Registration.status vừa chuyển sang CONFIRMED
  When trigger chạy
  Then Ticket.status = ACTIVE với qr_token là JWT signed (header.payload.signature)
  And UNIQUE(registration_id) đảm bảo chỉ 1 ticket/registration

  Given cố tạo 2 ticket cho cùng registration_id
  When INSERT thứ 2
  Then DB raise UniqueViolation → hệ thống handle gracefully (idempotent)
Priority:       MUST
```

---

#### FR-F06-002 — Xem vé và QR Code

```
ID:             FR-F06-002
Name:           View Ticket and QR Code
Description:    Hệ thống SHALL cho phép Student xem Ticket của mình,
                bao gồm qr_token để render QR Code. Áp dụng IDOR protection.
Classification: SYSTEM-SUPPORTED
Actor:          Student
Trigger:        GET /students/me/tickets hoặc GET /tickets/{id}
Inputs:         student_id từ JWT
Outputs:        Ticket data với qr_token (để client render QR)
Business Rules: BR-006, BR-030
Acceptance Criteria:
  Given Student có Ticket ACTIVE cho Workshop A
  When GET /students/me/tickets
  Then Ticket được trả về với qr_token
  And Student không thể xem Ticket của Student khác
Priority:       MUST
```

---

#### FR-F06-003 — Void Ticket

```
ID:             FR-F06-003
Name:           Void Ticket on Registration Cancellation
Description:    Khi Registration bị CANCELLED (do Student hủy hoặc Workshop bị hủy),
                hệ thống SHALL cập nhật Ticket.status = VOID và voided_at = NOW().
Classification: FULLY AUTOMATED
Actor:          System (triggered by FR-F04-005 hoặc FR-F02-004)
Trigger:        Registration.status → CANCELLED
Inputs:         registration_id
Outputs:        Ticket.status = VOID, voided_at = NOW()
Business Rules: BR-029
Acceptance Criteria:
  Given Ticket.status = ACTIVE
  When Registration.status → CANCELLED
  Then Ticket.status = VOID, voided_at điền timestamp
  And QR Token này bị từ chối ở bất kỳ lần quét nào sau đó
Priority:       MUST
```

---

### MODULE F07 — Check-in (Online & Offline)

**Mục tiêu module:** Quét QR, validate, ghi nhận tham dự, xử lý offline và đồng bộ idempotent.

---

#### FR-F07-001 — Tải danh sách Ticket trước sự kiện (Mobile Pre-load)

```
ID:             FR-F07-001
Name:           Pre-load Active Ticket List to Mobile Device
Description:    Trước sự kiện, CheckinStaff SHALL tải danh sách Ticket ACTIVE
                của workshop được phân công về thiết bị (SQLite local).
                Chỉ tải Ticket.status = ACTIVE (giảm payload, bảo mật).
Classification: SYSTEM-SUPPORTED
Actor:          CheckinStaff, System
Trigger:        CheckinStaff bấm "Đồng bộ danh sách" trên Mobile App (online)
Inputs:         workshop_id (từ allowed_workshop_ids trong JWT)
Outputs:        Danh sách {qr_token, ticket_id, student_name, student_code} lưu SQLite
Business Rules: BR-003, BR-005, BR-031
Acceptance Criteria:
  Given Workshop A có 80 Ticket ACTIVE và 20 Ticket VOID
  When CheckinStaff pre-load cho Workshop A
  Then chỉ 80 Ticket ACTIVE được tải xuống thiết bị
  And dữ liệu lưu vào SQLite local để dùng offline
Priority:       MUST
```

---

#### FR-F07-002 — Validate QR và ghi nhận Check-in (Online)

```
ID:             FR-F07-002
Name:           Validate QR Code and Record Check-in Online
Description:    Khi có mạng, CheckinStaff quét QR → hệ thống SHALL lookup qr_token
                trong DB (index idx_tickets_qr_token). Nếu Ticket.status = ACTIVE và
                chưa có checkin_record cho (ticket_id, workshop_id) → tạo checkin_record.
                Nếu đã check-in → báo trùng lặp. Nếu VOID → từ chối.
Classification: SYSTEM-SUPPORTED
Actor:          CheckinStaff
Trigger:        POST /checkins với qr_token và workshop_id
Inputs:         qr_token, workshop_id, checked_in_by (từ JWT)
Outputs:        checkin_records tạo mới (source=ONLINE) hoặc lỗi tương ứng
Business Rules: BR-003, BR-005, BR-006, BR-032
Acceptance Criteria:
  Given qr_token hợp lệ, Ticket ACTIVE, chưa check-in
  When POST /checkins
  Then checkin_records tạo với source = ONLINE, HTTP 200

  Given qr_token thuộc Ticket VOID
  When POST /checkins
  Then HTTP 409, body: { error: "TICKET_VOIDED" }

  Given đã có checkin_record cho ticket+workshop này
  When POST /checkins lại
  Then HTTP 409, body: { error: "ALREADY_CHECKED_IN" }
Priority:       MUST
```

---

#### FR-F07-003 — Validate QR và ghi nhận Check-in (Offline)

```
ID:             FR-F07-003
Name:           Validate QR Code Offline and Buffer to Local Queue
Description:    Khi mất mạng, Mobile App SHALL validate qr_token cục bộ bằng cách
                tra cứu danh sách Ticket đã pre-load (SQLite). Hệ thống SHALL kiểm tra:
                (1) JWT Access Token còn hạn (exp check offline),
                (2) workshop_id nằm trong allowed_workshop_ids,
                (3) qr_token tồn tại trong SQLite local.
                Nếu hợp lệ, ghi vào offline_checkin_queue (status=PENDING).
Classification: SYSTEM-SUPPORTED
Actor:          CheckinStaff (Mobile App logic — không cần server)
Trigger:        Camera quét QR khi không có kết nối mạng
Inputs:         qr_token, workshop_id, checked_in_at (local time), device_id
Outputs:        offline_checkin_queue record (status=PENDING) trong SQLite
Business Rules: BR-003, BR-005, BR-033
Acceptance Criteria:
  Given Access Token còn hạn, qr_token tồn tại trong SQLite local
  When quét offline
  Then Ghi vào local queue với status=PENDING, kiểm tra trùng local

  Given qr_token không tồn tại trong SQLite local
  When quét offline
  Then Từ chối với thông báo "Mã QR không hợp lệ hoặc chưa được đồng bộ"
Priority:       MUST
```

---

#### FR-F07-004 — Đồng bộ dữ liệu Check-in Offline (Idempotent Sync)

```
ID:             FR-F07-004
Name:           Sync Offline Check-in Records Idempotently
Description:    Khi có mạng, Mobile App SHALL đẩy toàn bộ offline_checkin_queue
                lên server theo batch. Server SHALL thực thi:
                INSERT INTO checkin_records (...) ON CONFLICT (ticket_id, workshop_id) DO NOTHING
                Đảm bảo idempotency tuyệt đối — sync nhiều lần không sinh bản ghi trùng.
                Server SHALL cập nhật offline_checkin_queue.sync_status = SYNCED hoặc CONFLICT.
Classification: SYSTEM-SUPPORTED
Actor:          CheckinStaff (Mobile App), System (Server)
Trigger:        Mobile App phát hiện có kết nối mạng
Inputs:         Batch: [{local_id, qr_token, workshop_id, checked_in_at, device_id}]
Outputs:        checkin_records tạo mới (source=OFFLINE_SYNC),
                offline_checkin_queue.sync_status cập nhật
Business Rules: BR-032, BR-034
Acceptance Criteria:
  Given 50 bản ghi offline trong queue, 5 bản trong số đó đã được sync lần trước
  When Mobile sync lại
  Then 45 bản ghi mới được INSERT, 5 bản ghi cũ bị DO NOTHING (không tạo duplicate)
  And tất cả 50 cập nhật sync_status = SYNCED

  Given Ticket bị VOID giữa lúc offline và lúc sync
  When server xử lý sync record đó
  Then INSERT thành công nhưng sync_status = CONFLICT, conflict_reason ghi lý do
Priority:       MUST
```

---

#### FR-F07-005 — Silent Sync khi Access Token hết hạn (Mobile)

```
ID:             FR-F07-005
Name:           Auto-refresh Token and Retry Sync on 401
Description:    Nếu trong quá trình Sync, server trả HTTP 401 (token hết hạn),
                Mobile App SHALL tự động dùng Refresh Token trong Keychain để
                lấy Access Token mới (POST /auth/refresh) rồi tự động tiếp tục
                sync mà không cần nhân sự can thiệp.
Classification: FULLY AUTOMATED
Actor:          Mobile App (System)
Trigger:        Nhận HTTP 401 trong quá trình batch sync
Inputs:         Refresh Token (từ Keychain)
Outputs:        Access Token mới, sync tiếp tục
Business Rules: BR-001, BR-002
Acceptance Criteria:
  Given Access Token hết hạn trong ca làm việc 8 giờ
  When batch sync gặp 401
  Then App tự POST /auth/refresh, nhận Access Token mới
  And sync tiếp tục với token mới, nhân sự không nhận bất kỳ thông báo lỗi nào
Priority:       MUST
```

---

### MODULE F08 — Notification

**Mục tiêu module:** Gửi thông báo bất đồng bộ, tách rời khỏi luồng chính.

---

#### FR-F08-001 — Enqueue Notification Event

```
ID:             FR-F08-001
Name:           Enqueue Notification Event to Message Queue
Description:    Khi các sự kiện nghiệp vụ xảy ra (đăng ký xác nhận, hủy, workshop update...),
                hệ thống SHALL đẩy event vào Message Queue ngay lập tức mà không chờ kết quả
                gửi thực tế. Đảm bảo luồng chính không bị ảnh hưởng bởi SMTP/Telegram latency.
Classification: FULLY AUTOMATED
Actor:          System (Business Logic triggers)
Trigger:        Các sự kiện: REGISTRATION_CONFIRMED, PAYMENT_SUCCESS, WORKSHOP_CANCELLED,
                WORKSHOP_UPDATED, REGISTRATION_CANCELLED, PAYMENT_FAILED, CHECKIN_REMINDER
Inputs:         event_type, user_id, workshop_id, payload (metadata)
Outputs:        Message trong Queue, trả về immediate success cho caller
Business Rules: BR-035
Acceptance Criteria:
  Given Registration vừa CONFIRMED
  When event REGISTRATION_CONFIRMED được đẩy
  Then POST /registrations trả về HTTP 201 ngay mà không chờ email gửi đi
  And event nằm trong Queue để Worker xử lý
Priority:       MUST
```

---

#### FR-F08-002 — Dispatch Notification (Notification Worker)

```
ID:             FR-F08-002
Name:           Dispatch Notification via Configured Channel
Description:    Notification Worker SHALL đọc event từ Queue, tra cứu
                notification_channel_configs để tìm kênh active, gửi thông báo,
                và ghi kết quả vào notification_logs (SENT hoặc FAILED).
Classification: FULLY AUTOMATED
Actor:          System (Background Worker)
Trigger:        Message xuất hiện trong Queue
Inputs:         event type, user_id, payload
Outputs:        notification_logs record với status SENT hoặc FAILED
Business Rules: BR-035, BR-036
Acceptance Criteria:
  Given event REGISTRATION_CONFIRMED với user có email active
  When Worker xử lý
  Then Email được gửi qua SMTP
  And notification_logs.status = SENT, sent_at = NOW()

  Given SMTP timeout
  When gửi thất bại
  Then notification_logs.status = FAILED, error_message ghi lý do
  And Worker retry theo exponential backoff (tối đa 3 lần)
Priority:       MUST
```

---

### MODULE F09 — Student Data Synchronization

**Mục tiêu module:** Nhập dữ liệu sinh viên từ CSV theo lịch định kỳ (Batch-Sequential).

---

#### FR-F09-001 — Kích hoạt CSV Import Job

```
ID:             FR-F09-001
Name:           Trigger Student CSV Import Job
Description:    Hệ thống SHALL cho phép ORGANIZER kích hoạt thủ công một
                Student Sync Job từ file CSV trong Object Storage.
                Job được xử lý bất đồng bộ. Tạo student_sync_jobs record với status=RUNNING.
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /admin/student-sync với source_file_name
Inputs:         source_file_name (path trong S3/MinIO)
Outputs:        student_sync_jobs record (status=RUNNING), HTTP 202 Accepted với job_id
Business Rules: BR-037
Acceptance Criteria:
  Given File CSV tồn tại trong S3
  When Organizer kích hoạt
  Then HTTP 202, job_id trả về
  And student_sync_jobs.status = RUNNING
Priority:       MUST
```

---

#### FR-F09-002 — Parse & Upsert Student Records

```
ID:             FR-F09-002
Name:           Parse CSV and Upsert Student Records
Description:    Job SHALL đọc từng dòng CSV, validate format, và thực thi
                UPSERT trên bảng students (ON CONFLICT student_code DO UPDATE).
                Cập nhật last_synced_at = NOW() cho mỗi record chạm.
                Dòng lỗi được ghi vào student_sync_errors, job không dừng lại.
Classification: FULLY AUTOMATED
Actor:          System (Background Job)
Trigger:        student_sync_jobs.status = RUNNING
Inputs:         CSV rows: student_code, full_name, faculty, class_year, email_edu
Outputs:        students records được UPSERT, student_sync_errors cho dòng lỗi
Business Rules: BR-037, BR-038
Acceptance Criteria:
  Given CSV có 1000 dòng, 5 dòng thiếu student_code
  When Job chạy
  Then 995 students được UPSERT thành công
  And 5 student_sync_errors được ghi với error_reason = MISSING_FIELD
  And student_sync_jobs.status = PARTIAL_FAILURE
  And student_sync_jobs.processed_rows = 995, error_rows = 5
Priority:       MUST
```

---

### MODULE F10 — Background Jobs & System Maintenance

**Mục tiêu module:** Các tiến trình nền duy trì tính nhất quán của hệ thống Hybrid Storage.

---

#### FR-F10-001 — Payment Timeout Monitor

```
ID:             FR-F10-001
Name:           Detect and Process Payment Timeouts
Description:    Job SHALL định kỳ quét bảng payments WHERE status = PENDING
                AND timeout_at < NOW() (sử dụng partial index idx_payments_pending).
                Với mỗi payment timeout:
                (1) Payment.status = TIMEOUT,
                (2) Registration.status = CANCELLED,
                (3) INCR seat:available:{wid} trên Redis,
                (4) DEL seat:lock:{wid}:{reg_id} nếu còn tồn tại,
                (5) Đẩy event PAYMENT_FAILED vào Queue.
                Tất cả bước 1–2 trong 1 DB transaction.
Classification: FULLY AUTOMATED
Actor:          System (Scheduled Job — chạy mỗi 1 phút)
Trigger:        Cron: */1 * * * *
Inputs:         payments.timeout_at < NOW(), status = PENDING
Outputs:        Payment.status = TIMEOUT, Registration.status = CANCELLED,
                Redis INCR, event PAYMENT_FAILED trong Queue
Business Rules: BR-039
Acceptance Criteria:
  Given Payment đã PENDING quá 15 phút (timeout_at đã qua)
  When Job chạy
  Then Payment.status = TIMEOUT
  And Registration.status = CANCELLED
  And seat:available:{wid} tăng 1 (ghế được trả lại)
  And Sinh viên nhận thông báo PAYMENT_FAILED
Priority:       MUST
```

---

#### FR-F10-002 — Seat Reconciliation Job

```
ID:             FR-F10-002
Name:           Reconcile Workshop Slot Counts from Source of Truth
Description:    Job SHALL định kỳ cập nhật confirmed_count và locked_count
                trong bảng workshop_slots từ dữ liệu thực tế của registrations (PostgreSQL)
                và Redis keys seat:lock:{wid}:* còn sống.
                Mục đích: đảm bảo PostgreSQL luôn có dữ liệu chính xác cho reporting.
                Đây KHÔNG phải Source of Truth cho luồng đăng ký real-time.
Classification: FULLY AUTOMATED
Actor:          System (Scheduled Job — chạy mỗi 10 phút hoặc cuối ngày)
Trigger:        Cron: */10 * * * *
Inputs:         Đếm registrations CONFIRMED per workshop, đếm Redis keys seat:lock:{wid}:*
Outputs:        workshop_slots.confirmed_count và locked_count được cập nhật
Business Rules: BR-040
Acceptance Criteria:
  Given workshop_slots.confirmed_count = 45 nhưng thực tế có 47 Registration CONFIRMED
  When Reconciliation chạy
  Then workshop_slots.confirmed_count = 47
  And không ảnh hưởng đến Redis counter (source of truth vẫn là Redis)
Priority:       SHOULD
```

---

#### FR-F10-003 — Circuit Breaker Recovery Monitor

```
ID:             FR-F10-003
Name:           Monitor Circuit Breaker HALF-OPEN Recovery
Description:    [ASSUMED] Job SHALL theo dõi Redis Hash circuit:payment:{gateway}.
                Khi state = OPEN và (NOW() - opened_at) > 30 giây,
                SHALL chuyển state sang HALF-OPEN để cho phép request thử nghiệm.
                Sau 1 lần gọi thành công trong HALF-OPEN, chuyển về CLOSED.
Classification: FULLY AUTOMATED
Actor:          System
Trigger:        circuit state = OPEN và thời gian nguội đã qua
Inputs:         circuit:payment:{gateway} Redis Hash
Outputs:        state chuyển OPEN → HALF-OPEN hoặc HALF-OPEN → CLOSED
Business Rules: BR-025, BR-026
Acceptance Criteria:
  Given state = OPEN, opened_at = 35 giây trước
  When Monitor chạy
  Then state = HALF-OPEN
  And 1 request thực tế được phép gọi Gateway để test

  Given state = HALF-OPEN, request test thành công
  When cập nhật state
  Then state = CLOSED, failure_count = 0
Priority:       MUST
```

---

#### FR-F10-004 — Quản lý phân công Workshop cho Check-in Staff

```
ID:             FR-F10-004
Name:           Assign Workshops to CheckinStaff
Description:    Hệ thống SHALL cho phép ORGANIZER gán/thu hồi quyền truy cập
                Workshop cho CheckinStaff. Thay đổi có hiệu lực ở JWT tiếp theo
                (Eventual Consistency — cần logout/login).
                Giao diện SHALL hiển thị cảnh báo về độ trễ này.
Classification: SYSTEM-SUPPORTED
Actor:          Organizer
Trigger:        POST /admin/checkin-staff/{uid}/assign-workshops
Inputs:         user_id, workshop_ids[]
Outputs:        Assignment record cập nhật trong DB,
                Cảnh báo UI: "Nhân sự cần đăng xuất và đăng nhập lại để nhận quyền mới"
Business Rules: BR-041
Acceptance Criteria:
  Given Organizer assign Workshop B cho nhân sự X
  When POST request
  Then Assignment lưu vào DB
  And Nhân sự X nhận JWT với allowed_workshop_ids mới SAU KHI login lại
  And UI Organizer hiển thị warning về Eventual Consistency
Priority:       SHOULD
```

---

#### FR-F10-005 — Workshop Auto-Completion

```
ID:             FR-F10-005
Name:           Auto-Complete Past Published Workshops
Description:    Hệ thống SHALL chạy cron job mỗi 1 giờ (0 * * * *) quét các Workshop có
                status = PUBLISHED và ends_at < NOW(). Với mỗi workshop hợp lệ, hệ thống
                SHALL chuyển status = COMPLETED. Workshop ở trạng thái DRAFT, CANCELLED,
                hoặc COMPLETED SHALL bị loại trừ. Redis seat counter không bị xóa
                (COMPLETED là trạng thái hiển thị, không phải hủy).
Classification: FULLY AUTOMATED
Actor:          System (Scheduled Job — chạy mỗi 1 giờ)
Trigger:        Cron: 0 * * * *
Inputs:         workshops WHERE status = PUBLISHED AND ends_at < NOW()
Outputs:        Workshop.status = COMPLETED (batch), count of completed workshops
Business Rules: BR-042
Acceptance Criteria:
  Given Workshop PUBLISHED có ends_at đã qua
  When Cron job chạy
  Then Workshop.status = COMPLETED
  And Redis key seat:available:{workshop_id} KHÔNG bị xóa

  Given Workshop ở trạng thái DRAFT, CANCELLED, hoặc COMPLETED
  When Cron job chạy
  Then Workshop bị loại trừ bởi WHERE clause, không thay đổi status

  Given Database connection lỗi
  When completion query fails
  Then Service trả FailResult(INTERNAL_ERROR), cron retry ở tick tiếp theo
Priority:       MUST
```

---

## 4. Business Rules

| ID | Rule | Nguồn | Loại |
|---|---|---|---|
| BR-001 | Access Token (Web): exp = 15 phút; Access Token (Mobile): exp = 8 giờ | FR-F01-001 | Time-based |
| BR-002 | Refresh Token: exp = 7 ngày (cả Web và Mobile) | FR-F01-001 | Time-based |
| BR-003 | CHECKIN_STAFF JWT PHẢI chứa allowed_workshop_ids[] | FR-F01-002, FR-F01-006 | Authorization |
| BR-004 | Token Blacklist key: "token:blacklist:{jti}", TTL = JWT.exp - NOW() | FR-F01-008 | Time-based |
| BR-005 | Scope check: workshop_id trong request PHẢI nằm trong allowed_workshop_ids | FR-F01-006 | Authorization |
| BR-006 | IDOR: Mọi query dữ liệu cá nhân STUDENT bắt buộc WHERE student_id = jwt.sub | FR-F01-007 | Authorization |
| BR-007 | Workshop is_paid = FALSE → price = NULL; is_paid = TRUE → price > 0 | FR-F02-001 | Validation |
| BR-008 | ends_at PHẢI > starts_at | FR-F02-001 | Validation |
| BR-009 | capacity > 0 | FR-F02-001 | Validation |
| BR-010 | Không có 2 Workshop PUBLISHED nào cùng room_id, cùng time slot | FR-F02-002 | Validation |
| BR-011 | Redis key seat:available:{wid} CHỈ được khởi tạo khi Workshop chuyển sang PUBLISHED | FR-F02-003 | Routing |
| BR-012 | Khi Workshop CANCELLED: tất cả Ticket ACTIVE → VOID, tất cả Registration → CANCELLED | FR-F02-004 | Routing |
| BR-013 | Student chỉ xem Workshop có status = PUBLISHED | FR-F02-006 | Authorization |
| BR-014 | Workshop Document: chỉ lưu URL (VARCHAR) vào DB; binary lưu Object Storage | FR-F03-001 | Architecture |
| BR-015 | AI Summary pipeline: PENDING → PROCESSING → DONE/FAILED (không skip bước) | FR-F03-002 | Routing |
| BR-016 | Token Bucket: capacity = 5 tokens/user; refill = 1 token / 10 giây | FR-F04-001 | Calculation |
| BR-017 | Global rate limit: 500 requests/giây toàn hệ thống → HTTP 429 | FR-F04-001 | Calculation |
| BR-018 | DECR Redis: nếu kết quả < 0 → INCR lại ngay lập tức → báo Sold Out | FR-F04-002 | Calculation |
| BR-019 | UNIQUE(student_id, workshop_id) trong registrations: 1 sinh viên chỉ có 1 đơn hợp lệ | FR-F04-003, FR-F04-004 | Validation |
| BR-020 | Free workshop: Registration → CONFIRMED ngay lập tức sau DECR thành công | FR-F04-003 | Routing |
| BR-021 | Paid workshop: Tạo SeatLock Redis "seat:lock:{wid}:{reg_id}" với TTL = 900s (15 phút) | FR-F04-004 | Time-based |
| BR-022 | Idempotency Key: SET NX idempotency:{key} EX 86400 (24 giờ TTL trên Redis) | FR-F04-004, FR-F05-001 | Time-based |
| BR-023 | Student chỉ hủy Registration của chính mình | FR-F04-005 | Authorization |
| BR-024 | Idempotency Key cũng có UNIQUE constraint trên payments.idempotency_key (Layer 2 DB) | FR-F05-001 | Validation |
| BR-025 | Circuit Breaker: CLOSED→OPEN khi failure_count ≥ 5 trong 60s; OPEN→HALF-OPEN sau 30s; HALF-OPEN→CLOSED sau 1 success | FR-F05-002, FR-F05-004, FR-F10-003 | Routing |
| BR-026 | Khi Circuit OPEN: từ chối ngay lập tức (Fail-Fast), Graceful Degradation | FR-F05-002 | Routing |
| BR-027 | Payment SUCCESS: cập nhật Payment, Registration, Ticket, DEL SeatLock trong 1 ACID transaction | FR-F05-003 | Validation |
| BR-028 | DB Lock Wait Timeout = 3 giây; vượt quá → hủy transaction, trả HTTP 503 | FR-F05-005 | Time-based |
| BR-029 | Ticket CHỈ được tạo khi Registration.status = CONFIRMED | FR-F06-001 | Routing |
| BR-030 | UNIQUE(registration_id) trong tickets: 1 Registration → 1 Ticket | FR-F06-001 | Validation |
| BR-031 | Mobile pre-load: chỉ tải Ticket có status = ACTIVE (không tải VOID) | FR-F07-001 | Routing |
| BR-032 | Check-in idempotency: UNIQUE(ticket_id, workshop_id) trong checkin_records | FR-F07-002, FR-F07-004 | Validation |
| BR-033 | Offline check-in: Access Token PHẢI còn hạn (kiểm tra exp cục bộ trên device) | FR-F07-003 | Authorization |
| BR-034 | Offline sync: INSERT ON CONFLICT (ticket_id, workshop_id) DO NOTHING | FR-F07-004 | Routing |
| BR-035 | Notification: LUÔN dùng Message Queue (không gửi trực tiếp trong luồng chính) | FR-F08-001 | Architecture |
| BR-036 | Notification retry: tối đa 3 lần với exponential backoff | FR-F08-002 | Routing |
| BR-037 | CSV Sync: UPSERT dựa trên student_code; cập nhật last_synced_at | FR-F09-002 | Routing |
| BR-038 | CSV Sync: dòng lỗi KHÔNG dừng job; ghi vào student_sync_errors, tiếp tục | FR-F09-002 | Routing |
| BR-039 | Payment Timeout: job chạy mỗi 1 phút, quét payments PENDING quá timeout_at | FR-F10-001 | Time-based |
| BR-040 | Reconciliation: job chạy mỗi 10 phút; KHÔNG dùng PostgreSQL làm source of truth cho real-time seat | FR-F10-002 | Architecture |
| BR-041 | Workshop assignment cho CheckinStaff: Eventual Consistency (hiệu lực ở JWT tiếp theo) | FR-F10-004 | Routing |
| BR-042 | Workshop auto-completion: cron mỗi giờ quét PUBLISHED ends_at < NOW() → COMPLETED | FR-F10-005 | Time-based |

---

## 5. Traceability Matrix

| User Journey Step | Classification | FR (System Function) | BR (Business Rules) | Entity |
|---|---|---|---|---|
| **STUDENT** | | | | |
| Đăng nhập / xác thực | SYSTEM-SUPPORTED | FR-F01-001, FR-F01-002 | BR-001, BR-002, BR-003 | users, students |
| Xác thực mọi request | FULLY AUTOMATED | FR-F01-004, FR-F01-005 | BR-001, BR-004 | users (JWT) |
| Silent Refresh (Web) | FULLY AUTOMATED | FR-F01-003 | BR-001, BR-002 | (in-memory) |
| Duyệt danh sách Workshop | SYSTEM-SUPPORTED | FR-F02-006 | BR-013 | workshops, Redis |
| Xem chi tiết Workshop | SYSTEM-SUPPORTED | FR-F02-007 | BR-013 | workshops, ai_summaries, Redis |
| Kiểm tra Rate Limit | FULLY AUTOMATED | FR-F04-001 | BR-016, BR-017 | Redis (ratelimit:) |
| Trừ ghế nguyên tử | FULLY AUTOMATED | FR-F04-002 | BR-018 | Redis (seat:available:) |
| Đăng ký miễn phí | SYSTEM-SUPPORTED | FR-F04-003, FR-F06-001 | BR-019, BR-020, BR-029 | registrations, tickets |
| Đăng ký có phí + giữ chỗ | SYSTEM-SUPPORTED | FR-F04-004 | BR-019, BR-021, BR-022 | registrations, Redis (seat:lock:, idempotency:) |
| Check Idempotency Layer 1 | FULLY AUTOMATED | FR-F05-001 | BR-022, BR-024 | Redis (idempotency:) |
| Check Circuit Breaker | FULLY AUTOMATED | FR-F05-002 | BR-025, BR-026 | Redis (circuit:) |
| Gọi Payment Gateway | SYSTEM-SUPPORTED | FR-F05-002, FR-F05-004 | BR-025 | payments, Redis |
| Thanh toán thành công | FULLY AUTOMATED | FR-F05-003, FR-F06-001 | BR-024, BR-027, BR-029 | payments, registrations, tickets, Redis |
| Nhận QR Code | SYSTEM-SUPPORTED | FR-F06-002 | BR-006, BR-030 | tickets |
| Hủy đăng ký | SYSTEM-SUPPORTED | FR-F04-005, FR-F06-003 | BR-019, BR-023, BR-029 | registrations, tickets, Redis |
| Xem lịch sử tham dự | SYSTEM-SUPPORTED | FR-F04-006 | BR-006 | registrations, tickets |
| **ORGANIZER** | | | | |
| Tạo Workshop | SYSTEM-SUPPORTED | FR-F02-001, FR-F02-002 | BR-007, BR-008, BR-009, BR-010 | workshops, workshop_slots |
| Upload PDF | SYSTEM-SUPPORTED | FR-F03-001 | BR-014 | workshop_documents (S3) |
| Kích hoạt AI Summary | FULLY AUTOMATED | FR-F03-002 | BR-015 | ai_summaries (Queue) |
| Publish Workshop | SYSTEM-SUPPORTED | FR-F02-003 | BR-011 | workshops, Redis (seat:available:) |
| Đổi phòng/giờ | SYSTEM-SUPPORTED | FR-F02-005, FR-F02-002 | BR-010 | workshops (Queue → notifications) |
| Hủy Workshop | SYSTEM-SUPPORTED | FR-F02-004, FR-F06-003 | BR-012 | workshops, tickets, registrations (Queue) |
| Phân công nhân sự | SYSTEM-SUPPORTED | FR-F10-004 | BR-003, BR-041 | users (assignment table) |
| Thu hồi token khẩn cấp | SYSTEM-SUPPORTED | FR-F01-008 | BR-004 | Redis (token:blacklist:) |
| Kích hoạt CSV Sync | SYSTEM-SUPPORTED | FR-F09-001, FR-F09-002 | BR-037, BR-038 | student_sync_jobs, students |
| Xem thống kê | SYSTEM-SUPPORTED | FR-F02-006, FR-F02-007 | - | v_workshop_availability, v_workshop_checkin_stats |
| **CHECKIN STAFF** | | | | |
| Đăng nhập (Online) | SYSTEM-SUPPORTED | FR-F01-001, FR-F01-002 | BR-001, BR-002, BR-003 | users (JWT + Keychain) |
| Pre-load Ticket list | SYSTEM-SUPPORTED | FR-F07-001 | BR-031, BR-005 | tickets (SQLite local) |
| Quét QR (Online) | SYSTEM-SUPPORTED | FR-F07-002 | BR-003, BR-005, BR-032 | tickets, checkin_records |
| Quét QR (Offline) | SYSTEM-SUPPORTED | FR-F07-003 | BR-033, BR-005 | SQLite (offline_checkin_queue) |
| Offline Sync | SYSTEM-SUPPORTED | FR-F07-004, FR-F07-005 | BR-032, BR-034 | checkin_records, offline_checkin_queue |
| **SYSTEM JOBS** | | | | |
| Payment Timeout Monitor | FULLY AUTOMATED | FR-F10-001 | BR-039 | payments, registrations, Redis |
| Seat Reconciliation | FULLY AUTOMATED | FR-F10-002 | BR-040 | workshop_slots |
| Circuit Breaker Monitor | FULLY AUTOMATED | FR-F10-003 | BR-025, BR-026 | Redis (circuit:) |
| Workshop Auto-Completion | FULLY AUTOMATED | FR-F10-005 | BR-042 | workshops |
| Notification Dispatch | FULLY AUTOMATED | FR-F08-001, FR-F08-002 | BR-035, BR-036 | notification_logs (Queue) |
| CSV Import Job | FULLY AUTOMATED | FR-F09-002 | BR-037, BR-038 | students, student_sync_errors |

---

## 6. Analysis Report

*Lưu ý: Các phân tích và khuyến nghị dưới đây đã được điều chỉnh nghiêm ngặt dựa trên ràng buộc nguồn lực của dự án (2 sinh viên, 2 tuần thực thi) theo nguyên lý MVP (Minimum Viable Product).*

### 6.1. Resolution of System Gaps (Xử lý các khoảng trống hệ thống)

| ID | Vấn đề ban đầu | Quyết định Kiến trúc & Xử lý (Resolution) | Trạng thái |
|---|---|---|---|
| GAP-01 | Chưa rõ quy trình hoàn tiền (Refund) khi Organizer hủy Workshop. | **OUT-OF-SCOPE.** Việc xử lý đối soát và callback refund tự động quá phức tạp cho mốc 2 tuần. **Quyết định:** Cập nhật UI hiển thị thông báo: *"Vui lòng liên hệ Văn phòng Đoàn/Hội để nhận hoàn tiền thủ công"*. | RESOLVED |
| GAP-02 | Chưa định nghĩa danh sách chờ (Waitlist). | **OUT-OF-SCOPE.** Giữ luồng Booking tuyến tính. **Quyết định:** Khi có user hủy đơn hoặc SeatLock timeout, hệ thống chạy lệnh `INCR` nhả ghế lên Redis. Người đến sau F5 thấy còn chỗ thì tự đăng ký (First-come, first-served). | RESOLVED |
| GAP-03 | Cho phép đổi phòng/giờ khi Workshop đã có người đăng ký? | **IN-SCOPE (Luồng Khẩn cấp).** Chấp nhận tính năng này vì thực tế nghiệp vụ rất cần. **Quyết định:** Check xung đột nội bộ -> Update DB -> Đẩy Event vào Message Queue. Worker ngầm sẽ broadcast thông báo cho sinh viên. Giữ API phản hồi nhanh gọn. | RESOLVED |
| GAP-04 | Cơ chế HALF-OPEN test request thiếu chi tiết. | **IN-SCOPE (Canary Pattern).** Không cần viết Cronjob ngầm. **Quyết định:** Sau 30s mạch mở, Request thanh toán thực tế đầu tiên của user đi vào sẽ được thả qua Gateway để test mạch. Thành công thì đóng mạch, thất bại thì mở lại. | RESOLVED |
| GAP-05 | Hoàn tiền khi Student tự hủy Registration. | **OUT-OF-SCOPE.** Tương tự GAP-01, quy trình này được xử lý thủ công bằng nghiệp vụ Kế toán bên ngoài hệ thống phần mềm. | RESOLVED |

---

### 6.2. Ambiguities Detected (Xử lý các điểm mơ hồ)

| # | Mơ hồ | Giải pháp / Giả định áp dụng |
|---|---|---|
| AMB-01 | "Idempotency Key do Client hay Backend sinh?" | **[ASSUMED]** Backend sinh key theo format `REG_{registration_id}_{attempt_n}` trả về cho Client. Client dùng lại key này nếu thao tác lỗi mạng. Kiểm soát bảo mật hoàn toàn ở Backend. |
| AMB-02 | "PostgreSQL cập nhật số lượng locked_count từ đâu?" | **[ASSUMED]** Bỏ qua luồng Reconciliation định kỳ để tiết kiệm thời gian dev. Số chỗ trống thực tế (`available_seats`) hoàn toàn tin tưởng vào Redis (`seat:available:{wid}`). PostgreSQL chỉ lưu lại tổng số vé đã `CONFIRMED`. |
| AMB-03 | "Workshop DRAFT có được đổi phòng/giờ không?" | **[ASSUMED]** Có. Chỉ workshop `PUBLISHED` khi đổi phòng/giờ mới kích hoạt logic kiểm tra xung đột phòng và đẩy thông báo vào Queue. |
| AMB-04 | "Ticket qr_token là JWT hay UUID?" | **[ASSUMED]** Là **Signed JWT** chứa `{ticket_id, workshop_id, student_id, exp}`. Chữ ký số cho phép Mobile App verify tính hợp lệ cục bộ (Offline) mà không cần query Database. |
| AMB-05 | "Offline Sync conflict: ticket VOID — lưu checkin hay bỏ qua?" | **[ASSUMED]** Thực thi `INSERT DO NOTHING` nhưng nếu Frontend nhận diện vé đã bị hủy, app đánh dấu `sync_status = CONFLICT` để ghi log, không cộng vào số liệu check-in thực tế. |

---

### 6.3. Automation Opportunities (Cơ hội tự động hóa)

| Bước hiện tại | Trạng thái ưu tiên | Giải pháp Tự động hóa khả thi trong 2 tuần |
|---|---|---|
| Organizer phân công CheckinStaff | HUMAN | ❌ Tốn quá nhiều effort. Giữ nguyên thao tác thủ công qua UI. |
| Organizer kích hoạt CSV Sync | AUTOMATED | ⚡ Cron Job chạy lúc 2:00 AM hàng đêm tự động kéo file CSV (được đánh tên theo ngày) từ thư mục S3 định sẵn để Upsert. |
| Dọn dẹp SeatLock hết hạn | AUTOMATED | ✅ Không cần viết code. Dựa hoàn toàn vào tính năng **TTL tự hủy** của Redis. |
| Phát hiện Payment Timeout | AUTOMATED | ✅ Cronjob chạy mỗi 1 phút quét index `idx_payments_pending` (FR-F10-001). |

---

### 6.4. Improvement Suggestions (Đề xuất Cải tiến Kỹ thuật)

**Kiến trúc & Thiết kế:**

1. **Tách Webhook endpoint riêng cho Payment Gateway:** FR-F05-003 bắt buộc có endpoint riêng biệt (VD: `/api/webhooks/vnpay`) được bảo vệ bằng Signature Verification (HMAC/Checksum) của đối tác, tách biệt hoàn toàn với luồng JWT của user.
2. **Circuit Breaker State TTL:** Không để Redis Hash `circuit:payment:{gateway}` tồn tại vĩnh viễn. Cần set TTL khoảng 24h và có cảnh báo log (Console Alert) nếu state duy trì ở `OPEN` quá 5 phút.
3. **Cơ chế dọn dẹp SQLite (Mobile App):** Ở bước Pre-load (FR-F07-001), App phải **Xóa toàn bộ (Replace)** bảng cache vé local cũ thay vì Ghi đè/Thêm mới (Append). Điều này tránh rủi ro các Ticket cũ đã bị `VOID` trên Server vẫn tồn tại hợp lệ ở Local.

**Về Non-Functional Requirements (NFR) cần đảm bảo:**

- **Performance:** Luồng Đăng ký (Lấy Token Bucket + DECR Redis) **SHALL** trả kết quả HTTP trong `< 300ms` (không tính thời gian gọi cổng thanh toán bên ngoài).
- **Security:** Mọi endpoint **SHALL** chạy qua HTTPS (TLS 1.2+).
- **Reliability:** Cụm Redis **SHALL** được bật tính năng AOF (Append Only File) persistence ở mức `everysec` để giảm rủi ro mất Seat Lock/Available Seats nếu server crash.
- **Data Integrity:** Không lưu file PDF nhị phân vào DB, bắt buộc dùng Object Storage (S3/MinIO) để giảm tải I/O cho PostgreSQL.

---

*Tài liệu này có thể được cập nhật khi có thêm yêu cầu mới. Mọi thay đổi cần qua Change Control và cập nhật Traceability Matrix tương ứng.*
