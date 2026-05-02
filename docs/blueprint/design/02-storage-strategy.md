# UniHub Workshop - Storage Strategy

## Thiết kế cơ sở dữ liệu

Hệ thống UniHub Workshop đối mặt với hai thái cực dữ liệu: một bên là dữ liệu tài chính/đặt chỗ đòi hỏi tính chính xác tuyệt đối, một bên là dữ liệu trạng thái (giữ chỗ, đếm lượt truy cập) biến đổi cực nhanh trong các khung giờ cao điểm. Do đó, nhóm quyết định áp dụng chiến lược **Lưu trữ Lai (Explicit Hybrid Storage)**, chia dữ liệu thành 3 nhóm để xử lý bằng các công nghệ chuyên biệt.

### 1. Phân loại dữ liệu và Lý do lựa chọn Database

**A. Dữ liệu Giao dịch Cốt lõi (Core Transactional Data)**

- **Thực thể:** Users, Workshops, Registrations, Payments, Tickets,...
- **Đặc điểm & Yêu cầu:** Có cấu trúc quan hệ chặt chẽ. Yêu cầu tính toàn vẹn dữ liệu (ACID) tuyệt đối. Sai lệch dữ liệu sẽ dẫn đến lỗi nghiệp vụ nghiêm trọng (như bán vượt số chỗ - Overselling, hoặc trừ tiền hai lần - Double-charging).
- **Công nghệ Lựa chọn:** **PostgreSQL** (Hệ quản trị CSDL quan hệ - RDBMS / SQL).
- **Lý do (Trade-offs):** Hỗ trợ Transaction mạnh mẽ. Cung cấp cơ chế **Khóa bi quan (Pessimistic Locking - SELECT FOR UPDATE)** giúp giải quyết triệt để tranh chấp chỗ ngồi. Các ràng buộc (Constraints như CHECK, UNIQUE) bảo vệ tính đúng đắn của dữ liệu ở mức vật lý.

**B. Dữ liệu Vòng đời ngắn & Tốc độ cao (High-Velocity & Ephemeral Data)**

- **Thực thể:** Available Seats, Seat Locks, Idempotency Keys, Rate Limits.
- **Đặc điểm & Yêu cầu:** Tần suất Đọc/Ghi cực cao (hàng ngàn requests/giây). Dữ liệu chỉ có giá trị trong một thời gian ngắn (Ví dụ: Giữ chỗ 15 phút, Key chống trùng lặp 24h).
- **Công nghệ Lựa chọn:** **Redis** (Lưu trữ Key-Value trên RAM - NoSQL).
- **Lý do (Trade-offs):** Tốc độ phản hồi dưới 1ms giúp gỡ bỏ nút thắt cổ chai (bottleneck) của PostgreSQL. Cung cấp các **Phép toán nguyên tử (Atomic Operations như DECR)** và cơ chế **Thời gian sống (TTL - Time-to-Live)** giúp tự động hủy dữ liệu hết hạn mà không tốn chi phí chạy các tiến trình ngầm (Cronjob) để dọn dẹp cơ sở dữ liệu.

**C. Dữ liệu Tĩnh & Phi cấu trúc (Static & Unstructured Data)**

- **Thực thể:** File PDF Workshop, Ảnh Sơ đồ phòng, Ảnh QR Code.
- **Đặc điểm & Yêu cầu:** Kích thước file lớn (Binary), dạng tĩnh, không cần truy vấn tìm kiếm theo nội dung bằng SQL.
- **Công nghệ Lựa chọn:** **Object Storage** (như AWS S3, MinIO, hoặc Local File System).
- **Lý do (Trade-offs):** Giữ cho Cơ sở dữ liệu chính luôn nhẹ (chỉ lưu URL trỏ tới file). Dễ dàng tích hợp với Mạng phân phối nội dung (CDN) để tăng tốc độ tải tài nguyên cho ứng dụng Client.

### 2. Thiết kế Schema cho các Entity chính (Core Schema)

Dưới đây là cấu trúc tóm tắt của các thực thể đóng vai trò "trái tim" trong luồng nghiệp vụ Đăng ký & Thanh toán, thể hiện rõ ranh giới giữa vùng SQL (Lưu trữ bền vững) và vùng Redis (Lưu trữ trạng thái).

#### Vùng Dữ liệu Bền vững (PostgreSQL - Core Tables)

