# Đặc tả: Luồng thanh toán và Cấp mã QR (Payment & Ticketing)

## Mô tả

Quản lý quy trình giao dịch từ thời điểm sinh viên bấm "Đăng ký" sự kiện cho đến khi nhận được vé điện tử (mã QR). Tính năng này bao gồm việc giữ chỗ tạm thời, tương tác với cổng thanh toán (Payment Gateway), bảo vệ chống trừ tiền hai lần và cấp phát vé.

Kiến trúc thanh toán được bảo vệ bởi cơ chế **Circuit Breaker** — bộ máy trạng thái 3 pha (CLOSED → OPEN → HALF_OPEN) nhằm tránh gọi liên tục vào gateway đang lỗi. Khi thanh toán tạm ngưng, hệ thống vẫn cho phép đăng ký workshop miễn phí và hiển thị thông báo "Dịch vụ thanh toán đang bảo trì, vui lòng thử lại sau".

## Luồng chính

1. **Khởi tạo đăng ký và Giữ chỗ:** - Sinh viên bấm "Đăng ký" trên giao diện.
   - Backend dùng lệnh `DECR` nguyên tử trên Redis (`seat:available:{workshop_id}`) để trừ ghế.
   - _Nếu workshop miễn phí:_ Trạng thái đơn được cập nhật thành `CONFIRMED` lập tức và chuyển thẳng sang Bước 4.
   - _Nếu workshop có phí:_ Backend sinh `Idempotency Key` lưu vào bảng `payments`, tạo `SeatLock` trên Redis (`seat:lock:{wid}:{rid}` với TTL 15 phút), tạo bản ghi `registrations` (trạng thái `PENDING_PAYMENT`). Điều hướng sinh viên sang Payment Gateway.
2. **Xử lý Thanh toán (Webhook/Callback):**
   - Payment Gateway gửi callback về endpoint webhook kèm header `X-Gateway-Signature`. **HmacSignatureGuard** tính HMAC-SHA256 của raw request body với secret riêng của gateway, so sánh timing-safe với header. Nếu chữ ký không hợp lệ → 401.
   - Backend kiểm tra lệnh `SET NX idempotency:{key}` trên Redis (TTL 24h) — Layer 1 chống trùng thanh toán. Ràng buộc `UNIQUE` trên `payments.idempotency_key` là Layer 2 bảo vệ cuối cùng.
   - Nếu thanh toán thành công: cập nhật `payments.status = SUCCESS`, `registrations.status = CONFIRMED`, sinh ticket `ACTIVE`, xóa SeatLock — tất cả trong một Database Transaction. Đẩy sự kiện `PAYMENT_SUCCESS` vào Message Queue.
   - Nếu thanh toán thất bại: cập nhật `payments.status = FAILED`, giải phóng SeatLock, tăng `seat:available:{workshop_id}`.
   - Xử lý ghi database dùng **Pessimistic Locking** (`SELECT FOR UPDATE NOWAIT`) với timeout 3 giây. Nếu quá 3 giây → HTTP 503 (`DB_LOCK_TIMEOUT`).
3. **Mở khóa ghế (Unlock Seat):** Xóa `SeatLock` trên Redis. Trường hợp thanh toán thất bại, SeatLock được giải phóng ngay trong webhook failed flow.
4. **Cấp phát vé QR:** - Ngay khi trạng thái là `CONFIRMED`, hệ thống tự động sinh `qr_token` (được mã hóa/ký số).
   - Tạo bản ghi vào bảng `tickets` với trạng thái `ACTIVE`. Đơn đăng ký sinh ra duy nhất 1 vé.
5. **Kích hoạt sự kiện:** Đẩy Message `REGISTRATION_CONFIRMED` vào Message Queue để module Thông báo tiến hành gửi email/app push chứa mã QR cho sinh viên.

## Kịch bản lỗi

