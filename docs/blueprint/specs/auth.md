# Đặc tả: Xác thực và Kiểm soát truy cập (Authentication & Authorization)

## Mô tả

Quản lý định danh và phân quyền truy cập cho toàn bộ người dùng hệ thống (`STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`) dựa trên mô hình RBAC. Hệ thống sử dụng kiến trúc JWT Dual-Token kết hợp Redis Blacklist để bảo mật chống tấn công XSS, tối ưu trải nghiệm (Silent Refresh) và hỗ trợ thu hồi đặc quyền khẩn cấp.

## Luồng chính

1. **Đăng nhập (Login) & Cấp phát Token:**
   - Người dùng gửi thông tin xác thực. Backend kiểm tra hợp lệ, truy vấn thông tin user và sinh ra cặp JWT (gồm mã định danh duy nhất `jti` trong payload).
   - **Đối với Web Portal:** Backend trả Access Token (hạn 15 phút) vào Response Body (để Frontend lưu in-memory) và tự động set Refresh Token (hạn 7 ngày) vào `HttpOnly Cookie`.
   - **Đối với Mobile App:** Backend trả cả Access Token (hạn 8 giờ, chứa `allowed_workshop_ids`) và Refresh Token (hạn 7 ngày) vào Response Body để App lưu vào `Keychain / Secure Storage`.
2. **Xác thực API (Authentication Middleware):**
   - Mọi request gửi lên Backend đều phải đính kèm Access Token trong `Authorization` header.
   - Middleware giải mã Token, kiểm tra chữ ký hợp lệ và thời hạn (`exp`).
   - Lọc Blacklist: Middleware dùng mã `jti` truy vấn Redis (`GET token:blacklist:{jti}`). Nếu có dữ liệu (Key tồn tại), lập tức từ chối Request.
3. **Phân quyền tài nguyên (Authorization Middleware):**
   - Hệ thống so khớp trường `role` trong JWT với yêu cầu của Endpoint (VD: Xóa sự kiện yêu cầu `ORGANIZER`).
   - Ngăn chặn IDOR: Các API truy xuất dữ liệu cá nhân tự động chèn mệnh đề SQL `WHERE student_id = {jwt_user_id}`.
   - Scope Validation: API Check-in bắt buộc kiểm tra `workshop_id` trong body có thuộc mảng `allowed_workshop_ids` của Token hay không.
4. **Làm mới Token (Silent Refresh):**
   - Khi Access Token hết hạn, Frontend bắt được mã lỗi `401`.
   - Frontend kích hoạt cờ Mutex Lock (`isRefreshing = true`), đóng băng các request tiếp theo.
   - Gọi API `POST /api/auth/refresh` kèm Refresh Token để nhận Access Token mới. Sau khi nhận thành công, giải phóng hàng đợi và thực thi lại các request bị đóng băng.

## Kịch bản lỗi

- **Thundering Herd khi Refresh:** Đăng nhập từ tab cũ hoặc sau một thời gian dài, 10 request đồng thời gọi API lấy dữ liệu và đều bị `401`. Mutex Lock ở Frontend chỉ cho phép duy nhất 1 request đi gọi endpoint `/refresh`, 9 request còn lại bị đưa vào queue chờ. Tránh việc cấp trùng lặp và vô hiệu hóa Token.
- **Refresh Token hết hạn / Bị đánh cắp:** API `/refresh` kiểm tra thấy Refresh Token không hợp lệ. Hệ thống xóa Cookie/Keychain và buộc người dùng đăng xuất (Force Logout).
- **Thu hồi quyền khẩn cấp:** `ORGANIZER` khóa tài khoản của một `CHECKIN_STAFF`. Backend chèn `jti` của Access Token đang bị lộ vào Redis. Ở request quét QR liền kề sau đó (dù Access Token vẫn còn hạn 8 tiếng), Middleware check trúng Redis Blacklist -> Phản hồi `401 Unauthorized` ngay lập tức.
- **Xâm nhập chéo quyền:** `STUDENT` cố tình gọi API `/api/admin/stats`. Phân quyền báo lỗi Role mismatch -> Phản hồi `403 Forbidden`.

## Ràng buộc

- **Bảo mật lưu trữ Web:** Lập trình viên Frontend tuyệt đối không lưu Access Token hoặc Refresh Token vào LocalStorage hoặc SessionStorage. Refresh Token bắt buộc phải được gắn cờ `Secure` (chỉ chạy trên HTTPS) và `SameSite=Strict`.
- **Hiệu năng Middleware:** Truy vấn Redis Blacklist phải sử dụng Connection Pool cấu hình sẵn để đạt tốc độ phản hồi < 1ms, không làm tăng độ trễ (latency) của toàn bộ hệ thống API.
- **Nhất quán Eventual Consistency:** Nếu Ban tổ chức đổi quyền phân công sự kiện (`allowed_workshop_ids`), quyền mới sẽ chưa có hiệu lực trên Mobile App cho đến khi nhân sự thực hiện đăng xuất/đăng nhập lại.

## Tiêu chí chấp nhận

- Chạy các công cụ quét bảo mật (như OWASP ZAP) không thể trích xuất được Refresh Token bằng các kịch bản tấn công XSS tiêm mã độc vào giao diện Web.
- Nhân sự Check-in thao tác ở chế độ ngắt mạng (Airplane Mode) trên Mobile App không bị gián đoạn quyền truy cập trong suốt ca làm việc 8 tiếng.
- Hệ thống vô hiệu hóa được một tài khoản bị xâm nhập chỉ trong chưa đầy 1 giây kể từ khi Admin nhấn nút "Khóa".
