# Đặc tả: Check-in tại sự kiện (Offline-First)

## Mô tả

Ứng dụng Mobile App dành riêng cho nhân sự (`CHECKIN_STAFF`) dùng để quét mã QR điểm danh tại cửa hội trường. Hệ thống được thiết kế theo kiến trúc Offline-First, đảm bảo việc quét mã QR diễn ra tức thì (không độ trễ) ngay cả khi thiết bị mất kết nối mạng hoàn toàn, và tự động đồng bộ dữ liệu an toàn lên Server khi có mạng trở lại.

Mỗi ticket được phát hành dưới dạng **QR token là Signed JWT**: `{ ticket_id, workshop_id, student_id, exp }` — được ký số (HMAC hoặc RSA) để mobile có thể xác thực tính hợp lệ ngay khi offline mà không cần gọi Server, đảm bảo chống giả mạo mã QR.

## Luồng chính

1. **Tiền tải dữ liệu vé (Pre-load — Online):**
   - Nhân sự đăng nhập khi thiết bị có mạng.
   - JWT Access Token (cấu hình hạn đặc biệt 8 giờ) được lưu vào Keychain/Secure Storage của thiết bị.
   - App gọi `GET /checkin/workshops/:id/tickets` để tải danh sách ticket có trạng thái `ACTIVE` (chưa điểm danh) thuộc quyền `allowed_workshop_ids` trong JWT.
   - Endpoint bị kiểm soát bởi **WorkshopScopeGuard** — nếu workshop_id không nằm trong danh sách được phân quyền, trả về 403.
   - Cache metadata tại mobile có **ngưỡng STALE 30 phút**: nếu dữ liệu đã tải quá 30 phút, App tự động refresh ngầm khi có mạng.
   - Hỗ trợ **ETag**: Server trả về ETag trong header, mobile gửi `If-None-Match` ở lần yêu cầu sau. Nếu dữ liệu không thay đổi, Server trả về 304 Not Modified, giảm băng thông.
   - Nếu workshop không có registration nào, endpoint trả về mảng rỗng (không phải 404).

2. **Xác thực QR Token ngoại tuyến (Offline Validation):**
   - Khi mất mạng, App tự giải mã Signed JWT cục bộ để xác thực:
     - Chữ ký số (signature) còn hợp lệ.
     - `exp` chưa hết hạn.
     - `workshop_id` trong token khớp với workshop đang quét.
   - Nhân sự dùng Camera quét QR. App tra cứu với danh sách ticket đã tải trong SQLite.
   - Nếu hợp lệ, ghi nhận lượt check-in vào bảng `offline_checkin_queue` của SQLite (trạng thái `PENDING`).

3. **Check-in trực tuyến (Online Check-in):**
   - Khi thiết bị có mạng, nhân sự có thể quét QR và điểm danh trực tiếp qua API.
   - App gọi `POST /checkin/scan` với body `{ qr_token, workshop_id }`.
   - **WorkshopScopeGuard** kiểm tra quyền truy cập workshop trước khi vào Service.
   - Backend tra cứu ticket theo `qr_token`, kiểm tra:
     - Ticket tồn tại và có trạng thái `ACTIVE`.
     - Ticket thuộc đúng workshop_id.
   - Nếu hợp lệ, ghi `checkin_records` với `source = ONLINE`, `checked_in_at = now()`, `checked_in_by = jwt.sub`.
   - Phản hồi kèm thông tin ticket và student (tên, email, avatar) để nhân sự đối chiếu.

4. **Đồng bộ hàng loạt (Offline Sync):**
   - Khi thiết bị kết nối mạng trở lại, App gom các bản ghi `PENDING` trong `offline_checkin_queue` thành một Batch và gọi `POST /checkin/sync`.
   - Backend nhận batch, tra cứu từng `qr_token`:
     - Nếu ticket còn hiệu lực (`ACTIVE`) và chưa có `checkin_records` → INSERT với `source = OFFLINE_SYNC`.
     - Nếu `checkin_records` đã tồn tại (UNIQUE(ticket_id, workshop_id)) → `ON CONFLICT DO NOTHING`, bỏ qua, đếm vào `skipped_count`.
     - Nếu ticket đã bị `VOID` sau khi quét offline → đếm vào `conflicts_count`, không INSERT.
   - Phản hồi trả về 3 chỉ số: `{ synced_count, skipped_count, conflicts_count }`.

