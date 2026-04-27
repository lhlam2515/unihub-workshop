# UniHub Workshop - Access Control

## Thiết kế mô hình kiểm soát truy cập (Access Control Model)

Hệ thống UniHub Workshop áp dụng mô hình **Role-Based Access Control (RBAC)** kết hợp với chiến lược **Defense in Depth (Bảo mật nhiều lớp)**. Thiết kế này tuân thủ nghiêm ngặt nguyên tắc **Đặc quyền tối thiểu (Principle of Least Privilege - PoLP)**, đảm bảo người dùng chỉ có quyền thực thi đúng những gì vai trò của họ yêu cầu.

### 1. Ma trận Phân quyền (Permission Matrix)

Hệ thống ánh xạ trực tiếp với ENUM `user_role` trong cơ sở dữ liệu.

| Tài nguyên (Resource)       | `STUDENT` (Sinh viên)                 | `ORGANIZER` (Ban tổ chức)         | `CHECKIN_STAFF` (Nhân sự điểm danh) |
| :-------------------------- | :------------------------------------ | :-------------------------------- | :---------------------------------- |
| **Workshop / Lịch sự kiện** | Chỉ xem (`status = PUBLISHED`)        | Toàn quyền (Tạo, Sửa, Hủy)        | Chỉ xem                             |
| **AI Summary & File PDF**   | Chỉ đọc                               | Toàn quyền (Upload, Kích hoạt AI) | Không có quyền                      |
| **Đăng ký (Registration)**  | Tạo mới, Hủy (đơn của mình)           | Xem danh sách, Thống kê           | Không có quyền                      |
| **Thanh toán (Payment)**    | Tạo giao dịch, Xem lịch sử (của mình) | Theo dõi dòng tiền, Đối soát      | Không có quyền                      |
| **Vé & QR Code (Ticket)**   | Xem vé của mình                       | Không có quyền                    | Truy xuất để đối chiếu              |
| **Check-in (Điểm danh)**    | Không có quyền                        | Xem báo cáo                       | Toàn quyền (Quét QR, Đồng bộ)\*     |
| **Đồng bộ CSV Sinh viên**   | Không có quyền                        | Toàn quyền (Kích hoạt, Xem log)   | Không có quyền                      |

_( \* ) Ràng buộc vi mô (Scope Granularity):_ `CHECKIN_STAFF` không có quyền trên toàn bộ các sự kiện. JWT của họ được nhúng mảng `allowed_workshop_ids`. Middleware sẽ từ chối thao tác quét QR hoặc đồng bộ nếu mã sự kiện không nằm trong danh sách được phân công.

---

### 2. Chiến lược Vòng đời Token & Bảo mật (Token Lifecycle Strategy)

Việc sử dụng JSON Web Token (JWT) đơn lẻ với thời hạn dài và lưu tại LocalStorage là một lỗ hổng nghiêm trọng (dễ bị tấn công XSS và không thể thu hồi). Hệ thống áp dụng mô hình **Dual-Token Pattern** kết hợp với **Redis Blacklist** và có chiến lược lưu trữ phân tách rõ ràng theo môi trường.

#### 2.1. Phân bổ Token và Môi trường Lưu trữ

Để cân bằng giữa bảo mật và trải nghiệm đặc thù của từng nền tảng, hệ thống cấu hình Token như sau:

- **Web Portal (Sinh viên & Admin)**
  - _Access Token:_ **15 phút**. Lưu In-memory (biến JS). Biến mất khi F5 trang để vô hiệu hóa hoàn toàn nguy cơ bị XSS đánh cắp lâu dài.
  - _Refresh Token:_ **7 ngày**. Lưu dưới dạng HttpOnly Cookie (Có cờ Secure, SameSite). JavaScript không thể đọc được, chống XSS tuyệt đối.

- **Mobile App (Nhân sự Check-in)**
  - _Access Token:_ **8 giờ**. Lưu trong Keychain / Secure Storage. Thời hạn dài để phủ toàn bộ ca làm việc ngoại tuyến (Offline).
  - _Refresh Token:_ **7 ngày**. Lưu trong Keychain / Secure Storage (môi trường mã hóa phần cứng, độ an toàn tương đương HttpOnly Cookie).

#### 2.2. Chống Race Condition khi Silent Refresh (Refresh Mutex)

Trên Web Portal, khi Access Token hết hạn, hệ thống gọi ngầm API `/refresh`. Để tránh hiện tượng **"Thundering Herd"** (Nhiều API cùng gọi `/refresh` đồng thời khiến server cấp nhiều token và vô hiệu hóa lẫn nhau), tầng Frontend áp dụng **Mutex Lock**:

