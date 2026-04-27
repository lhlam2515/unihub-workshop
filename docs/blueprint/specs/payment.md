# Đặc tả: Luồng thanh toán và Cấp mã QR (Payment & Ticketing)

## Mô tả

Quản lý quy trình giao dịch từ thời điểm sinh viên bấm "Đăng ký" sự kiện cho đến khi nhận được vé điện tử (mã QR). Tính năng này bao gồm việc giữ chỗ tạm thời, tương tác với cổng thanh toán (Payment Gateway), bảo vệ chống trừ tiền hai lần và cấp phát vé.

## Luồng chính

1. **Khởi tạo đăng ký và Giữ chỗ:** - Sinh viên bấm "Đăng ký" trên giao diện.
   - Backend dùng lệnh `DECR` nguyên tử trên Redis (`seat:available:{workshop_id}`) để trừ ghế.
   - _Nếu workshop miễn phí:_ Trạng thái đơn được cập nhật thành `CONFIRMED` lập tức và chuyển thẳng sang Bước 4.
   - _Nếu workshop có phí:_ Backend sinh `Idempotency Key` lưu vào bảng `payments`, tạo `SeatLock` trên Redis (`seat:lock:{wid}:{rid}` với TTL 15 phút), tạo bản ghi `registrations` (trạng thái `PENDING_PAYMENT`). Điều hướng sinh viên sang Payment Gateway.
2. **Xử lý Thanh toán (Webhook/Callback):** - Khi Payment Gateway trả kết quả về, Backend kiểm tra lệnh `SET NX idempotency:{key}` trên Redis (TTL 24h).
   - Nếu thanh toán thành công, cập nhật bảng `payments` thành `SUCCESS` và `registrations` thành `CONFIRMED`.
3. **Mở khóa ghế (Unlock Seat):** Xóa `SeatLock` trên Redis.
4. **Cấp phát vé QR:** - Ngay khi trạng thái là `CONFIRMED`, hệ thống tự động sinh `qr_token` (được mã hóa/ký số).
   - Tạo bản ghi vào bảng `tickets` với trạng thái `ACTIVE`. Đơn đăng ký sinh ra duy nhất 1 vé.
5. **Kích hoạt sự kiện:** Đẩy Message `REGISTRATION_CONFIRMED` vào Message Queue để module Thông báo tiến hành gửi email/app push chứa mã QR cho sinh viên.

## Kịch bản lỗi

- **Hết chỗ (Sold out):** Lệnh `DECR` trên Redis trả về < 0. Hệ thống gọi lệnh `INCR` hoàn lại slot tức thì và trả lỗi "Đã hết chỗ" cho Frontend.
- **Thanh toán Timeout hoặc Sinh viên bỏ ngang:** Circuit Breaker kích hoạt hoặc sinh viên đóng trình duyệt. Sau 15 phút, `SeatLock` trên Redis tự động hủy. Một Job chạy ngầm sẽ cập nhật `registrations` thành `CANCELLED` và trả lại ghế lên Redis bằng lệnh `INCR`.
- **Trừ tiền hai lần (Double Charge):** Sinh viên bấm thanh toán nhiều lần do lag mạng. Hệ thống kiểm tra `idempotency_key` qua 2 lớp (Layer 1: Redis `SET NX`, Layer 2: PostgreSQL Unique Constraint). Nếu phát hiện trùng lặp, hệ thống lập tức chặn request gọi sang Gateway và trả về kết quả thành công cũ.

## Ràng buộc

- **Tính toàn vẹn giao dịch (ACID):** Quá trình cập nhật trạng thái thanh toán, tạo vé và xóa SeatLock phải được đặt trong cùng một Database Transaction.
- **Nguồn sự thật (Source of Truth):** Dữ liệu ghế ngồi phải tuân thủ nghiêm ngặt từ Redis, không query từ PostgreSQL trong luồng này để tránh thắt cổ chai.
- **Bảo mật (IDOR Prevention):** Mọi API truy xuất đơn hàng và lấy mã QR phải kiểm tra cứng mệnh đề `WHERE student_id = {id_từ_JWT}`.

## Tiêu chí chấp nhận

- Sinh viên nhận được mã QR hợp lệ trong tab "Vé của tôi" ngay sau khi thanh toán thành công.
- Không bao giờ xảy ra tình trạng bán vượt số lượng ghế thực tế (Overselling) ngay cả khi có 10.000 request cùng lúc.