_(Lưu ý: Tất cả các bảng đều sử dụng UUID làm Khóa chính - Primary Key (PK) để tăng tính bảo mật, che giấu số lượng bản ghi thực tế và dễ dàng mở rộng phân tán)._

1. **Bảng workshops (Thông tin sự kiện)**
   - **Cột quan trọng:** workshop_id (PK), capacity, is_paid, price, status.
   - **Kiểu dữ liệu:** UUID, SMALLINT, BOOLEAN, DECIMAL, ENUM.
   - **Vai trò & Ràng buộc:** Lưu trữ thông tin gốc của sự kiện. Sử dụng ràng buộc CHECK để đảm bảo logic: nếu workshop có thu phí (is_paid = TRUE) thì giá (price) bắt buộc phải lớn hơn 0.

2. **Bảng workshop_slots (Quản lý sức chứa)**
   - **Cột quan trọng:** slot_id (PK), workshop_id (Khóa ngoại - FK, Khóa Unique - UK), total_capacity, locked_count, confirmed_count.
   - **Kiểu dữ liệu:** UUID, SMALLINT.
   - **Vai trò & Ràng buộc:** Quản lý sức chứa tổng. Được tách riêng khỏi bảng workshops để cô lập các thao tác Locking (Khóa), tránh gây tắc nghẽn khi truy vấn thông tin sự kiện. Bảng này chỉ dùng để đối soát (reconciliation) và báo cáo, **không** dùng làm "Nguồn sự thật" (Source of truth) để đếm số ghế theo thời gian thực (real-time).

3. **Bảng registrations (Đơn đặt chỗ / Order)**
   - **Cột quan trọng:** registration_id (PK), student_id (FK), workshop_id (FK), status.
   - **Kiểu dữ liệu:** UUID, ENUM (PENDING_PAYMENT, CONFIRMED, CANCELLED).
   - **Vai trò & Ràng buộc:** Quản lý vòng đời của một đơn đăng ký. Áp dụng ràng buộc UNIQUE(student_id, workshop_id) để đảm bảo một sinh viên chỉ có thể sở hữu 1 đơn đăng ký hợp lệ cho mỗi workshop.

4. **Bảng tickets (Vé vào cửa / Admission Pass)**
   - **Cột quan trọng:** ticket_id (PK), registration_id (FK, UK), qr_token (UK), status.
   - **Kiểu dữ liệu:** UUID, VARCHAR, ENUM (ACTIVE, VOID).
   - **Vai trò & Ràng buộc:** Vé vật lý/điện tử để check-in. Chỉ được sinh ra sau khi đơn đăng ký chuyển sang trạng thái CONFIRMED. Khi Mobile App hoạt động ngoại tuyến (offline), nó chỉ tải danh sách các vé đang ở trạng thái ACTIVE để giảm thiểu payload mạng.

5. **Bảng payments (Lịch sử giao dịch)**
   - **Cột quan trọng:** payment_id (PK), registration_id (FK), amount, status, **idempotency_key (UK)**.
   - **Kiểu dữ liệu:** UUID, DECIMAL, ENUM (PENDING, PROCESSING, SUCCESS, FAILED), VARCHAR.
   - **Vai trò & Ràng buộc:** Quản lý giao dịch tài chính. Cột idempotency_key (Khóa Lũy đẳng) được thiết lập UNIQUE đóng vai trò là chốt chặn cuối cùng ngăn ngừa tình trạng trừ tiền hai lần ở mức độ Cơ sở dữ liệu vật lý.

6. **Bảng checkin_records (Ghi nhận điểm danh)**
   - **Cột quan trọng:** checkin_id (PK), ticket_id (FK), workshop_id (FK), source.
   - **Kiểu dữ liệu:** UUID, ENUM (ONLINE, OFFLINE_SYNC).
   - **Vai trò & Ràng buộc:** Lưu lịch sử quét mã QR. Áp dụng ràng buộc UNIQUE(ticket_id, workshop_id) để đảm bảo khi tiến trình Đồng bộ (Sync) đẩy dữ liệu từ App Offline lên server không sinh ra các bản ghi điểm danh trùng lặp.

#### Vùng Trạng thái Tốc độ cao (Redis Data Structures)

Đây là các cấu trúc giải quyết trực tiếp bài toán hiệu năng và Tải đột biến (Traffic Spikes) cho toàn bộ hệ thống:

