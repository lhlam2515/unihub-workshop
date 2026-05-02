# Đặc tả: Xác thực và Kiểm soát truy cập (Authentication & Authorization)

## Mô tả

Quản lý định danh và phân quyền truy cập cho toàn bộ người dùng hệ thống (`STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`) dựa trên mô hình RBAC. Hệ thống sử dụng kiến trúc JWT Dual-Token kết hợp Redis Blacklist để bảo mật chống tấn công XSS, tối ưu trải nghiệm (Silent Refresh) và hỗ trợ thu hồi đặc quyền khẩn cấp.

Cấu trúc JWT Payload:
- `sub` (string): User ID — là trường định danh người dùng. **Lưu ý:** Tên field là `sub` (theo chuẩn RFC 7519), không phải `userId`. Sai sót kiểu S-C01 (sai tên field) sẽ dẫn đến lỗi xác thực runtime.
- `role` (UserRole): Vai trò người dùng (`STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`).
- `jti` (string): UUID v4 — định danh duy nhất của token, dùng để blacklist.
- `allowed_workshop_ids` (string[]): Danh sách workshop được phân công (chỉ `CHECKIN_STAFF` mới có dữ liệu; các role khác nhận mảng rỗng).

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
   - Refresh Token cũ bị blacklist ngay sau khi cấp cặp token mới (Refresh Token Rotation).
5. **Đăng xuất (Logout) & Thu hồi Token:**
   - Người dùng gọi API logout. Backend blacklists `jti` của Access Token hiện tại vào Redis với TTL bằng thời gian sống còn lại (`token:blacklist:{jti}`).
   - **Idempotent:** Gọi logout nhiều lần với cùng token hoặc token đã blacklist vẫn trả về thành công, không báo lỗi.
6. **Lấy thông tin người dùng (getMe) theo Role:**
   - API `GET /api/auth/me` trả về thông tin user hiện tại.
   - **STUDENT:** Nhận thêm `student_code`, `full_name`, `faculty`.
   - **CHECKIN_STAFF:** Nhận thêm `allowed_workshop_ids`.
   - **ORGANIZER:** Chỉ nhận thông tin cơ bản (email, role, status).
7. **Phân công quyền nhân sự Check-in (Staff Assignment):**
   - `ORGANIZER` gán danh sách workshop ID cho `CHECKIN_STAFF` qua API upsert.
   - **Upsert (replace, not merge):** Gán `["wid-C"]` sẽ thay thế hoàn toàn danh sách cũ `["wid-A", "wid-B"]`, không gộp.
   - **Eventual Consistency:** Quyền mới chỉ có hiệu lực sau khi nhân sự đăng xuất và đăng nhập lại.

## Kịch bản lỗi

- **Thundering Herd khi Refresh:** Đăng nhập từ tab cũ hoặc sau một thời gian dài, 10 request đồng thời gọi API lấy dữ liệu và đều bị `401`. Mutex Lock ở Frontend chỉ cho phép duy nhất 1 request đi gọi endpoint `/refresh`, 9 request còn lại bị đưa vào queue chờ. Tránh việc cấp trùng lặp và vô hiệu hóa Token.
- **Refresh Token hết hạn / Bị đánh cắp:** API `/refresh` kiểm tra thấy Refresh Token không hợp lệ. Hệ thống xóa Cookie/Keychain và buộc người dùng đăng xuất (Force Logout).
- **Thu hồi quyền khẩn cấp:** `ORGANIZER` khóa tài khoản của một `CHECKIN_STAFF`. Backend chèn `jti` của Access Token đang bị lộ vào Redis. Ở request quét QR liền kề sau đó (dù Access Token vẫn còn hạn 8 tiếng), Middleware check trúng Redis Blacklist -> Phản hồi `401 Unauthorized` ngay lập tức.
- **Xâm nhập chéo quyền:** `STUDENT` cố tình gọi API `/api/admin/stats`. Phân quyền báo lỗi Role mismatch -> Phản hồi `403 Forbidden`.
- **Chống dò tìm thông tin đăng nhập (Anti-enumeration):** Mọi lỗi đăng nhập — sai email, sai mật khẩu, tài khoản bị khóa (`SUSPENDED`) — đều trả về `INVALID_CREDENTIALS` chung. Hệ thống không tiết lộ thông tin về việc email có tồn tại hay tài khoản có bị khóa hay không.
- **Phát hiện Refresh Token bị đánh cắp (Stolen Token Detection):** Khi Refresh Token hợp lệ bị blacklist do rotation (người dùng chính chủ refresh), nếu kẻ tấn công cố dùng token cũ thì API `/refresh` kiểm tra blacklist và trả về `refreshTokenInvalid()` — token đã dùng không thể dùng lại.

## Ràng buộc

- **Bảo mật lưu trữ Web:** Lập trình viên Frontend tuyệt đối không lưu Access Token hoặc Refresh Token vào LocalStorage hoặc SessionStorage. Refresh Token bắt buộc phải được gắn cờ `Secure` (chỉ chạy trên HTTPS) và `SameSite=Strict`.
- **Hiệu năng Middleware:** Truy vấn Redis Blacklist phải sử dụng Connection Pool cấu hình sẵn để đạt tốc độ phản hồi < 1ms, không làm tăng độ trễ (latency) của toàn bộ hệ thống API.
- **Nhất quán Eventual Consistency:** Nếu Ban tổ chức đổi quyền phân công sự kiện (`allowed_workshop_ids`), quyền mới sẽ chưa có hiệu lực trên Mobile App cho đến khi nhân sự thực hiện đăng xuất/đăng nhập lại.
- **Chuẩn JWT Claim Names:** Trường định danh người dùng trong payload phải là `sub` (theo chuẩn RFC 7519), không được dùng `userId` hoặc `user_id`. Vi phạm quy tắc này (loại S-C01) gây lỗi runtime không bắt được ở compile-time.

## Tiêu chí chấp nhận

- Chạy các công cụ quét bảo mật (như OWASP ZAP) không thể trích xuất được Refresh Token bằng các kịch bản tấn công XSS tiêm mã độc vào giao diện Web.
- Nhân sự Check-in thao tác ở chế độ ngắt mạng (Airplane Mode) trên Mobile App không bị gián đoạn quyền truy cập trong suốt ca làm việc 8 tiếng.
- Hệ thống vô hiệu hóa được một tài khoản bị xâm nhập chỉ trong chưa đầy 1 giây kể từ khi Admin nhấn nút "Khóa".
- Gọi logout hai lần liên tiếp không gây lỗi — lần thứ hai trả về thành công ngay lập tức (idempotent).
- API `/me` trả về đúng trường thông tin bổ sung theo từng role: `student_code` cho STUDENT, `allowed_workshop_ids` cho CHECKIN_STAFF.
- Gửi request đăng nhập với email không tồn tại, sai mật khẩu hoặc tài khoản bị khóa đều nhận cùng mã lỗi `INVALID_CREDENTIALS`.
