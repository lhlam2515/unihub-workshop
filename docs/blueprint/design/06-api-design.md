# UniHub Workshop — RESTful API Design

**Phiên bản:** 1.0 | **Ngày:** 2026-04-27
**Mapping nguồn:** SRS v1.0, Architecture Design, Storage Strategy, ADR, User Journeys

---

## Quy ước thiết kế

| Quy ước | Chi tiết |
|---|---|
| **Base URL** | `/api/v1` |
| **Xác thực** | Header `Authorization: Bearer <Access_Token>` cho mọi endpoint yêu cầu phân quyền |
| **Phân quyền** | `PUBLIC` — không cần token · `ANY` — cần token hợp lệ (bất kỳ role) · `STUDENT` · `ORGANIZER` · `CHECKIN_STAFF` |
| **IDOR Protection** | Các endpoint dữ liệu cá nhân của Student dùng prefix `/students/me/` — Backend tự inject `student_id = jwt.sub` vào SQL, bỏ qua mọi tham số ID do Client gửi |
| **Idempotency** | Endpoint thanh toán yêu cầu Header `X-Idempotency-Key: <uuid>` |
| **Webhook** | Endpoint nhận callback từ Payment Gateway dùng xác thực chữ ký HMAC thay vì JWT |
| **Content-Type** | `application/json` (trừ upload file dùng `multipart/form-data`) |
| **Chuẩn lỗi** | `{ "error": "ERROR_CODE", "message": "Human-readable message" }` |
| **Phân trang** | Query params: `?page=1&limit=20` cho các endpoint trả danh sách |

---

## Module F01 — Identity & Access Management (IAM)