- **Hết chỗ (Sold out):** Lệnh `DECR` trên Redis trả về < 0. Hệ thống gọi lệnh `INCR` hoàn lại slot tức thì và trả lỗi "Đã hết chỗ" cho Frontend.
- **Thanh toán Timeout hoặc Sinh viên bỏ ngang:** Circuit Breaker kích hoạt hoặc sinh viên đóng trình duyệt. Sau 15 phút, `SeatLock` trên Redis tự động hủy. Một Job chạy ngầm sẽ cập nhật `registrations` thành `CANCELLED` và trả lại ghế lên Redis bằng lệnh `INCR`.
- **Trừ tiền hai lần (Double Charge):** Sinh viên bấm thanh toán nhiều lần do lag mạng. Hệ thống kiểm tra `idempotency_key` qua 2 lớp (Layer 1: Redis `SET NX` với TTL 24h, Layer 2: PostgreSQL Unique Constraint). Nếu phát hiện trùng lặp, hệ thống lập tức chặn request gọi sang Gateway và trả về kết quả thành công cũ.
- **Circuit Breaker mở (Payment Gateway OPEN):** Gateway gặp sự cố, 5 request thất bại trong vòng 60 giây. Mạch chuyển từ `CLOSED` sang `OPEN`. Mọi request thanh toán tiếp theo bị từ chối ngay lập tức với lỗi `PAYMENT_GATEWAY_OPEN` mà không gọi ra gateway ngoài. Sau 30 giây, mạch tự chuyển sang `HALF_OPEN` cho phép 1 canary request. Nếu canary thành công → về `CLOSED`; nếu thất bại → quay lại `OPEN`.
- **DB Lock Timeout:** Hai sinh viên cùng thanh toán cho một suất học. Một giao dịch giữ khóa (`FOR UPDATE NOWAIT`), giao dịch kia chờ quá 3 giây → HTTP 503 `DB_LOCK_TIMEOUT`. Sinh viên thử lại sau.
- **Graceful Degradation — thanh toán ngưng hoạt động:** Khi circuit breaker ở trạng thái `OPEN`, workshop miễn phí vẫn đăng ký được bình thường. Workshop có phí hiển thị thông báo "Dịch vụ thanh toán đang bảo trì, vui lòng thử lại sau" — không crash, không mất dữ liệu.

## Ràng buộc

- **Tính toàn vẹn giao dịch (ACID):** Quá trình cập nhật trạng thái thanh toán, tạo vé và xóa SeatLock phải được đặt trong cùng một Database Transaction.
- **Nguồn sự thật (Source of Truth):** Dữ liệu ghế ngồi phải tuân thủ nghiêm ngặt từ Redis, không query từ PostgreSQL trong luồng này để tránh thắt cổ chai.
- **Bảo mật (IDOR Prevention):** Mọi API truy xuất đơn hàng và lấy mã QR phải kiểm tra cứng mệnh đề `WHERE student_id = {id_từ_JWT}`.
- **Circuit Breaker:** Bộ máy trạng thái per-gateway, lưu trong Redis Hash `circuit:payment:{gateway}`. Không hardcode timeout, cấu hình qua biến môi trường.
- **Webhook Security:** Mọi webhook thanh toán phải được xác thực qua **HmacSignatureGuard**. Secret riêng cho từng gateway. So sánh chữ ký dùng timing-safe comparison để chống tấn công side-channel.
- **Pessimistic Locking Timeout:** Mọi transaction dùng `FOR UPDATE NOWAIT` phải có `statement_timeout = 3s` ở cấp độ kết nối. Quá 3 giây → rollback và trả về HTTP 503.

## Tiêu chí chấp nhận

- Sinh viên nhận được mã QR hợp lệ trong tab "Vé của tôi" ngay sau khi thanh toán thành công.
- Không bao giờ xảy ra tình trạng bán vượt số lượng ghế thực tế (Overselling) ngay cả khi có 10.000 request cùng lúc.
- Circuit Breaker chuyển trạng thái đúng: 5 lỗi trong 60s → OPEN; 30s sau → HALF_OPEN; 1 canary thành công → CLOSED.
- Payment timeout được xử lý trong vòng 1 phút kể từ khi hết hạn 15 phút `PENDING_PAYMENT` — cron chạy mỗi 1 phút quét index `idx_payments_pending`.
- Gửi webhook giả mạo với chữ ký sai bị từ chối 401; gửi đúng chữ ký được xử lý thành công.
- Gửi idempotency key trùng lặp trong vòng 24h không tạo payment mới, trả về kết quả của payment cũ.
