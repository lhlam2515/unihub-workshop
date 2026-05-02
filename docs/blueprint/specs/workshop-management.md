# Đặc tả: Quản lý Workshop

## Mô tả

Hệ thống quản lý vòng đời đầy đủ của workshop: từ tạo mới (DRAFT), xuất bản (PUBLISHED), cập nhật khẩn cấp, hủy bỏ (CANCELLED), đến tự động hoàn thành (COMPLETED). Bao gồm quản lý phòng hội trường (Room), diễn giả (Speaker), kiểm tra xung đột lịch, đồng bộ tồn kho ghế qua Redis, và bộ API riêng cho Admin và Public.

## Luồng chính

### 1. Tạo Workshop (DRAFT)

- ORGANIZER gửi yêu cầu tạo workshop với các trường bắt buộc: `title`, `speaker_id`, `room_id`, `starts_at`, `ends_at`, `capacity`, `is_paid` (và `price` nếu `is_paid = true`).
- Hệ thống tạo bản ghi workshop với trạng thái mặc định là `DRAFT`.
- Đồng thời tạo bản ghi `workshop_slots` với `total_capacity = capacity`, `locked_count = 0`, `confirmed_count = 0`.
- Kiểm tra validation đầu vào:
  - `is_paid = true` nhưng không có `price` → từ chối.
  - `ends_at <= starts_at` → từ chối.
  - `capacity <= 0` → từ chối.
  - Phát hiện xung đột phòng: nếu `room_id` + khoảng thời gian trùng với workshop `PUBLISHED` khác → từ chối với lỗi `WORKSHOP_TIME_CONFLICT`. Các slot thời gian liền kề (kết thúc 10:00, bắt đầu 10:00) không được coi là xung đột (`ends_at` là ranh giới loại trừ).
- Phản hồi: `WorkshopAdminDetailDto` (bao gồm `confirmed_count`, `locked_count` từ `workshop_slots`).

### 2. Cập nhật Workshop (DRAFT)

- ORGANIZER chỉ có thể cập nhật workshop ở trạng thái `DRAFT`.
- Tất cả các trường trong `UpdateWorkshopDto` là tùy chọn (partial update).
- Nếu cập nhật `room_id`, `starts_at`, hoặc `ends_at` → kiểm tra lại xung đột phòng.
- Nếu cập nhật `is_paid` hoặc `price` → kiểm tra lại validation.
- Phản hồi: `WorkshopAdminDetailDto`.

### 3. Xuất bản Workshop (PUBLISH)

- ORGANIZER gọi `POST /admin/workshops/{id}/publish` để chuyển trạng thái từ `DRAFT` sang `PUBLISHED`.
- Khởi tạo Redis key `seat:available:{workshopId}` với giá trị = `capacity` (không có TTL, persistent để Booking module có thể atomically DECR).
- Nếu `workshop_slots` chưa tồn tại → tạo mới.
- Workshop đã `PUBLISHED` không thể publish lại → lỗi `BUSINESS`.
- Workshop đã `CANCELLED` không thể publish → lỗi `WORKSHOP_CANCELLED`.
- Phản hồi: `WorkshopAdminDetailDto`.

### 4. Hủy Workshop (CANCEL)

- ORGANIZER gọi `POST /admin/workshops/{id}/cancel` để hủy workshop.
- Chuyển trạng thái thành `CANCELLED`.
- Nếu workshop đang ở trạng thái `PUBLISHED`:
  - Xóa Redis key `seat:available:{workshopId}` (việc xóa là idempotent — nếu key không tồn tại, không raise lỗi).
  - **Void toàn bộ ticket** liên quan đến workshop: cập nhật trạng thái `VOID`, set `voided_at = now()`.
  - **Hủy toàn bộ registration** (chuyển trạng thái `CANCELLED`).
  - Enqueue event `WORKSHOP_CANCELLED` vào hàng đợi thông báo (gửi email/push/Telegram cho sinh viên đã đăng ký).
- Nếu workshop ở trạng thái `DRAFT`: chỉ chuyển trạng thái (không có Redis hay ticket nào để dọn).
- Workshop đã `CANCELLED` không thể hủy lại → lỗi `WORKSHOP_CANCELLED`.

### 5. Cập nhật khẩn cấp (Emergency Update)

- ORGANIZER gọi `PATCH /admin/workshops/{id}/emergency-update` để thay đổi `room_id`, `starts_at`, hoặc `ends_at` trên workshop `PUBLISHED`.
- Yêu cầu ít nhất một trong ba trường được cung cấp.
- Nếu `room_id` hoặc thời gian thay đổi → kiểm tra lại xung đột phòng.
- Nếu phát hiện xung đột → từ chối với lỗi `WORKSHOP_TIME_CONFLICT`.
- Chỉ áp dụng cho workshop `PUBLISHED`. Workshop `DRAFT` hoặc `CANCELLED` không được phép.