**Mục tiêu:** Xác thực danh tính, cấp phát Dual-Token, Refresh với Mutex, thu hồi khẩn cấp, bảo vệ tài nguyên theo Role và Scope.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 1 | `POST` | `/auth/login` | `PUBLIC` | FR-F01-001 | **Đăng nhập.** Nhận `{email, password, platform: WEB\|MOBILE}`. Xác thực bcrypt, sinh cặp Dual-Token. **Web:** Access Token (15 phút) trả về body + Refresh Token (7 ngày) set `HttpOnly Secure SameSite=Strict` Cookie. **Mobile:** Cả 2 token trả về body (Access Token exp = 8 giờ) để lưu vào Keychain. Trả `401` nếu sai credential — không tiết lộ field nào sai (chống enumeration). |
| 2 | `POST` | `/auth/refresh` | `PUBLIC` | FR-F01-003 | **Silent Token Refresh.** Nhận Refresh Token (Web: tự động từ Cookie; Mobile: từ body). Xác thực chữ ký và blacklist, sinh Access Token mới + xoay vòng Refresh Token mới (Rotation). Trả `401` nếu Refresh Token hết hạn hoặc bị blacklist — Frontend redirect về `/login`. |
| 3 | `POST` | `/auth/logout` | `ANY` | FR-F01-008 | **Đăng xuất.** Blacklist `jti` hiện tại của Access Token trên Redis (`token:blacklist:{jti}` với TTL = thời gian còn lại). Web: Xóa HttpOnly Cookie. Mobile: Client tự xóa Keychain. |
| 4 | `GET` | `/auth/me` | `ANY` | FR-F01-004, FR-F01-005 | **Lấy thông tin profile.** Trả về thông tin User đang đăng nhập dựa vào `jwt.sub`: `user_id`, `email`, `role`. Với STUDENT: thêm `student_code`, `full_name`, `faculty`. Với CHECKIN_STAFF: thêm `allowed_workshop_ids`. |
| 5 | `POST` | `/admin/users/{user_id}/revoke-token` | `ORGANIZER` | FR-F01-008 | **Thu hồi Token khẩn cấp.** Tìm `jti` đang hoạt động của user, SET `token:blacklist:{jti}` trên Redis với TTL bằng thời gian còn lại của token. Dùng khi nhân sự mất điện thoại hoặc bị đình chỉ. Request tiếp theo của user trả `401 TOKEN_REVOKED` trong < 2ms. |
| 6 | `GET` | `/admin/users` | `ORGANIZER` | FR-F10-004 | **Danh sách người dùng.** Lấy toàn bộ user với filter theo `role`. Hỗ trợ lọc `?role=CHECKIN_STAFF` để quản lý nhân sự điểm danh. |
| 7 | `GET` | `/admin/users/{user_id}` | `ORGANIZER` | FR-F10-004 | **Chi tiết một người dùng.** Xem thông tin chi tiết, role, trạng thái tài khoản (`ACTIVE`, `SUSPENDED`). |
| 8 | `PATCH` | `/admin/users/{user_id}/status` | `ORGANIZER` | FR-F01-008 | **Cập nhật trạng thái tài khoản.** Kích hoạt / Đình chỉ (`ACTIVE` / `SUSPENDED`). Khi `SUSPENDED`, tự động thu hồi token (gọi logic của endpoint #5). |

---

## Module F02 — Workshop Management

**Mục tiêu:** Quản lý toàn bộ vòng đời Workshop (DRAFT → PUBLISHED → COMPLETED/CANCELLED), kiểm tra xung đột phòng, khởi tạo Redis counter.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 9 | `GET` | `/workshops` | `PUBLIC` | FR-F02-006 | **Danh sách Workshop công khai.** Chỉ trả Workshop `status = PUBLISHED`. Kèm `available_seats` đọc từ Redis `seat:available:{workshop_id}` (không phải PostgreSQL). Hỗ trợ filter: `?faculty=&date_from=&date_to=&is_paid=&page=&limit=`. |
| 10 | `GET` | `/workshops/{workshop_id}` | `PUBLIC` | FR-F02-007 | **Chi tiết Workshop công khai.** Trả đầy đủ: thông tin Workshop, Speaker, Room (kèm `floor_plan_url`), AI Summary (nếu `status = DONE`), `available_seats` từ Redis. Trả `404` nếu Workshop không tồn tại hoặc không phải `PUBLISHED`. |
| 11 | `GET` | `/admin/workshops` | `ORGANIZER` | FR-F02-006 | **Danh sách Workshop (Admin).** Trả toàn bộ trạng thái (bao gồm `DRAFT`, `CANCELLED`). Kèm thống kê nhanh: `confirmed_count`, `locked_count` từ `workshop_slots`. |
| 12 | `GET` | `/admin/workshops/{workshop_id}` | `ORGANIZER` | FR-F02-007 | **Chi tiết Workshop (Admin).** Tương tự endpoint #10 nhưng không lọc theo status. |
| 13 | `POST` | `/admin/workshops` | `ORGANIZER` | FR-F02-001, FR-F02-002 | **Tạo Workshop mới.** Body: `{title, description, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price?}`. Tạo Workshop ở `DRAFT` + tạo đồng thời `workshop_slots`. Validate: `is_paid=TRUE` bắt buộc `price > 0` (trả `422`); `ends_at > starts_at` (trả `422`). Redis counter **chưa** được khởi tạo ở bước này. |
| 14 | `PUT` | `/admin/workshops/{workshop_id}` | `ORGANIZER` | FR-F02-001 | **Cập nhật Workshop.** Chỉ cho phép khi `status = DRAFT`. Thực hiện kiểm tra xung đột phòng (FR-F02-002) nếu `room_id` hoặc `starts_at`/`ends_at` thay đổi. Trả `409 ROOM_CONFLICT` nếu xung đột. |
| 15 | `POST` | `/admin/workshops/{workshop_id}/publish` | `ORGANIZER` | FR-F02-003 | **Publish Workshop.** Chuyển `DRAFT → PUBLISHED`. **Khởi tạo Redis:** `SET seat:available:{workshop_id} {capacity}`. Kiểm tra: chỉ chuyển được từ `DRAFT` (trả `409 INVALID_STATUS_TRANSITION` nếu đã `PUBLISHED`/`CANCELLED`). Workshop xuất hiện trong danh sách công khai ngay sau khi Publish. |
| 16 | `PATCH` | `/admin/workshops/{workshop_id}/emergency-update` | `ORGANIZER` | FR-F02-005, FR-F02-002 | **Đổi phòng / giờ khẩn cấp (Workshop đã PUBLISHED).** Body: `{room_id?, starts_at?, ends_at?}`. Kiểm tra xung đột phòng nội bộ trước. Nếu không xung đột: cập nhật DB, đẩy event `WORKSHOP_UPDATED` vào Message Queue. **API trả `200 OK` ngay lập tức (< 300ms)** — thông báo cho sinh viên được gửi bất đồng bộ bởi Notification Worker. |
| 17 | `POST` | `/admin/workshops/{workshop_id}/cancel` | `ORGANIZER` | FR-F02-004, FR-F06-003 | **Hủy Workshop.** Chuyển `status = CANCELLED`. Cascade: VOID toàn bộ Ticket `ACTIVE`, CANCELLED toàn bộ Registration `CONFIRMED`/`PENDING_PAYMENT`. Đẩy event `WORKSHOP_CANCELLED` vào Queue. `DEL seat:available:{workshop_id}` trên Redis. Trả `409` nếu đã `CANCELLED`. |
| 18 | `GET` | `/admin/workshops/{workshop_id}/stats` | `ORGANIZER` | FR-F02-006 | **Thống kê Workshop.** Query từ PostgreSQL View `v_workshop_checkin_stats`: tổng đăng ký, tổng check-in, tỉ lệ tham dự, số check-in offline. |
| 19 | `GET` | `/admin/rooms` | `ORGANIZER` | FR-F02-001 | **Danh sách phòng.** Tra cứu phòng để dùng khi tạo/sửa Workshop. |
| 20 | `GET` | `/admin/speakers` | `ORGANIZER` | FR-F02-001 | **Danh sách diễn giả.** Tra cứu speaker để dùng khi tạo/sửa Workshop. |
| 21 | `POST` | `/admin/rooms` | `ORGANIZER` | FR-F02-001 | **Tạo phòng mới.** Body: `{name, building, floor, capacity, floor_plan_url?, facilities?}`. |
| 22 | `POST` | `/admin/speakers` | `ORGANIZER` | FR-F02-001 | **Tạo diễn giả mới.** Body: `{full_name, title?, bio?, avatar_url?}`. |

---

## Module F03 — Content & AI Pipeline

**Mục tiêu:** Upload tài liệu PDF lên Object Storage, kích hoạt pipeline Pipe-and-Filter sinh tóm tắt AI.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 23 | `POST` | `/admin/workshops/{workshop_id}/documents` | `ORGANIZER` | FR-F03-001, FR-F03-002 | **Upload tài liệu PDF.** `multipart/form-data` với field `file`. File được đẩy lên S3/MinIO — chỉ URL lưu vào `workshop_documents` (không lưu binary vào DB). Sau khi upload thành công (`upload_status = UPLOADED`), hệ thống **tự động** đẩy job vào Async Queue để kích hoạt AI Summary pipeline. Trả `415` nếu không phải PDF. Giới hạn: < 50MB. |
| 24 | `GET` | `/admin/workshops/{workshop_id}/documents` | `ORGANIZER` | FR-F03-001 | **Danh sách tài liệu của Workshop.** Trả `document_id`, `file_url`, `original_name`, `upload_status`, `upload_at`. |
| 25 | `DELETE` | `/admin/documents/{document_id}` | `ORGANIZER` | FR-F03-001 | **Xóa tài liệu.** Xóa record trong DB và file trên Object Storage. Cascade xóa `ai_summaries` liên quan. |
| 26 | `GET` | `/admin/documents/{document_id}/summary` | `ORGANIZER` | FR-F03-002 | **Xem trạng thái AI Summary.** Trả `status` (PENDING / PROCESSING / DONE / FAILED), `summary_text` (nếu DONE), `error_message` (nếu FAILED), `model_used`, `generated_at`. |
| 27 | `POST` | `/admin/documents/{document_id}/ai-retry` | `ORGANIZER` | FR-F03-002 | **Retry AI Summary.** Dùng khi pipeline trước FAILED (PDF dạng ảnh scan, LLM timeout...). Reset `ai_summaries.status = PENDING` và đẩy lại job vào Queue. Chỉ cho phép khi status hiện tại là `FAILED`. |

---

## Module F04 — Registration & Seat Management

**Mục tiêu:** Luồng đăng ký chịu tải — Token Bucket → DECR Redis → tạo Registration → SeatLock. Không dùng Message Queue cho luồng đăng ký (KISS principle).

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 28 | `POST` | `/registrations` | `STUDENT` | FR-F04-001, FR-F04-002, FR-F04-003, FR-F04-004 | **Đăng ký Workshop (luồng lõi).** Body: `{workshop_id}`. **Luồng xử lý theo thứ tự:** (1) Kiểm tra Token Bucket `ratelimit:register:{user_id}` — trả `429` nếu hết token; (2) `DECR seat:available:{workshop_id}` — trả `409 WORKSHOP_FULL` nếu kết quả < 0; (3) Kiểm tra UNIQUE(student_id, workshop_id) — trả `409 ALREADY_REGISTERED`; (4a) Workshop miễn phí: Registration `CONFIRMED` + phát Ticket ngay; (4b) Workshop có phí: Registration `PENDING_PAYMENT` + tạo SeatLock Redis (TTL 900s) + sinh Idempotency Key. Trả `201` với `{registration_id, status, payment_deadline?, amount?}`. |
| 29 | `GET` | `/students/me/registrations` | `STUDENT` | FR-F04-006 | **Lịch sử đăng ký của sinh viên.** SQL luôn bao gồm `WHERE student_id = jwt.sub` (IDOR). Trả danh sách Registration kèm thông tin Workshop, Ticket (nếu CONFIRMED). Hỗ trợ filter: `?status=CONFIRMED\|PENDING_PAYMENT\|CANCELLED`. |
| 30 | `GET` | `/students/me/registrations/{registration_id}` | `STUDENT` | FR-F04-006 | **Chi tiết một đơn đăng ký.** IDOR protection. Kèm Workshop detail, Payment status, Ticket nếu có. |
| 31 | `DELETE` | `/registrations/{registration_id}` | `STUDENT` | FR-F04-005, FR-F06-003 | **Hủy đăng ký.** IDOR protection: kiểm tra `registration.student_id = jwt.sub` — trả `404` (không `403`) nếu không phải của mình (không lộ sự tồn tại). Cascade: `INCR seat:available:{wid}` + `DEL seat:lock:{wid}:{reg_id}` + Ticket `VOID` + đẩy event `REGISTRATION_CANCELLED` vào Queue. Trả `404` nếu Registration đã `CANCELLED`. |

---

## Module F05 — Payment Processing

**Mục tiêu:** Thanh toán an toàn với Idempotency 2 lớp (Redis + DB), Circuit Breaker, Fail-Fast tại DB với Pessimistic Lock.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 32 | `POST` | `/payments` | `STUDENT` | FR-F05-001, FR-F05-002, FR-F05-005 | **Khởi tạo giao dịch thanh toán.** Header bắt buộc: `X-Idempotency-Key`. Body: `{registration_id, gateway: VNPAY\|MOMO\|STRIPE}`. **Luồng:** (1) Kiểm tra SeatLock còn TTL — trả `409 SEAT_LOCK_EXPIRED` nếu hết 15 phút; (2) Layer 1 Idempotency: `SET NX idempotency:{key} EX 86400` — trả kết quả cũ nếu key đã tồn tại (chống double-charge); (3) Kiểm tra Circuit Breaker `circuit:payment:{gateway}` — trả `503` với Graceful Degradation message nếu `OPEN`; (4) Tạo `payments` record với `SELECT...FOR UPDATE` (Lock Wait Timeout 3s) — trả `503 SYSTEM_OVERLOADED` nếu timeout; (5) Gọi Payment Gateway, trả về `{payment_id, redirect_url, payment_deadline}`. |
| 33 | `POST` | `/webhooks/payment/{gateway}` | `PUBLIC` (HMAC) | FR-F05-003, FR-F05-004 | **Callback từ Payment Gateway.** Xác thực bằng chữ ký HMAC (không phải JWT). Body: response JSON từ gateway (gateway_txn_id, status). **Nếu SUCCESS:** chạy 1 ACID Transaction: `Payment = SUCCESS` + `Registration = CONFIRMED` + `DEL seat:lock` + `confirmed_count++` + phát Ticket + đẩy event `PAYMENT_SUCCESS` vào Queue. **Nếu FAILED:** `Payment = FAILED` + `INCR seat:available` + đẩy event `PAYMENT_FAILED`. Cập nhật Circuit Breaker state sau mỗi lần gọi (FR-F05-004). |
| 34 | `GET` | `/students/me/payments` | `STUDENT` | FR-F05-001 | **Lịch sử giao dịch.** SQL với `WHERE student_id = jwt.sub` (IDOR). Trả `payment_id`, `amount`, `status`, `gateway`, `initiated_at`, `completed_at`. |
| 35 | `GET` | `/students/me/payments/{payment_id}` | `STUDENT` | FR-F05-001 | **Chi tiết giao dịch.** IDOR protection. Dùng để hiển thị kết quả sau khi sinh viên redirect về từ Payment Gateway. |

---

## Module F06 — Ticket & QR Code

**Mục tiêu:** Phát hành vé điện tử độc lập với Registration, hỗ trợ render QR cho Student và pre-load offline cho CheckinStaff.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 36 | `GET` | `/students/me/tickets` | `STUDENT` | FR-F06-002 | **Danh sách vé của sinh viên.** SQL với `WHERE student_id = jwt.sub` (IDOR). Trả các Ticket `ACTIVE` kèm `qr_token` (Signed JWT) để Client render QR Code. Kèm thông tin Workshop (title, starts_at, room). |
| 37 | `GET` | `/students/me/tickets/{ticket_id}` | `STUDENT` | FR-F06-002 | **Chi tiết vé.** IDOR protection. Trả `qr_token`, `status`, `issued_at`, Workshop detail. Dùng trên trang "Vé của tôi". |

---

## Module F07 — Check-in (Online & Offline)

**Mục tiêu:** Pre-load danh sách vé về SQLite, quét QR online/offline, đồng bộ idempotent khi có mạng.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 38 | `GET` | `/checkin/workshops/{workshop_id}/tickets` | `CHECKIN_STAFF` | FR-F07-001 | **Pre-load danh sách Ticket (Online).** Middleware kiểm tra `workshop_id` có nằm trong `jwt.allowed_workshop_ids` — trả `403 WORKSHOP_NOT_IN_SCOPE` nếu không. Chỉ trả Ticket `status = ACTIVE` (giảm payload, bảo mật). Response: `[{ticket_id, qr_token, student_name, student_code}]`. Mobile App lưu vào SQLite local để dùng offline. |
| 39 | `POST` | `/checkin/scan` | `CHECKIN_STAFF` | FR-F07-002 | **Quét QR Online.** Body: `{qr_token, workshop_id}`. Kiểm tra scope JWT. Lookup `qr_token` qua index `idx_tickets_qr_token`. **Kết quả có thể:** (a) Ticket `ACTIVE` + chưa check-in → Tạo `checkin_records` (`source = ONLINE`) + trả `200 OK` với student info; (b) Ticket `VOID` → `409 TICKET_VOIDED`; (c) Đã check-in → `409 ALREADY_CHECKED_IN`. |
| 40 | `POST` | `/checkin/sync` | `CHECKIN_STAFF` | FR-F07-004, FR-F07-005 | **Đồng bộ dữ liệu Check-in Offline (Batch).** Body: `[{local_id, qr_token, workshop_id, checked_in_at, device_id}]`. Server thực thi `INSERT INTO checkin_records ON CONFLICT (ticket_id, workshop_id) DO NOTHING` — idempotency tuyệt đối (sync lại nhiều lần không sinh bản ghi trùng). Trả về `{synced: N, skipped: M, conflicts: [{local_id, reason}]}`. Ticket bị `VOID` trước khi sync → ghi `sync_status = CONFLICT`. |
| 41 | `GET` | `/checkin/workshops/{workshop_id}/status` | `CHECKIN_STAFF` | FR-F07-002 | **Trạng thái check-in của Workshop.** Tổng số đã check-in, số còn lại, danh sách gần nhất. Phục vụ Dashboard realtime tại cửa. |

---

## Module F08 — Notification

**Mục tiêu:** Kiến trúc Event-Driven — luồng nghiệp vụ chính đẩy event vào Queue, Notification Worker gửi bất đồng bộ.

> **Lưu ý thiết kế:** Module này không có HTTP endpoint công khai cho luồng gửi — việc dispatch thông báo hoàn toàn do Worker nội bộ xử lý. Các endpoint sau phục vụ cấu hình và audit.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 42 | `GET` | `/admin/notifications/logs` | `ORGANIZER` | FR-F08-002 | **Lịch sử gửi thông báo (Audit Trail).** Trả danh sách `notification_logs` với `status` (PENDING / SENT / FAILED), `channel`, `type`, `sent_at`, `error_message`. Hỗ trợ filter: `?workshop_id=&status=&channel=&page=&limit=`. |
| 43 | `GET` | `/admin/notifications/logs/{notification_id}` | `ORGANIZER` | FR-F08-002 | **Chi tiết một bản ghi thông báo.** Trả `payload` đầy đủ đã gửi (nội dung email/push) để debug. |
| 44 | `GET` | `/admin/notifications/channels` | `ORGANIZER` | FR-F08-002 | **Cấu hình kênh thông báo.** Trả danh sách `notification_channel_configs` (APP / EMAIL / TELEGRAM) với `is_active`. |
| 45 | `PATCH` | `/admin/notifications/channels/{channel_type}` | `ORGANIZER` | FR-F08-002 | **Bật/tắt kênh thông báo.** Body: `{is_active, config_json?}`. Cho phép tắt kênh EMAIL và bật TELEGRAM mà không cần thay đổi code (Externalized Config). |

---

## Module F09 — Student Data Synchronization

**Mục tiêu:** Import dữ liệu sinh viên từ CSV (Batch-Sequential), Upsert theo `student_code`, ghi log chi tiết cho từng dòng lỗi.

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 46 | `POST` | `/admin/student-sync` | `ORGANIZER` | FR-F09-001 | **Kích hoạt CSV Import Job (thủ công).** Body: `{source_file_name}` (đường dẫn file trong S3/MinIO). Tạo `student_sync_jobs` với `status = RUNNING`. **Trả `202 Accepted` ngay** + `{job_id}` — job chạy bất đồng bộ ngầm. Không block request. |
| 47 | `GET` | `/admin/student-sync` | `ORGANIZER` | FR-F09-001 | **Lịch sử các lần sync.** Danh sách `student_sync_jobs` sắp xếp theo `triggered_at DESC`. Kèm `total_rows`, `processed_rows`, `error_rows`, `status`. |
| 48 | `GET` | `/admin/student-sync/{job_id}` | `ORGANIZER` | FR-F09-001, FR-F09-002 | **Chi tiết tiến trình Sync.** Trả `status`, số dòng đã xử lý, số lỗi. Organizer poll endpoint này để biết tiến độ. |
| 49 | `GET` | `/admin/student-sync/{job_id}/errors` | `ORGANIZER` | FR-F09-002 | **Danh sách dòng lỗi.** Trả `student_sync_errors`: `row_number`, `raw_data`, `error_reason` (DUPLICATE / INVALID_FORMAT / MISSING_FIELD), `error_detail`. Dùng để Organizer debug file CSV và fix dữ liệu trước lần Sync tiếp theo. |

---

## Module F10 — Background Jobs & Staff Management

**Mục tiêu:** Phân công nhân sự, quản lý trạng thái Background Jobs (chỉ expose endpoint giám sát — Jobs tự chạy theo Cron).

| # | Method | Endpoint | Phân quyền | FR Mapping | Mô tả chức năng |
|---|:---:|---|:---:|---|---|
| 50 | `POST` | `/admin/checkin-staff/{user_id}/assign-workshops` | `ORGANIZER` | FR-F10-004 | **Phân công Workshop cho Check-in Staff.** Body: `{workshop_ids: []}`. Cập nhật assignment table trong DB. **Tính Eventual Consistency:** thay đổi chỉ có hiệu lực ở JWT tiếp theo sau khi nhân sự logout/login lại. Response bao gồm cảnh báo: `{"warning": "Nhân sự cần đăng xuất và đăng nhập lại để nhận quyền mới"}`. |
| 51 | `GET` | `/admin/checkin-staff/{user_id}/workshops` | `ORGANIZER` | FR-F10-004 | **Danh sách Workshop được phân công.** Kiểm tra assignment hiện tại của một nhân sự. |
| 52 | `GET` | `/admin/system/jobs/payment-timeout` | `ORGANIZER` | FR-F10-001 | **Giám sát Payment Timeout Job.** Trả số lượng `payments` đang `PENDING` quá hạn hiện tại, thời điểm chạy lần cuối, số bản ghi đã xử lý trong 24h. Job tự chạy mỗi 1 phút bởi Cron. |
| 53 | `GET` | `/admin/system/jobs/reconciliation` | `ORGANIZER` | FR-F10-002 | **Giám sát Reconciliation Job.** Trả trạng thái đồng bộ giữa Redis counter và PostgreSQL `workshop_slots`. Hiển thị độ lệch nếu có, thời điểm reconcile cuối. Job tự chạy mỗi 10 phút. |
| 54 | `GET` | `/admin/system/circuit-breaker` | `ORGANIZER` | FR-F10-003 | **Trạng thái Circuit Breaker.** Đọc Redis Hash `circuit:payment:{gateway}` cho tất cả gateway. Trả: `{gateway, state: CLOSED\|OPEN\|HALF_OPEN, failure_count, opened_at, last_attempt}`. Dùng để giám sát sức khỏe tích hợp thanh toán. |
| 55 | `POST` | `/admin/system/circuit-breaker/{gateway}/reset` | `ORGANIZER` | FR-F10-003 | **Reset Circuit Breaker thủ công.** Force chuyển state về `CLOSED`, `failure_count = 0`. Dùng khi đã xác nhận cổng thanh toán đã phục hồi nhưng Canary Request chưa tự trigger được. |

---

## Tổng quan Endpoint Map

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/workshops
GET    /api/v1/workshops/{workshop_id}

GET    /api/v1/students/me/registrations
GET    /api/v1/students/me/registrations/{registration_id}
GET    /api/v1/students/me/tickets
GET    /api/v1/students/me/tickets/{ticket_id}
GET    /api/v1/students/me/payments
GET    /api/v1/students/me/payments/{payment_id}

POST   /api/v1/registrations
DELETE /api/v1/registrations/{registration_id}

POST   /api/v1/payments
POST   /api/v1/webhooks/payment/{gateway}

POST   /api/v1/checkin/scan
POST   /api/v1/checkin/sync
GET    /api/v1/checkin/workshops/{workshop_id}/tickets
GET    /api/v1/checkin/workshops/{workshop_id}/status

GET    /api/v1/admin/users
GET    /api/v1/admin/users/{user_id}
PATCH  /api/v1/admin/users/{user_id}/status
POST   /api/v1/admin/users/{user_id}/revoke-token

GET    /api/v1/admin/workshops
GET    /api/v1/admin/workshops/{workshop_id}
POST   /api/v1/admin/workshops
PUT    /api/v1/admin/workshops/{workshop_id}
POST   /api/v1/admin/workshops/{workshop_id}/publish
PATCH  /api/v1/admin/workshops/{workshop_id}/emergency-update
POST   /api/v1/admin/workshops/{workshop_id}/cancel
GET    /api/v1/admin/workshops/{workshop_id}/stats
POST   /api/v1/admin/workshops/{workshop_id}/documents
GET    /api/v1/admin/workshops/{workshop_id}/documents

GET    /api/v1/admin/documents/{document_id}/summary
POST   /api/v1/admin/documents/{document_id}/ai-retry
DELETE /api/v1/admin/documents/{document_id}

GET    /api/v1/admin/rooms
POST   /api/v1/admin/rooms
GET    /api/v1/admin/speakers
POST   /api/v1/admin/speakers

GET    /api/v1/admin/notifications/logs
GET    /api/v1/admin/notifications/logs/{notification_id}
GET    /api/v1/admin/notifications/channels
PATCH  /api/v1/admin/notifications/channels/{channel_type}

POST   /api/v1/admin/student-sync
GET    /api/v1/admin/student-sync
GET    /api/v1/admin/student-sync/{job_id}
GET    /api/v1/admin/student-sync/{job_id}/errors

POST   /api/v1/admin/checkin-staff/{user_id}/assign-workshops
GET    /api/v1/admin/checkin-staff/{user_id}/workshops

GET    /api/v1/admin/system/jobs/payment-timeout
GET    /api/v1/admin/system/jobs/reconciliation
GET    /api/v1/admin/system/circuit-breaker
POST   /api/v1/admin/system/circuit-breaker/{gateway}/reset
```

---

## Bảng tổng hợp phân quyền

| Endpoint Group | PUBLIC | STUDENT | ORGANIZER | CHECKIN_STAFF |
|---|:---:|:---:|:---:|:---:|
| `GET /workshops`, `GET /workshops/{id}` | ✅ | ✅ | ✅ | ✅ |
| `/auth/*` | ✅ (login/refresh) | ✅ | ✅ | ✅ |
| `/students/me/*` | — | ✅ | — | — |
| `/registrations` POST/DELETE | — | ✅ | — | — |
| `/payments` POST | — | ✅ | — | — |
| `/webhooks/payment/*` | ✅ (HMAC) | — | — | — |
| `/checkin/*` | — | — | — | ✅ |
| `/admin/workshops/*` | — | — | ✅ | — |
| `/admin/documents/*` | — | — | ✅ | — |
| `/admin/notifications/*` | — | — | ✅ | — |
| `/admin/student-sync/*` | — | — | ✅ | — |
| `/admin/checkin-staff/*` | — | — | ✅ | — |
| `/admin/system/*` | — | — | ✅ | — |
| `/admin/users/*` | — | — | ✅ | — |
| `/admin/rooms`, `/admin/speakers` | — | — | ✅ | — |

---

## Ghi chú kỹ thuật đặc thù

### 1. Endpoint `/registrations` (POST) — Critical Path

Đây là endpoint chịu tải cao nhất của hệ thống (12.000 CCU, 7.200 req trong 3 phút đầu). Thứ tự kiểm tra phải tuân thủ nghiêm ngặt để tối ưu độ trễ và tránh sụp đổ:

```
[1] Token Bucket (Redis) → 429 nếu hết token
[2] DECR seat:available:{wid} (Redis) → 409 nếu kết quả < 0
[3] UNIQUE check (DB) → 409 nếu đã đăng ký
[4a] FREE: INSERT registration CONFIRMED + issue ticket (1 transaction)
[4b] PAID: INSERT registration PENDING + SET seat:lock TTL=900 + sinh idempotency_key
```

Bước [1] và [2] hoàn toàn trên Redis (< 1ms), loại bỏ 99% request không hợp lệ trước khi chạm PostgreSQL. Chỉ request vượt qua [2] mới đi vào DB với `SELECT...FOR UPDATE` (Lock Wait Timeout = 3s).

### 2. Endpoint `/webhooks/payment/{gateway}` — Idempotency

Webhook từ Payment Gateway không dùng JWT. Thay vào đó:

- Xác thực bằng HMAC checksum trong header (mỗi gateway có secret riêng)
- Idempotency được bảo đảm 2 lớp: Redis `SET NX` (Layer 1) + PostgreSQL `UNIQUE(idempotency_key)` (Layer 2)
- Toàn bộ update Payment + Registration + Ticket + INCR/DEL Redis diễn ra trong **1 ACID Transaction**

### 3. Endpoint `/checkin/sync` (POST) — Offline Idempotency

Server sử dụng `INSERT INTO checkin_records (...) ON CONFLICT (ticket_id, workshop_id) DO NOTHING`. Điều này đảm bảo Mobile App có thể gọi endpoint này bao nhiêu lần cũng an toàn — không bao giờ sinh bản ghi trùng lặp. Cột `source` được set `OFFLINE_SYNC` để phân biệt với check-in online.

### 4. Phân biệt `/admin/workshops/{id}/publish` vs `/admin/workshops/{id}/emergency-update`

- **`/publish`**: Chuyển DRAFT → PUBLISHED. **Side effect quan trọng:** Khởi tạo Redis counter. Chỉ chạy 1 lần.
- **`/emergency-update`**: Chỉ cập nhật `room_id`/`starts_at`/`ends_at`. **Không** đụng Redis counter. Chạy được nhiều lần khi Workshop đã PUBLISHED. Trả HTTP 200 ngay, thông báo gửi bất đồng bộ qua Queue.
