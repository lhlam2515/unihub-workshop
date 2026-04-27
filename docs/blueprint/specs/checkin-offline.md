# Đặc tả: Check-in tại sự kiện (Offline-First)

## Mô tả

Ứng dụng Mobile App dành riêng cho nhân sự (`CHECKIN_STAFF`) dùng để quét mã QR điểm danh tại cửa hội trường. Hệ thống được thiết kế theo kiến trúc Offline-First, đảm bảo việc quét mã QR diễn ra tức thì (không độ trễ) ngay cả khi thiết bị mất kết nối mạng hoàn toàn, và tự động đồng bộ dữ liệu an toàn lên Server khi có mạng trở lại.

## Luồng chính

1. **Khởi tạo và Tải dữ liệu (Online):** - Nhân sự đăng nhập khi thiết bị có mạng.
   - JWT Access Token (được cấu hình hạn đặc biệt 8 giờ) lưu vào Keychain/Secure Storage của thiết bị.
   - App tự động tải danh sách các `Ticket` đang `ACTIVE` thuộc về các sự kiện trong mảng `allowed_workshop_ids` (được cấp trong JWT) về lưu trữ tại SQLite local.
2. **Chế độ Ngoại tuyến (Offline Mode):** - Khi mất mạng, App tự giải mã JWT cục bộ để xác thực quyền hạn và thời gian hết hạn (`exp`).
   - Nhân sự dùng Camera quét QR. App tra cứu `qr_token` với danh sách vé đã tải trong SQLite.
   - Nếu hợp lệ, ghi nhận lượt check-in vào bảng `offline_checkin_queue` của SQLite (trạng thái `PENDING`).
3. **Đồng bộ trực tuyến (Online Sync):** - Khi thiết bị kết nối mạng trở lại, App gom các bản ghi check-in PENDING thành một Batch và đẩy lên API `/sync`.
4. **Xử lý Lũy đẳng tại Backend (Idempotency Sync):** - API Backend giải mã JWT, kiểm tra tính hợp lệ (không nằm trong Blacklist, đúng Scope sự kiện).
   - Lưu dữ liệu vào bảng `checkin_records` của PostgreSQL với câu lệnh `INSERT ... ON CONFLICT DO NOTHING` để đảm bảo không bị nhân bản dữ liệu nếu sync nhiều lần.

## Kịch bản lỗi

- **Trùng lặp (Duplicate Sync):** Nhân sự bấm đồng bộ 2 lần hoặc App tự trigger nhiều lần. CSDL PostgreSQL loại bỏ bản ghi trùng nhờ ràng buộc `UNIQUE(ticket_id, workshop_id)`.
- **Lỗi nghiệp vụ Offline:** Nhân sự quét mã QR của Workshop A tại cửa Workshop B, hoặc quét vé đã bị hủy (`VOID`). App báo lỗi ngay trên màn hình do dữ liệu không khớp với SQLite Cache.
- **Vé bị hủy trong lúc mất mạng:** Dữ liệu đẩy lên Server bị phát hiện không còn hợp lệ. Bản ghi đó trên Server sẽ được đánh dấu `sync_status = CONFLICT` để Admin rà soát sau, tiến trình sync các vé khác vẫn diễn ra bình thường.
- **JWT hết hạn lúc Sync:** Server trả lỗi `401 Unauthorized`. App tự động lấy Refresh Token trong Keychain để đổi lấy Access Token mới và chạy tiếp luồng Sync ngầm (Silent Sync) mà không bắt nhân sự đăng nhập lại.

## Ràng buộc

- **Hiệu năng Offline:** Thời gian xử lý từ lúc Camera nhận diện mã QR đến khi lưu thành công vào SQLite nội bộ phải dưới 200ms để không gây ùn tắc tại cửa kiểm soát.
- **Tính nhất quán cuối (Eventual Consistency):** Chấp nhận việc dữ liệu báo cáo trên Server bị trễ so với thực tế cho đến khi thiết bị của nhân sự có Internet khôi phục.

## Tiêu chí chấp nhận

- Ứng dụng Mobile tiếp tục quét và lưu trữ thành công 500 QR code liên tiếp khi điện thoại đang bật chế độ Máy bay (Airplane mode).
- Sau khi có mạng và đồng bộ, Dashboard hệ thống không ghi nhận bất kỳ lượt check-in đúp (duplicate) nào cho cùng một vé tại một sự kiện.
