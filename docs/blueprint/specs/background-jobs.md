# Đặc tả: Hệ thống Background Jobs

## Mô tả

Hệ thống xử lý nền (background jobs) bao gồm 5 subsystem chạy bất đồng bộ qua BullMQ job queue và cron schedule: (1) Payment timeout — tự động hết hạn thanh toán quá hạn, (2) Seat reconciliation — giám sát độ lệch seat counter giữa Redis và DB, (3) Circuit breaker recovery — tự động chuyển OPEN sang HALF_OPEN sau cooldown, (4) AI Summary pipeline — tóm tắt nội dung workshop qua LLM, (5) Student CSV sync — nhập dữ liệu sinh viên hàng loạt từ file CSV. Tất cả notification được dispatch bất đồng bộ qua BullMQ `notification` queue với Strategy pattern.

## Luồng chính

### 1. Payment Timeout Cron (mỗi 1 phút)

**Schedule:** Chạy mỗi 60 giây.

**Luồng xử lý:**
1. Query tất cả payments có `status = PENDING` và `timeout_at < NOW()`
2. Với mỗi payment quá hạn, gọi `PaymentsService.expirePayment()` để thực hiện nguyên tử:
   - Chuyển payment `status = TIMEOUT`
   - Chuyển registration `status = CANCELLED`
   - Xóa Redis seat lock: `seat:lock:{wid}:{rid}` (DEL)
   - Tăng seat counter: INCR `seat:available:{wid}`
   - Phát hành event `PAYMENT_FAILED`
3. Log tổng số payment đã xử lý
4. Lỗi trên từng payment được isolated — không crash toàn bộ batch

### 2. Seat Reconciliation Cron (mỗi 10 phút)

**Schedule:** Chạy mỗi 600 giây.

**Luồng xử lý:**
1. Lấy danh sách tất cả workshop có `status = PUBLISHED`
2. Với mỗi workshop, so sánh:
   - Redis: `GET seat:available:{workshopId}`
   - DB: `workshop.capacity - workshopSlots.confirmedCount - workshopSlots.lockedCount`
3. Tính độ lệch tuyệt đối (absolute difference)
4. Nếu độ lệch > 5: log warning với workshop ID, giá trị Redis, giá trị kỳ vọng, kích thước độ lệch
5. Workshop không ở trạng thái PUBLISHED (DRAFT, CANCELLED, COMPLETED) bị bỏ qua
6. **READ-ONLY:** Hệ thống KHÔNG tự động sửa lỗi — chỉ ghi log warning

### 3. Circuit Breaker Recovery Monitor (mỗi 30 giây)

**Schedule:** Chạy mỗi 30 giây.

**Luồng xử lý:**
1. Kiểm tra tất cả payment gateway đã biết (VNPAY, MOMO, STRIPE)
2. Với mỗi gateway có state = OPEN:
   - Tính thời gian đã trôi qua từ `opened_at`
   - Nếu `(now - opened_at) >= 30 giây`: chuyển state sang HALF_OPEN, log transition
   - Nếu chưa đủ 30 giây: bỏ qua, không action
3. Gateway ở trạng thái CLOSED hoặc HALF_OPEN: bỏ qua

### 4. AI Summary Pipeline

**Queue:** `ai-summary`

**5 giai đoạn xử lý:**

| Giai đoạn | Mô tả |
|-----------|-------|
| 1. Upsert record | Tạo/PENDING record trong `ai_summaries` trước khi xử lý |
| 2. Extract PDF text | Đọc nội dung từ file PDF của document |
| 3. Clean text | Chuẩn hóa whitespace, xuống dòng; truncate tại 8000 ký tự |
| 4. Generate LLM summary | Gọi LLM để tóm tắt nội dung, timeout 40 giây |
| 5. Save result | Lưu kết quả tóm tắt vào `ai_summaries`, set status = DONE |

**Trigger:** Tự động khi document được upload thành công → tạo `ai_summary` record với `status = PENDING` → enqueue job.

**Retry:**
- Lỗi transient: retry tối đa 3 lần, exponential backoff bắt đầu từ 10s
- Timeout LLM (> 40s): set status = FAILED, không retry
- Hết retry: set status = FAILED với error message gốc

**Admin retry:** `POST /admin/workshops/{id}/documents/{documentId}/retry-summary` — chỉ retry được record FAILED, nếu không FAILED thì trả về lỗi BUSINESS.

**Hiển thị public:**
- DONE: WorkshopDetailDto bao gồm `ai_summary` với `summary_text`, `model_used`, `generated_at`
- PENDING/PROCESSING: WorkshopDetailDto bao gồm `ai_summary` với status nhưng không có `summary_text`
- Không có summary: WorkshopDetailDto không có trường `ai_summary`

### 5. Student CSV Sync Pipeline

**Queue:** `student-sync`

**Endpoint trigger:** `POST /admin/student-sync`