5. **Xem trạng thái workshop (Status Dashboard):**
   - Nhân sự gọi `GET /checkin/workshops/:id/status` để xem thông tin tổng quan:
     - `confirmed_count`: tổng số registration đã xác nhận.
     - `checked_in_count`: số lượng đã điểm danh.
     - `pending_count`: số lượng chưa điểm danh.
     - `recent_checkins`: 20 check-in gần nhất (sắp xếp theo `checked_in_at DESC`).
   - Endpoint áp dụng **WorkshopScopeGuard** — chỉ nhân sự được phân quyền mới xem được.

## Kịch bản lỗi

- **Trùng lặp (Duplicate Sync):** Nhân sự bấm đồng bộ 2 lần hoặc App tự trigger nhiều lần. CSDL PostgreSQL loại bỏ bản ghi trùng nhờ ràng buộc `UNIQUE(ticket_id, workshop_id)`. Batch lần hai trả về `synced_count = 0, skipped_count = N`.
- **Lỗi nghiệp vụ Offline:** Nhân sự quét mã QR của Workshop A tại cửa Workshop B, hoặc quét vé đã bị hủy (`VOID`). App báo lỗi ngay trên màn hình do thông tin trong Signed JWT không khớp với workshop hiện tại.
- **Vé bị hủy trong lúc mất mạng:** Batch sync gửi lên chứa ticket đã bị VOID sau khi quét offline. Bản ghi đó được đếm vào `conflicts_count` và không được INSERT vào `checkin_records`. Các vé khác trong batch vẫn được xử lý bình thường.
- **JWT hết hạn lúc Sync:** Server trả lỗi `401 Unauthorized`. App tự động lấy Refresh Token trong Keychain để đổi lấy Access Token mới và chạy tiếp luồng Sync ngầm (Silent Sync) mà không bắt nhân sự đăng nhập lại.
- **QR Token không tồn tại (Online Check-in):** `POST /checkin/scan` với `qr_token` không hợp lệ → Server trả 404.
- **Ticket đã điểm danh (Online Check-in):** `POST /checkin/scan` với ticket đã có `checkin_records` → Server trả lỗi báo vé đã được sử dụng.
- **Vi phạm quyền workshop (Scope Violation):** Nhân sự cố tình quét QR của workshop không thuộc `allowed_workshop_ids` → WorkshopScopeGuard chặn với 403 trước khi vào Service.
- **ETag Not Modified:** Dữ liệu pre-load không thay đổi giữa các lần tải → Server trả 304, mobile giữ nguyên cache, tiết kiệm băng thông.

## Ràng buộc

- **Hiệu năng Offline:** Thời gian xử lý từ lúc Camera nhận diện mã QR đến khi lưu thành công vào SQLite nội bộ phải dưới 200ms để không gây ùn tắc tại cửa kiểm soát.
- **Tính nhất quán cuối (Eventual Consistency):** Chấp nhận việc dữ liệu báo cáo trên Server bị trễ so với thực tế cho đến khi thiết bị của nhân sự có Internet khôi phục.
- **Bảo mật JWT trên Mobile:** JWT Token được lưu trong **Keychain/Secure Storage** (iOS Keychain / Android Encrypted SharedPreferences). KHÔNG BAO GIỜ lưu JWT vào SQLite hoặc AsyncStorage.
- **Cache Metadata STALE:** Ngưỡng làm mới cache metadata là 30 phút. Nếu quá ngưỡng, App tự động refresh ngầm khi có mạng. Dữ liệu ticket trong SQLite chỉ được xóa khi có phản hồi 304 (không thay đổi).
- **TTL của QR Token (JWT exp):** Token có thời gian sống hữu hạn (ví dụ 30 ngày hoặc đến khi workshop kết thúc). Khi hết hạn, mobile phải gọi API để lấy token mới.
- **Ký số QR Token:** JWT phải được ký bằng secret/key riêng (không dùng chung với Access Token) để mobile có thể xác thực offline mà không cần gọi Server.

## Tiêu chí chấp nhận

- Ứng dụng Mobile tiếp tục quét và lưu trữ thành công 500 QR code liên tiếp khi điện thoại đang bật chế độ Máy bay (Airplane mode).
- Sau khi có mạng và đồng bộ, Dashboard hệ thống không ghi nhận bất kỳ lượt check-in đúp (duplicate) nào cho cùng một vé tại một sự kiện.
- Batch sync gửi 100 bản ghi trong đó có 10 vé đã VOID: Server trả về `{ synced_count: 90, skipped_count: 0, conflicts_count: 10 }`.
- Check-in online với QR token hợp lệ thành công trong < 500ms (bao gồm network latency).
- Mobile tự động refresh JWT khi nhận 401 mà không làm gián đoạn luồng quét QR.
- Workshop status endpoint trả về đúng `confirmed_count`, `checked_in_count`, `pending_count` và tối đa 20 bản ghi `recent_checkins`.