1. **Bộ đếm chỗ ngồi (Real-time Seat Availability)**
   - **Định dạng Key:** seat:available:{workshop_id}
   - **Giá trị (Value):** Integer (Ví dụ: 60)
   - **Hành vi:** Sử dụng lệnh DECR (Atomic Decrement) để trừ ghế. Đây là _Nguồn sự thật duy nhất (Source of Truth)_ cho luồng đăng ký. Nếu phép toán trừ trả về giá trị < 0, hệ thống lập tức báo hết chỗ (Sold Out).

2. **Khóa giữ chỗ (Seat Lock - Xử lý giam ghế chờ thanh toán)**
   - **Định dạng Key:** seat:lock:{workshop_id}:{registration_id}
   - **Giá trị (Value):** JSON payload {"student_id": "...", "locked_at": "..."}
   - **Hành vi:** Được thiết lập với **TTL = 900 giây (15 phút)**. Khóa này tự động "bốc hơi" nếu sinh viên không thanh toán kịp giờ, trả lại slot cho hệ thống một cách thụ động mà không cần Database can thiệp hay chạy lệnh DELETE.

3. **Khóa Lũy đẳng (Idempotency Key - Chống trừ tiền đúp)**
   - **Định dạng Key:** idempotency:{payment_token}
   - **Giá trị (Value):** {payment_id}
   - **Hành vi:** Hoạt động như lớp màng lọc đầu tiên (Layer 1). Sử dụng lệnh SET NX EX 86400 (TTL 24h). Nếu Key từ Client gửi lên đã tồn tại trong Redis, Backend lập tức chặn Request và trả về kết quả cũ trước khi Request đó kịp chạm tới PostgreSQL.

4. **Bộ ngắt mạch thanh toán (Circuit Breaker - Bảo vệ Payment Gateway)**
   - **Định dạng Key:** circuit:payment:{gateway}
   - **Giá trị (Value):** Hash — state machine (CLOSED/OPEN/HALF_OPEN)
   - **Fields:** state, failure_count, last_attempt, opened_at
   - **TTL:** None (managed by circuit breaker logic)
   - **Hành vi:** Lưu trạng thái của từng cổng thanh toán. Khi số lần thất bại vượt ngưỡng (5 lần), mạch chuyển sang OPEN để chặn request. Sau thời gian chờ (30 giây), chuyển sang HALF_OPEN để thử lại. Đây là cơ chế fail-fast cho payment gateway.

5. **Giới hạn tốc độ đăng ký theo người dùng (Per-user Rate Limiter)**
   - **Định dạng Key:** ratelimit:register:{userId}
   - **Giá trị (Value):** Hash — token bucket per user
   - **Fields:** tokens, last_refill_at
   - **TTL:** 300 giây (idle cleanup)
   - **Hành vi:** Giới hạn số lượng request đăng ký workshop mỗi người dùng. Token bucket được nạp lại định kỳ. Nếu hết token, request bị chặn để bảo vệ endpoint đăng ký khỏi abuse từ một tài khoản duy nhất.

6. **Giới hạn tốc độ toàn hệ thống (Global Rate Limiter - Safety Net)**
   - **Định dạng Key:** ratelimit:global:register
   - **Giá trị (Value):** String counter
   - **Hành vi:** Sử dụng lệnh INCR + EXPIRE. Ngưỡng 500 requests/second. Đây là lớp bảo vệ cuối cùng cho endpoint đăng ký, ngăn chặn DDoS và traffic đột biến từ nhiều nguồn.

7. **Blacklist Token thu hồi (Emergency Token Revocation)**
   - **Định dạng Key:** token:blacklist:{jti}
   - **Giá trị (Value):** String ("revoked")
   - **TTL:** Thời gian còn lại của JWT
   - **Hành vi:** Lưu danh sách token đã bị thu hồi khẩn cấp. Khi Admin khóa tài khoản hoặc phát hiện token bị đánh cắp, jti được thêm vào Redis. JwtAuthGuard kiểm tra key này trước khi cho phép request đi tiếp.

### Cấu hình Persistence cho Redis

Redis MUST be configured with AOF persistence for production deployment:
- `appendonly yes`
- `appendfsync everysec`

This prevents data loss on restart for critical ephemeral state:
- Idempotency keys (`idempotency:*`) — mất key = rủi ro double-charge
- Circuit breaker state (`circuit:payment:*`) — mất state = mất bảo vệ fail-fast
- Seat locks (`seat:lock:*`) — mất lock = nhả ghế sớm, overselling risk
- Rate limit buckets (`ratelimit:*`) — mất bucket = reset rate limit