**Luồng:**
1. ORGANIZER gửi `source_file_name` (1-500 ký tự)
2. Tạo `student_sync_jobs` record với `status = RUNNING`
3. Enqueue job vào `student-sync` queue
4. Trả về HTTP 202: `{ job_id, status: "RUNNING", triggered_at }`
5. File existence không được validate ở endpoint — defer cho worker

**Worker xử lý:**
1. Đọc file CSV từ Object Storage
2. Với mỗi dòng CSV:
   - Validate: `student_code` (required, max 20 chars), `email` (required, valid format), `full_name` (required)
   - UPSERT vào bảng `students` theo `student_code`:
     - Match key: `student_code` (unique constraint `uq_students_student_code`)
     - On conflict: UPDATE `full_name`, `email_edu`, `faculty`, `class_year`, `last_synced_at`
     - On no conflict: INSERT tất cả fields + `last_synced_at = NOW()`
   - Lỗi validation/upsert: ghi vào `student_sync_errors` (không dừng job)
3. Xác định final status:
   - `errorRows === 0`: SUCCESS
   - `0 < errorRows < totalRows`: PARTIAL_FAILURE
   - `errorRows === totalRows`: FAILED

**Endpoints admin:**
- `GET /admin/student-sync` — danh sách jobs (phân trang, DESC theo triggered_at)
- `GET /admin/student-sync/:jobId` — chi tiết job (status, total_rows, processed_rows, error_rows)
- `GET /admin/student-sync/:jobId/errors` — danh sách lỗi (phân trang ASC theo row_number)

### 6. Notification Dispatch

**Queue:** `notification`

**Strategy pattern:**
- Mỗi kênh là một `@Injectable()` class implement `INotificationChannel`
- Hiện tại: EMAIL, TELEGRAM, APP (dễ mở rộng — thêm file mới + đăng ký, không sửa code cũ)

**Luồng dispatch:**
1. Worker nhận job từ `notification` queue
2. Tra cứu channel config (`is_active`?)
3. Nếu inactive: set status = FAILED "Channel is inactive", không retry
4. Nếu active: gọi channel adapter tương ứng
5. Thành công: `notification_logs.status = SENT`, `sent_at = NOW()`
6. Thất bại: `notification_logs.status = FAILED`, ghi error message, retry với backoff (5s-10s-20s-40s-80s) tối đa 5 lần
7. Unknown channel type: FAILED, không retry

**Admin endpoints:**
- `GET /admin/notifications/logs` — danh sách log (filter: status, channel, type, user, workshop)
- `GET /admin/notifications/logs/:id` — chi tiết log kèm payload
- `GET /admin/notifications/channels` — danh sách cấu hình kênh
- `PATCH /admin/notifications/channels/{type}` — cập nhật cấu hình kênh (bật/tắt)

### 7. Queue Infrastructure

**3 BullMQ queues:**

| Queue | Job Data | Mục đích |
|-------|----------|----------|
| `notification` | `NotificationJobData` (notificationId, type, channel, recipient, payload) | Gửi thông báo |
| `ai-summary` | `AiSummaryJobData` (documentId, workshopId, fileUrl) | Tóm tắt AI |
| `student-sync` | `StudentSyncJobData` (jobId, sourceFileName) | Import CSV |

**Default job options:**
- `removeOnComplete`: age 3600s (1 giờ)
- `removeOnFail`: age 86400s (24 giờ)
- `attempts`: 1 (mặc định; worker có thể override)

**Event contracts (typed interfaces):**
- `PaymentEventData` — paymentId, registrationId, studentId, workshopId, amount, gateway, eventType
- `WorkshopCancelledEventData` — workshopId, title, cancelledAt
- `WorkshopUpdatedEventData` — workshopId, changes

**SharedQueueModule:**
- Kết nối: `REDIS_URL` (dùng chung với RedisService)
- Export `BullModule` để module khác dùng `@InjectQueue()`
- Không phải `@Global()` — module nào cần queue phải import `SharedQueueModule` explicitly
- `BackgroundModule` import `SharedQueueModule` để worker dùng `@Processor`

## Kịch bản lỗi

### Payment timeout — lỗi xử lý từng payment
- Một payment expire thất bại → error được log, cron tiếp tục xử lý payments còn lại
- Không crash toàn bộ batch

### Seat reconciliation — Redis key không tồn tại
- Redis miss → fallback đọc DB, ghi nhận discrepancy
- Workshop không PUBLISHED → bỏ qua, không warning

### Circuit breaker — gateway không tồn tại
- Chỉ kiểm tra 3 gateway đã biết (VNPAY, MOMO, STRIPE)
- Gateway lạ bị bỏ qua

### AI Summary — LLM timeout
- LLM gọi quá 40 giây → FAILED, không retry
- Text quá 8000 ký tự → truncate trước khi gửi LLM

