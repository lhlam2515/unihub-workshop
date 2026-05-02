# UniHub Workshop - Safety Mechanisms

## Thiết kế các cơ chế bảo vệ hệ thống

### 1. Kiểm soát tải đột biến (Traffic Spikes)

**Vấn đề:** 12.000 sinh viên truy cập đồng thời, đặc biệt dồn dập trong 3 phút đầu tiên (hành vi F5 liên tục để giành chỗ). Lượng truy cập này gây ra hai nguy cơ chí mạng: (1) Cạn kiệt CPU/RAM tại máy chủ ứng dụng và (2) Cạn kiệt Connection Pool tại Cơ sở dữ liệu do phải chờ đợi khóa (Lock wait) quá lâu. Ngoài ra, hệ thống cần đảm bảo tính công bằng (Fairness), không để các sinh viên dùng tool spam chiếm đoạt hết tài nguyên.

**Giải pháp lựa chọn: Thuật toán Token Bucket (Xô Token) tại API Gateway kết hợp Khóa bi quan có thời hạn (Pessimistic Locking with Fail-Fast) tại Backend.**

Trước khi đưa ra quyết định, nhóm đã đánh giá các phương án Rate Limiting khác:

- _Fixed Window (Cửa sổ cố định):_ Dễ cài đặt nhưng bị "lỗi dồn tải ở mốc giao thời" (có thể cho phép số lượng request gấp đôi ở ranh giới giữa 2 giây).
- _Sliding Window (Cửa sổ trượt):_ Đảm bảo tính công bằng và giới hạn rất mượt, nhưng tiêu tốn quá nhiều bộ nhớ và chi phí tính toán của máy chủ.
- _Leaky Bucket (Xô rò rỉ):_ Làm phẳng lưu lượng cực tốt (tốc độ ra cố định), nhưng lại không cho phép tải bùng nổ ngắn hạn (Burst). Điều này làm UX rất tệ vì nếu sinh viên lỡ tay bấm 2-3 lần liên tiếp sẽ bị báo lỗi ngay lập tức.

=> Nhóm chọn **Token Bucket** vì đây là thuật toán cân bằng tốt nhất: vừa chặn được spam, vừa cho phép một lượng "burst" hợp lý để bù đắp thao tác nhanh của người dùng thực.

**Cách hoạt động & Thuật toán:**

- **Cơ chế vòng ngoài (Token Bucket):** Mỗi mã sinh viên (`student_id` từ JWT) được cấp một "cái xô" có sức chứa tối đa là `N` token. Tốc độ nạp (Refill rate) là `R` token mỗi 5 giây.
- **Cơ chế vòng trong (Redis Counters & DB Fail-Fast):** Thay vì để hàng ngàn request lao thẳng vào Database tranh giành khóa, hệ thống sử dụng phép toán nguyên tử `DECR` trên Redis (`seat:available:{workshop_id}`) làm chốt chặn tốc độ cao. Chỉ những request lấy được ghế trên Redis mới được phép đi tiếp vào Database để ghi nhận Đơn hàng (`registrations`). Tại DB, hệ thống vẫn áp dụng Khóa bi quan kèm `Lock Wait Timeout = 3s` (Fail-Fast) làm lớp bảo vệ cuối cùng chống quá tải Connection Pool.
- **Quy trình:** Khi request đến, hệ thống lấy 1 token. Nếu xô rỗng, chặn ngay tại API Gateway. Nếu xô còn token, request trừ ghế trên Redis. Nếu thành công, request đi vào Database xếp hàng đợi cấp khóa. Nếu hàng đợi quá dài khiến thời gian chờ vượt quá `Lock Wait Timeout`, Database tự động hủy giao dịch, Backend lập tức trả lỗi về cho người dùng (Fail-Fast) thay vì giữ kết nối vô thời hạn.

**Ngưỡng thiết lập (Thresholds) dự kiến:**

- **Capacity (Kích thước xô):** `5` tokens (Cho phép burst tối đa 5 requests để bù đắp thao tác nhanh của người dùng).
- **Refill Rate (Tốc độ nạp):** `1` token/5 giây.
- **Database Lock Wait Timeout:** `3` giây.
- **Hành vi khi vượt ngưỡng:**
  - Nếu bị chặn ở Gateway: Trả về mã lỗi `HTTP 429 Too Many Requests`.
  - Nếu bị chặn ở Backend (Timeout): Trả về mã lỗi `HTTP 503 Service Unavailable`.
  - Thông báo chung trên UI: _"Hệ thống đang quá tải, vui lòng thử lại sau vài giây"_. Giao diện tự động vô hiệu hóa nút "Đăng ký" trong 2-3 giây.