### 6. Broadcast thông báo cập nhật

- Sau khi emergency update thành công, hệ thống enqueue event `WORKSHOP_UPDATED` vào hàng đợi thông báo.
- Hệ thống gửi thông báo (email/push/Telegram) đến các sinh viên đã đăng ký workshop về sự thay đổi (phòng mới, giờ mới).

### 7. Tự động hoàn thành (Completion)

- Cron job chạy theo lịch `0 * * * *` (mỗi giờ một lần) thông qua `@nestjs/schedule`.
- Quét các workshop có trạng thái `PUBLISHED` và `ends_at < NOW()`.
- Chuyển trạng thái sang `COMPLETED`.
- Redis key `seat:available:{workshopId}` **không bị xóa** (`COMPLETED` là trạng thái hiển thị, không phải hủy — dữ liệu tồn kho vẫn cần cho thống kê).
- Idempotent: `DRAFT`, `CANCELLED`, `COMPLETED` không bị ảnh hưởng.
- Nếu có lỗi database, service trả `FailResult(INTERNAL_ERROR)`, cron log lỗi và thử lại ở lần chạy kế tiếp.

### 8. Quản lý phòng họp (Room CRUD)

- **Tạo phòng:** `POST /admin/rooms` với `name`, `building`, `floor`, `capacity > 0`, `facilities` (tùy chọn), `floor_plan_url` (tùy chọn).
- **Danh sách phòng:** `GET /admin/rooms` trả về mảng `RoomResponseDto`.
- **Cập nhật phòng:** `PUT /admin/rooms/{id}` — partial update, tất cả trường tùy chọn. Kiểm tra `capacity > 0` nếu được cung cấp.
- **Phát hiện xung đột:** `RoomConflictService.checkConflict(roomId, startsAt, endsAt)` kiểm tra xem có workshop `PUBLISHED` nào trong cùng phòng với khoảng thời gian chồng lấn không. Các slot liền kề (A kết thúc 10:00, B bắt đầu 10:00) không bị coi là xung đột.

### 9. Quản lý diễn giả (Speaker CRUD)

- **Tạo diễn giả:** `POST /admin/speakers` với `full_name` (bắt buộc), `title`, `bio`, `avatar_url` (tùy chọn).
- **Danh sách diễn giả:** `GET /admin/speakers` trả về mảng `SpeakerResponseDto`.
- **Cập nhật diễn giả:** `PUT /admin/speakers/{id}` — partial update. Nếu cập nhật `full_name` thì phải không được rỗng.

### 10. API Admin

- `GET /admin/workshops` — Danh sách tất cả workshop (mọi trạng thái), hỗ trợ phân trang và lọc theo status. Trả về `WorkshopAdminDetailDto` kèm `confirmed_count` và `locked_count`.
- `GET /admin/workshops/{id}` — Chi tiết workshop với các trường admin. Nếu không tồn tại → 404.
- `GET /admin/workshops/{id}/stats` — Thống kê: `confirmed_count`, `locked_count`, `available_seats` (từ Redis, fallback về DB), `total_capacity`.

### 11. API Public

- `GET /workshops` — Danh sách workshop `PUBLISHED`, hỗ trợ lọc theo `date_from`/`date_to` (theo `starts_at`) và `is_paid`. Mỗi kết quả kèm `available_seats` từ Redis seat counter. Phân trang.
- `GET /workshops/{id}` — Chi tiết workshop `PUBLISHED` với thông tin diễn giả, phòng họp, số ghế khả dụng từ Redis, và AI summary (nếu trạng thái là `DONE`). Workshop `DRAFT` hoặc `CANCELLED` → 404.

## Kịch bản lỗi