### AI Summary — retry hết
- Cả 3 lần retry đều thất bại → FAILED với error message gốc
- Admin có thể retry thủ công qua endpoint

### Student CSV — toàn bộ dòng fail
- Không có dòng nào pass validation → final status = FAILED
- Tất cả lỗi được ghi vào `student_sync_errors`

### Student CSV — file không tồn tại
- HTTP 202 trả về ngay, worker xử lý và set status = FAILED (khi không đọc được file)

### Notification — channel inactive
- Channel config `is_active = false` → FAILED, không retry (terminal failure)

### Notification — unknown channel
- Không có adapter registered → FAILED, không retry

### Notification — retry hết 5 lần
- Cả 5 lần (5s-10s-20s-40s-80s) đều thất bại → FAILED terminal
- Admin có thể tra cứu log để debug

## Ràng buộc

### Schedule & Timing
- Payment timeout cron: mỗi 1 phút
- Seat reconciliation cron: mỗi 10 phút
- Circuit breaker recovery: mỗi 30 giây
- LLM timeout: 40 giây
- Circuit breaker cooldown: 30 giây (OPEN → HALF_OPEN)

### Retry & Backoff
- AI Summary: tối đa 3 lần, backoff từ 10s (exponential)
- Notification: tối đa 5 lần, backoff (5s-10s-20s-40s-80s)
- Student CSV: không retry — lỗi ghi vào `student_sync_errors`
- Payment timeout cron: lỗi từng payment không ảnh hưởng batch

### Bảo mật
- Tất cả admin endpoint yêu cầu role ORGANIZER
- STUDENT hoặc CHECKIN_STAFF truy cập `/admin/` → HTTP 403 FORBIDDEN
- AI Summary: public chỉ thấy `summary_text` khi status DONE; admin thấy cả `error_message`

### Queue & Job
- 3 queues: `notification`, `ai-summary`, `student-sync`
- Tất cả queue name unique (không trùng)
- Job completed: auto-remove sau 1 giờ
- Job failed: auto-remove sau 24 giờ
- Event contracts phải align với DB enum values

### Tính nhất quán
- Seat reconciliation: **READ-ONLY** — không auto-fix, chỉ warning khi drift > 5
- Student CSV upsert: `student_code` là match key, unique constraint đảm bảo không duplicate
- AI Summary: unique constraint trên `document_id` — mỗi document chỉ một summary
- Notification: inactive channel không retry — tránh spam log
- Payment timeout cron: expirePayment() thực hiện atomic transition (payment + registration + Redis)

## Tiêu chí chấp nhận

1. **Payment timeout cron:**
   - Payment PENDING với `timeout_at < NOW()` bị expire trong vòng < 60 giây
   - Registration chuyển CANCELLED, seat lock xóa, seat counter tăng
   - Lỗi 1 payment không ảnh hưởng payment khác trong cùng batch

2. **Seat reconciliation cron:**
   - Chạy mỗi 10 phút, so sánh Redis counter vs DB cho tất cả PUBLISHED workshop
   - Drift > 5 → warning log có workshop ID, Redis value, expected value
   - Không auto-fix dù drift bao nhiêu

3. **Circuit breaker recovery:**
   - Circuit OPEN quá 30 giây → tự động chuyển HALF_OPEN
   - Circuit OPEN dưới 30 giây → không action
   - CLOSED/HALF_OPEN → không action

4. **AI Summary pipeline:**
   - Document upload → `ai_summaries` record PENDING → worker xử lý → DONE
   - LLM timeout > 40s → FAILED (không retry)
   - Lỗi transient → retry 3 lần; hết retry → FAILED
   - Text > 8000 ký tự → truncate trước LLM
   - Public chỉ thấy summary_text khi DONE; admin thấy cả error_message
   - Admin retry được record FAILED; không retry được record non-FAILED

5. **Student CSV sync:**
   - `POST /admin/student-sync` → HTTP 202 kèm `job_id`
   - Worker upsert students theo `student_code`, ghi lỗi từng dòng
   - Final status: SUCCESS / PARTIAL_FAILURE / FAILED đúng logic
   - `GET /admin/student-sync` và `GET /admin/student-sync/:jobId` trả về đúng metadata
   - `GET /admin/student-sync/:jobId/errors` trả về danh sách lỗi phân trang

6. **Notification dispatch:**
   - Business event → enqueue notification job → worker dispatch → log SENT/FAILED
   - Retry backoff đúng (5s-10s-20s-40s-80s), tối đa 5 lần
   - Channel inactive → FAILED, không retry
   - Unknown channel → FAILED, không retry
   - Admin xem được log và cập nhật channel config

7. **Queue infrastructure:**
   - 3 queues registered và accessible
   - SharedQueueModule khởi tạo không lỗi với REDIS_URL hợp lệ
   - Module không global — phải import explicit
   - BackgroundModule compile không circular dependency