**Lý do phù hợp & Sự đánh đổi (Trade-offs):**

- _Về kiểm soát tải:_ Giải pháp này tuân thủ nguyên lý KISS. Token Bucket bảo vệ máy chủ một cách tiết kiệm tài nguyên nhất. Việc sử dụng Fail-Fast tại Backend là một sự đánh đổi thông minh: thà chủ động từ chối phục vụ (hiển thị thông báo quá tải) còn hơn là giữ kết nối vô thời hạn dẫn đến sập toàn bộ hệ thống (Cascading Failure).

- _Về tính công bằng (Fairness) và Hàng đợi (Message Queue):_ Theo lý thuyết kiến trúc, để đảm bảo sự công bằng tuyệt đối (First-In-First-Out - ai bấm trước chắc chắn được trước), các hệ thống lớn thường áp dụng Message Queue (như Kafka/RabbitMQ) hoặc Admission Control để đưa request vào hàng đợi xử lý tuần tự. Tuy nhiên, nhóm đã **quyết định loại bỏ Message Queue cho luồng đăng ký**.

**Lý do đánh đổi:** Việc dùng Queue sẽ biến quy trình đăng ký thành luồng Bất đồng bộ (Asynchronous), buộc sinh viên phải chờ màn hình loading rất lâu để nhận kết quả, đồng thời làm tăng độ phức tạp của hệ thống vượt quá giới hạn 2 tuần của đồ án. Thay vào đó, nhóm định nghĩa "Tính công bằng" ở đây là _ngăn chặn sự lạm dụng (anti-spam)_. Hệ thống chấp nhận sự công bằng tương đối theo nguyên lý "First-come-first-served" tại cổng API Gateway và dựa vào hàng đợi tự nhiên của Connection Pool trong Database.

### 2. Xử lý cổng thanh toán không ổn định (Payment Instability)

**Vấn đề:** Việc kết nối với cổng thanh toán bên ngoài (Third-party Payment Gateway) luôn tiềm ẩn rủi ro về độ trễ lớn (High Latency) hoặc lỗi hệ thống (5xx/Timeout). Nếu không có cơ chế bảo vệ, hàng ngàn luồng (threads) đăng ký workshop sẽ bị treo để chờ phản hồi từ cổng thanh toán, dẫn đến cạn kiệt tài nguyên máy chủ và làm sập toàn bộ các tính năng không liên quan khác (như xem lịch, Admin, hay đồng bộ CSV).

**Giải pháp lựa chọn: Pattern Circuit Breaker (Ngắt mạch) kết hợp Graceful Degradation (Giảm cấp dịch vụ).**
Nhóm quyết định áp dụng bộ ngắt mạch tại lớp tích hợp (Payment Adapter) để cô lập hoàn toàn rủi ro từ phía đối tác. Khi "cầu chì" ngắt, hệ thống sẽ ngừng gọi sang cổng thanh toán và chuyển sang chế độ hoạt động ưu tiên các dịch vụ nội bộ.

**Cách hoạt động & Các trạng thái:**
Bộ ngắt mạch theo dõi kết quả của các yêu cầu thanh toán (lưu trạng thái trên Redis) và chuyển đổi giữa 3 trạng thái:

- **CLOSED (Mạch đóng - Bình thường):** Các yêu cầu thanh toán được gửi đi bình thường. Hệ thống ghi nhận tỷ lệ lỗi và thời gian phản hồi. Nếu mọi thứ ổn định, mạch tiếp tục đóng.
- **OPEN (Mạch hở - Sự cố):** Khi số lần thất bại liên tiếp đạt **failure_count >= 5 trong vòng 60 giây**, mạch sẽ tự động ngắt.
  - _Hành vi:_ Mọi yêu cầu thanh toán mới bị từ chối ngay lập tức tại Backend (Fail-fast) mà không gửi sang cổng thanh toán.
  - _Graceful Degradation:_ Hệ thống vẫn cho phép sinh viên xem lịch, đọc tóm tắt AI, và đăng ký workshop miễn phí. Với workshop có phí, nút "Thanh toán" sẽ được ẩn hoặc thay thế bằng thông báo: _"Dịch vụ thanh toán đang bảo trì, đơn đăng ký của bạn đã được ghi nhận ở trạng thái Chờ (Pending)."_