1. Sử dụng cờ `isRefreshing`. Khi nhận lỗi `401 Unauthorized`, nếu hệ thống đang refresh, các Request khác sẽ bị chặn lại và đưa vào Hàng đợi (Queue).
2. Chỉ duy nhất Request đầu tiên được gọi lên Server để lấy Token mới.
3. Khi có Token mới, hệ thống giải phóng Hàng đợi và tự động đính kèm Token mới vào các Request đang chờ để thực thi tiếp.

#### 2.3. Tính nhất quán của Quyền hạn vi mô (Eventual Consistency)

Vì JWT có bản chất bất biến (immutable), nếu Ban tổ chức thay đổi phân công sự kiện (`allowed_workshop_ids`) cho nhân sự khi ca làm việc đang diễn ra, JWT cũ trên thiết bị của nhân sự sẽ không tự cập nhật.

- Hệ thống chấp nhận **Tính nhất quán sau (Eventual Consistency)**: Nhân sự cần chủ động đăng xuất và đăng nhập lại để nhận JWT mới, hoặc chờ Token hết hạn để quá trình Refresh tự động cập nhật Scope. (Giao diện của Organizer sẽ có cảnh báo rõ ràng về độ trễ này).

#### 2.4. Cơ chế Thu hồi Khẩn cấp (Emergency Revocation)

Để vô hiệu hóa ngay lập tức một Access Token đang còn hạn (ví dụ: nhân sự mất điện thoại), hệ thống sử dụng **Token Blacklist trên Redis**:

- Khi Admin khóa tài khoản, Backend tạo một Redis Key: `token:blacklist:{jti}` (`jti` là ID duy nhất trong payload của JWT) với giá trị `revoked` và TTL bằng thời gian còn lại của Token.
- Middleware xác thực sẽ tốn thêm ~1ms để tra cứu `jti` trong Redis. Nếu Key tồn tại, lập tức chặn Request.

---

### 3. Cơ chế Thực thi tại các Điểm truy cập (Enforcement Points)

#### Lớp 1: Backend API (Chốt chặn tuyệt đối)

- **Xác thực JWT (Authentication):** Middleware giải mã JWT, kiểm tra tính hợp lệ của chữ ký, kiểm tra thời hạn (`exp`), và tra cứu `jti` trong Redis Blacklist.
- **Phân quyền (Authorization):** Kiểm tra trường `role` trong payload có khớp với yêu cầu của Endpoint hay không.
- **Giới hạn phạm vi (Scope Granularity):** Với API `/checkin`, kiểm tra thêm `workshop_id` trong payload Request có nằm trong mảng `allowed_workshop_ids` của JWT hay không.
- **Ngăn chặn IDOR (Insecure Direct Object Reference):** Dù Role hợp lệ, các API thao tác dữ liệu cá nhân (như xem vé) luôn ép cứng mệnh đề SQL `WHERE student_id = {id_từ_JWT}`. Tránh việc sinh viên A truyền ID của sinh viên B lên URL để đánh cắp dữ liệu.

#### Lớp 2: Web Portal & Trang Admin (Bảo vệ UX)

- **Route Guarding:** Frontend sử dụng Router Guard để ngăn chặn điều hướng trái phép từ sớm (ví dụ: Role `STUDENT` bị đẩy ra khỏi trang `/admin` và redirect về trang chủ).
- **Conditional Rendering:** Ẩn/hiện các thành phần giao diện (Ví dụ: Nút "Hủy Workshop") dựa trên quyền hạn để tránh người dùng thao tác và nhận lỗi 403 từ Server, gây trải nghiệm xấu.

#### Lớp 3: Mobile App (Check-in Offline)

- **Khởi tạo:** Nhân sự đăng nhập khi có mạng (Online). Access Token (cấu hình đặc biệt hạn 8 giờ) và Refresh Token được lưu an toàn vào **Keychain / Secure Storage** của hệ điều hành.
- **Xác thực Offline:** Khi mất mạng, App tự giải mã Access Token để kiểm tra thời hạn (`exp`). Nếu còn hạn, App mở khóa tính năng Camera để quét QR và lưu dữ liệu vào `offline_checkin_queue`.
- **Idempotency Sync (Đồng bộ an toàn):** Khi có mạng, App gửi luồng dữ liệu offline lên Server. Middleware kiểm tra toàn bộ (chữ ký, thời hạn, Blacklist, Scope) của Token. Nếu Token hết hạn, Server trả lỗi 401, Mobile App sẽ dùng Refresh Token trong Keychain để lấy Access Token mới và tự động tiếp tục tiến trình đồng bộ mà không cần nhân sự can thiệp.