- **Xung đột lịch phòng:** ORGANIZER tạo/cập nhật/emergency-update workshop với phòng và thời gian trùng với workshop `PUBLISHED` khác → lỗi `WORKSHOP_TIME_CONFLICT`.
- **Validation form:** Thiếu trường bắt buộc (`is_paid = true` không có `price`; `ends_at <= starts_at`; `capacity <= 0`) → lỗi `VALIDATION_FAILED`.
- **Xuất bản workshop đã xuất bản:** Gọi publish trên workshop `PUBLISHED` → lỗi `BUSINESS`.
- **Xuất bản workshop đã hủy:** Gọi publish trên workshop `CANCELLED` → lỗi `WORKSHOP_CANCELLED`.
- **Hủy workshop đã hủy:** Gọi cancel trên workshop `CANCELLED` → lỗi `WORKSHOP_CANCELLED`.
- **Không tìm thấy workshop:** Admin/Public request workshop không tồn tại → lỗi `WORKSHOP_NOT_FOUND`.
- **Emergency update thiếu trường:** Gọi emergency-update mà không cung cấp `room_id`, `starts_at`, hoặc `ends_at` → lỗi `VALIDATION_FAILED`.
- **Emergency update trên workshop không phải PUBLISHED:** Gọi emergency-update cho `DRAFT`/`CANCELLED` → lỗi `BUSINESS` (chỉ `PUBLISHED` mới được phép).
- **Lỗi Database khi Completion Cron:** Kết nối DB thất bại → service trả `FailResult(INTERNAL_ERROR)`, cron log lỗi, thử lại ở lần chạy kế tiếp.
- **Phòng không tồn tại:** Cập nhật phòng với ID không hợp lệ → lỗi `ROOM_NOT_FOUND`.
- **Diễn giả không tồn tại:** Cập nhật diễn giả với ID không hợp lệ → lỗi `SPEAKER_NOT_FOUND`.
- **Tạo diễn giả thiếu full_name:** `full_name` là trường bắt buộc → lỗi `VALIDATION_FAILED`.
- **Cập nhật diễn giả với full_name rỗng:** `full_name` phải có ít nhất 1 ký tự → lỗi `VALIDATION_FAILED`.
- **Tạo phòng với capacity <= 0:** Dung lượng phòng phải là số dương → lỗi `VALIDATION_FAILED`.

## Ràng buộc

- **Hiệu năng Redis:** Khởi tạo và đọc `seat:available:{workshopId}` phải hoàn thành trong < 50ms. Redis key không có TTL — persistent cho đến khi workshop bị hủy.
- **Kiểm tra xung đột:** `RoomConflictService.checkConflict()` luôn được gọi mỗi khi `room_id`, `starts_at`, hoặc `ends_at` thay đổi trên workshop `PUBLISHED`. Chỉ xét các workshop có status `PUBLISHED`.
- **Tính nhất quán:** `workshop_slots` (PostgreSQL) là nguồn sự thật cho `confirmed_count` và `locked_count`. Redis `seat:available` có thể lệch và được đồng bộ bởi reconciliation job chạy mỗi 10 phút.
- **Bảo mật:** Endpoint Admin yêu cầu vai trò `ORGANIZER`. Endpoint Public không yêu cầu xác thực (guest). IDOR prevention: student endpoints force `WHERE student_id = jwt.sub`.
- **Lũy đẳng:** Completion cron là idempotent — chạy nhiều lần không gây hại. Hủy workshop cũng idempotent.
- **Thông báo bất đồng bộ:** `WORKSHOP_CANCELLED` và `WORKSHOP_UPDATED` được enqueue vào BullMQ, không block request chính.
- **Partial Update:** API update (workshop, room, speaker) luôn dùng partial update — chỉ các trường được gửi lên mới thay đổi.

## Tiêu chí chấp nhận

- ORGANIZER tạo workshop DRAFT thành công với đầy đủ thông tin, `workshop_slots` được tạo với `total_capacity = capacity`.
- Hệ thống từ chối tạo workshop khi `ends_at <= starts_at` hoặc `is_paid = true` không có `price`.
- Hệ thống phát hiện xung đột phòng khi tạo/cập nhật workshop có thời gian trùng với workshop PUBLISHED khác.
- ORGANIZER publish workshop DRAFT thành công, Redis có key `seat:available:{id}` với giá trị đúng bằng capacity.
- ORGANIZER không thể publish workshop đã PUBLISHED hoặc CANCELLED.
- ORGANIZER hủy workshop PUBLISHED thành công: Redis key bị xóa, ticket bị void, registration bị cancel.
- ORGANIZER emergency-update workshop PUBLISHED (đổi phòng/giờ) thành công, có kiểm tra lại xung đột.
- Cron completion tự động chuyển workshop PUBLISHED có `ends_at < NOW()` sang COMPLETED trong vòng 1 giờ.
- Workshop `DRAFT`, `CANCELLED`, `COMPLETED` không bị ảnh hưởng bởi completion cron.
- API Admin trả về workshop ở mọi trạng thái, API Public chỉ trả về workshop PUBLISHED.
- `GET /admin/workshops/{id}/stats` trả về đầy đủ `confirmed_count`, `locked_count`, `available_seats`, `total_capacity`.
- Quản lý phòng: tạo, sửa, xem danh sách thành công; phát hiện xung đột với slot liền kề không bị ảnh hưởng.
- Quản lý diễn giả: tạo với `full_name` bắt buộc, cập nhật partial thành công.