- **HALF-OPEN (Nửa mở - Thử nghiệm):** Sau **30 giây** nguội, Circuit Breaker Recovery Monitor cron (mỗi 30s) tự động chuyển từ OPEN sang HALF_OPEN. Hệ thống cho phép **1 request thực tế** đi qua làm "Canary Request". Nếu thành công, mạch đóng lại (CLOSED), `failure_count = 0`. Nếu vẫn lỗi, mạch tiếp tục mở (OPEN).

**Lý do phù hợp & Sự đánh đổi (Trade-offs):**

- **Lý do:** UniHub là một hệ thống đa chức năng. Việc cổng thanh toán "chết" không được phép kéo theo việc sinh viên không thể xem lịch workshop hay nhân sự không thể check-in. Giải pháp này giúp thu hẹp **Vùng ảnh hưởng (Blast Radius)** của lỗi xuống mức thấp nhất.
- **Đánh đổi:** Hệ thống chấp nhận mất doanh thu tạm thời từ các workshop có phí (do chặn thanh toán) để đổi lấy sự ổn định tuyệt đối cho toàn bộ 12.000 người dùng đang truy cập các tính năng khác.

### 3. Chống trừ tiền hai lần (Preventing Double Charging)

**Vấn đề:** Trong điều kiện mạng không ổn định, sinh viên có thể bấm "Thanh toán" nhiều lần hoặc hệ thống tự động retry khi gặp timeout. Nếu không kiểm soát, một giao dịch có thể bị xử lý nhiều lần, dẫn đến việc sinh viên bị trừ tiền đúp cho cùng một chỗ ngồi.

**Giải pháp lựa chọn: Khóa lũy đẳng (Idempotency Key) bảo vệ 2 lớp (Redis + PostgreSQL).**
Nhóm thiết kế cơ chế đảm bảo một yêu cầu thanh toán dù được gửi đi bao nhiêu lần thì kết quả xử lý cuối cùng tại Backend vẫn chỉ là duy nhất.

**Cơ chế & Luồng xử lý:**

1. **Sinh Key:** Client hoặc Backend sinh một `Idempotency Key` duy nhất (VD: UUID hoặc `REG_{id}_attempt`) trước khi bắt đầu phiên thanh toán.
2. **Lớp bảo vệ 1 (Redis In-memory):** Trước khi thao tác DB, Backend kiểm tra Key bằng lệnh `SET NX idempotency:{key} EX 86400` (TTL 24 giờ). Nếu Key đã tồn tại, hệ thống lập tức chặn request, trả về trạng thái hoặc kết quả cũ để tránh truy vấn DB vô ích.
3. **Lớp bảo vệ 2 (PostgreSQL Unique Constraint):** Key được lưu vào cột `idempotency_key` của bảng `payments` với ràng buộc `UNIQUE`. Đây là Source of Truth (Nguồn sự thật) chống Race Condition trong trường hợp Redis bị Cache Miss.
4. **Quản lý trạng thái:**
   - Nếu giao dịch đang ở trạng thái `PENDING`, hệ thống cảnh báo: _"Giao dịch đang được xử lý, vui lòng không thao tác lại"_.
   - Nếu trạng thái là `SUCCESS`, hệ thống trả về kết quả thành công ngay lập tức mà không gọi cổng thanh toán.
   - **Xử lý giam ghế:** Đối với nghiệp vụ giữ chỗ, hệ thống sử dụng một cấu trúc độc lập trên Redis (`seat:lock:{workshop_id}:{registration_id}`) với **TTL 15 phút** để tự động nhả ghế nếu đơn hàng không được thanh toán kịp thời.

**Lý do phù hợp & Sự đánh đổi (Trade-offs):**

- **Lý do:** Việc khóa thao tác ở Frontend (Disable button) rất dễ bị vượt qua. Đưa Idempotency Key về quản lý tập trung qua 2 lớp Backend là giải pháp an toàn tuyệt đối để bảo vệ quyền lợi tài chính của sinh viên.
- **Đánh đổi:** Tăng thêm độ phức tạp trong logic code Backend. Tuy nhiên, việc sử dụng Redis làm Lớp bảo vệ 1 giúp chi phí truy vấn Database để kiểm tra trùng lặp gần như bằng 0, tối ưu hoàn toàn hiệu năng hệ thống.
