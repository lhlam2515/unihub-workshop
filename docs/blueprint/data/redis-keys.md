# UniHub Workshop - Redis Keys Blueprint

1. SEAT AVAILABILITY COUNTER
   Key: seat:available:{workshop_id}
   Type: String (integer)
   Cmd: DECR (atomic, thread-safe)
   Init: SET seat:available:{wid} {total_capacity} khi PUBLISH workshop
   TTL: None (persistent, reset khi workshop cancelled/completed)
   Note: Source of truth cho available seats. Nếu DECR trả về < 0 → INCR lại → báo hết chỗ.

2. SEAT LOCK (Giữ chỗ chờ thanh toán)
   Key: seat:lock:{workshop_id}:{registration_id}
   Type: String (JSON payload)
   Value: {"student_id": "...", "locked_at": "...", "amount": 150000}
   Cmd: SET NX EX 900
   TTL: 900 giây (15 phút)
   Note: Tự expire. Scheduled job đọc số key seat:lock:{wid}:\* còn sống
   để reconcile workshop_slots.locked_count trong PostgreSQL.

3. IDEMPOTENCY KEY (Chống double-charge)
   Key: idempotency:{idempotency_key}
   Type: String
   Value: {payment_id}
   Cmd: SET NX EX 86400
   TTL: 86400 giây (24 giờ)
   Note: Layer 1 check. Layer 2 là UNIQUE constraint trên payments.idempotency_key.

4. CIRCUIT BREAKER STATE (Payment gateway)
   Key: circuit:payment:{gateway}
   Type: Hash
   Fields:
   state → CLOSED | OPEN | HALF_OPEN
   failure_count → số lần fail liên tiếp
   opened_at → timestamp khi chuyển sang OPEN
   last_attempt → timestamp của lần gọi gần nhất
   TTL: None (managed by circuit breaker logic)
   Thresholds:
   CLOSED → OPEN: failure_count >= 5 trong 60 giây
   OPEN → HALF_OPEN: sau 30 giây
   HALF_OPEN → CLOSED: 1 success call

5. RATE LIMIT BUCKET (Kiểm soát tải đột biến)
   Thuật toán: Token Bucket per user
   Key: ratelimit:register:{user_id}
   Type: Hash
   Fields:
   tokens → số token còn lại
   last_refill_at → timestamp refill gần nhất
   TTL: 300 giây (reset nếu user không active)
   Config:
   Bucket capacity: 5 requests
   Refill rate: 1 token / 10 giây
   Global API protection:
   Key: ratelimit:global:register
   Type: String (counter)
   Cmd: INCR + EXPIRE (sliding window)
   Threshold: 500 requests / giây toàn hệ thống → trả 429 Too Many Requests

6. TOKEN BLACKLIST (Thu hồi quyền khẩn cấp)
   Key: token:blacklist:{jti}
   Type: String
   Value: "revoked"
   Cmd: SET EX {remaining_ttl}
   TTL: Bằng với thời gian sống còn lại của JWT (Tính bằng: JWT.exp - Current_Time)
   Note: Dùng để vô hiệu hóa ngay lập tức Access Token đang còn hạn (VD: khóa tài khoản, báo mất thiết bị). Middleware xác thực bắt buộc phải tra cứu key này (~1ms). Nếu key tồn tại → lập tức chặn Request (Trả về 401 Unauthorized).
