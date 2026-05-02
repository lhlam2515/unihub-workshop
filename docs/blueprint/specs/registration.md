# Đặc tả: Quản lý đăng ký Workshop

## Mô tả

Hệ thống quản lý toàn bộ vòng đời đăng ký workshop của sinh viên — từ khi sinh viên gửi yêu cầu đăng ký (vượt qua 3 lớp kiểm soát tải), xác nhận chỗ ngồi qua Redis atomic DECR, cấp ticket QR, cho đến khi hủy đăng ký và giải phóng chỗ. Hỗ trợ cả workshop miễn phí (xác nhận ngay) và workshop trả phí (giữ chỗ 15 phút chờ thanh toán). Bảo vệ IDOR ở mọi truy vấn: tất cả truy vấn đều gắn `WHERE student_id = jwt.sub`.

## Luồng chính

### 1. Kiểm soát tải 3 lớp (Load Control Pipeline)

Mọi yêu cầu `POST /registrations` phải vượt qua 3 lớp theo thứ tự sau:

**Lớp 1 — Token Bucket (Per-User):**
- Redis Hash key: `ratelimit:register:{userId}`
- Dung lượng: 5 token, tốc độ refill: 1 token/giây
- Key TTL: 300 giây (dọn dẹp khi không hoạt động)
- Yêu cầu đầu tiên khởi tạo bucket với 4 token (5 trừ 1 consumed)
- Các yêu cầu sau tính refill dựa trên thời gian trôi qua từ `last_refill_at`
- Nếu bucket còn token: giảm token và cho phép đi tiếp
- Nếu bucket rỗng: trả về HTTP 429 `RATE_LIMIT_EXCEEDED` kèm `retry_after`

**Lớp 2 — Global Rate Limiter:**
- Redis key: `ratelimit:global:register`
- Ngưỡng: 500 request/giây, window cố định 1 giây
- Dùng INCR + EXPIRE 1s
- Nếu counter > 500: trả về HTTP 429

**Lớp 3 — Atomic Seat DECR:**
- Redis key: `seat:available:{workshopId}`
- DECR atomic, nếu kết quả >= 0: giữ chỗ thành công
- Nếu kết quả < 0: INCR rollback, trả về `SEAT_UNAVAILABLE`

### 2. Đăng ký workshop miễn phí

```
POST /registrations { workshop_id }
```

**Điều kiện:** Workshop PUBLISHED, `is_paid = false`, còn chỗ, sinh viên chưa đăng ký.

**Luồng:**
1. Vượt qua 3 lớp kiểm soát tải
2. Kiểm tra workshop tồn tại, PUBLISHED, `is_paid = false`
3. Kiểm tra duplicate registration (sinh viên chưa đăng ký workshop này)
4. DECR `seat:available:{workshopId}`
5. Tạo registration với `status = CONFIRMED`
6. Tạo ticket với `status = ACTIVE` và `qr_token` duy nhất
7. Phát hành event `REGISTRATION_CONFIRMED` lên message queue
8. Trả về HTTP 201: `{ registration_id, ticket_id, status: "CONFIRMED" }`

### 3. Đăng ký workshop trả phí

```
POST /registrations { workshop_id }
```

**Điều kiện:** Workshop PUBLISHED, `is_paid = true`, còn chỗ, sinh viên chưa đăng ký.

**Luồng:**
1. Vượt qua 3 lớp kiểm soát tải
2. Kiểm tra workshop tồn tại, PUBLISHED, `is_paid = true`
3. Kiểm tra duplicate registration
4. DECR `seat:available:{workshopId}`
5. Tạo registration với `status = PENDING_PAYMENT`
6. Tạo Redis seat lock: `seat:lock:{workshopId}:{registrationId}` với TTL = 900s
7. `payment_deadline = now() + 15 phút`
8. Trả về HTTP 201: `{ registration_id, payment_deadline, amount }`

### 4. Hủy đăng ký

```
DELETE /registrations/{id}
```

**Luồng:**
1. Xác thực IDOR: registration phải thuộc về `jwt.sub`
2. Kiểm tra status hiện tại: chỉ hủy được CONFIRMED hoặc PENDING_PAYMENT
3. Chuyển registration `status = CANCELLED`, ghi `cancelled_at = now()`
4. Vô hiệu hóa ticket: `status = VOID`, `voided_at = now()` (nếu có)
5. Tăng `seat:available:{workshopId}` lên 1 (INCR)
6. Xóa `seat:lock:{workshopId}:{registrationId}` (nếu có)
7. Phát hành event `REGISTRATION_CANCELLED`
8. Trả về HTTP 200

### 5. Xem lịch sử đăng ký

```
GET /students/me/registrations
GET /students/me/registrations/{id}
```

**Luồng:**
1. Truy vấn registrations với `WHERE student_id = jwt.sub` (IDOR enforced)
2. JOIN workshop để lấy thông tin workshop (title, starts_at, room)
3. Include ticket `qr_token` nếu status là CONFIRMED
4. Hỗ trợ filter theo status và phân trang (cursor hoặc offset)
5. Chi tiết một registration: thêm thông tin thanh toán
6. Nếu không phải registration của user: trả về HTTP 404

### 6. Seat Counter

**Khởi tạo:** Khi workshop được publish, gọi `SeatCounterService.initialize(workshopId, capacity)` → Redis SET `seat:available:{workshopId}` = capacity (không TTL).

**Truy vấn:** `getAvailable(workshopId)`:
- Nếu Redis key tồn tại: trả về giá trị Redis
- Nếu Redis miss: fallback đọc `workshop_slots` (total_capacity - confirmed_count)
- Nếu cả Redis và DB đều miss: trả về 0

**Xóa:** Khi workshop bị hủy: `SeatCounterService.delete(workshopId)` → Redis DEL (idempotent).

## Kịch bản lỗi

### Token bucket cạn kiệt
- **Nguyên nhân:** Sinh viên gửi > 5 request trong thời gian ngắn
- **Hậu quả:** HTTP 429 `RATE_LIMIT_EXCEEDED` kèm `retry_after` (thời gian chờ đến khi có token mới)
- **Phục hồi:** Tự động sau 1 giây/token refill

### Global rate limit vượt ngưỡng
- **Nguyên nhân:** Hơn 500 request/giây trên toàn hệ thống
- **Hậu quả:** HTTP 429 `RATE_LIMIT_EXCEEDED`
- **Phục hồi:** Tự động sau khi window 1 giây reset

### Hết chỗ (Sold out)
- **Nguyên nhân:** DECR trả về -1
- **Hậu quả:** HTTP 409 `SEAT_UNAVAILABLE` — Redis tự động INCR rollback
- **Xử lý:** Atomic DECR + rollback ngăn overselling ngay cả khi concurrent

### Đăng ký trùng (Duplicate)
- **Nguyên nhân:** Sinh viên đã có registration ACTIVE/CONFIRMED/PENDING_PAYMENT cho workshop này
- **Hậu quả:** HTTP 409 `REGISTRATION_DUPLICATE`

### Hủy đăng ký đã hủy
- **Nguyên nhân:** Registration đã ở trạng thái CANCELLED
- **Hậu quả:** HTTP 409 `REGISTRATION_CANCELLED`

### IDOR — truy cập registration của người khác
- **Nguyên nhân:** Sinh viên A cố tình truy cập hoặc hủy registration của sinh viên B
- **Hậu quả:** HTTP 404 — không lộ thông tin về sự tồn tại của record

### Seat lock hết hạn (Paid workshop)
- **Nguyên nhân:** Thanh toán không được thực hiện trong 15 phút
- **Hậu quả:** Redis key `seat:lock:{wid}:{rid}` tự động expire
- **Xử lý:** Payment timeout cron sẽ phát hiện và chuyển registration thành CANCELLED

### Concurrent DECR race condition
- **Nguyên nhân:** 2 request cùng DECR khi chỉ còn 1 chỗ
- **Hậu quả:** Request thứ 2 nhận -1 → INCR rollback về 0 → `SEAT_UNAVAILABLE`
- **Đảm bảo:** Không overselling nhờ tính atomic của DECR

## Ràng buộc

### Hiệu năng
- Token Bucket: 5 token/user, refill 1/s, key TTL 300s
- Global rate limit: 500 req/s, window 1s
- Seat lock TTL: 900 giây (15 phút) cho paid workshop
- Redis là primary source cho seat counter; DB là fallback
- Tất cả thao tác Redis phải hoàn thành trong < 50ms

### Bảo mật
- IDOR enforced ở tất cả endpoint: `WHERE student_id = jwt.sub`
- Truy cập trái phép trả về HTTP 404 (không phải 403) — không lộ thông tin record tồn tại
- Role-based: STUDENT mới có quyền gọi `POST /registrations`
- Các endpoint admin được bảo vệ bởi ORGANIZER role

### Tính nhất quán
- DECR + INCR rollback là atomic — không overselling
- Seat lock TTL tự động expire sau 15 phút
- Payment timeout cron (mỗi 1 phút) xử lý các PENDING_PAYMENT quá hạn
- Reconciliation cron (mỗi 10 phút) phát hiện drift > 5 — chỉ warning, không auto-fix
- Khi hủy registration: INCR seat + DEL seat lock trong cùng transaction
- Event `REGISTRATION_CONFIRMED` và `REGISTRATION_CANCELLED` được phát hành bất đồng bộ qua message queue

### Storage
- Redis: `ratelimit:register:{userId}`, `ratelimit:global:register`, `seat:available:{workshopId}`, `seat:lock:{workshopId}:{registrationId}`
- PostgreSQL: registrations table, tickets table, workshop_slots table

## Tiêu chí chấp nhận

1. **Token bucket rate limiting:**
   - Gửi 6 request liên tiếp trong 1 giây → request thứ 6 nhận HTTP 429
   - Chờ 1 giây → request mới được xử lý (1 token refill)

2. **Global rate limiting:**
   - 501 request trong cùng 1 giây → request thứ 501 nhận HTTP 429
   - Giây tiếp theo → request mới được xử lý

3. **Atomic seat DECR:**
   - 2 request DECR đồng thời khi còn 1 chỗ → request thứ 2 nhận `SEAT_UNAVAILABLE`
   - Giá trị Redis cuối cùng không bao giờ âm

4. **Free workshop registration:**
   - `POST /registrations` với free workshop → HTTP 201 kèm `status: "CONFIRMED"`, `ticket_id`
   - Ticket được tạo với `qr_token` duy nhất
   - `seat:available:{wid}` giảm 1

5. **Paid workshop registration:**
   - `POST /registrations` với paid workshop → HTTP 201 kèm `status: "PENDING_PAYMENT"`, `payment_deadline`
   - Redis `seat:lock:{wid}:{rid}` tồn tại với TTL ~ 900s
   - `seat:available:{wid}` giảm 1

6. **Cancel registration:**
   - `DELETE /registrations/{id}` với registration hợp lệ → HTTP 200
   - Registration status = CANCELLED, ticket status = VOID
   - `seat:available:{wid}` tăng 1
   - `seat:lock:{wid}:{rid}` bị xóa

7. **IDOR protection:**
   - `GET /students/me/registrations` chỉ trả về registration của user hiện tại
   - `DELETE /registrations/{id}` với registration của user khác → HTTP 404

8. **Duplicate detection:**
   - `POST /registrations` 2 lần cho cùng workshop → lần 2 nhận HTTP 409

9. **Seat counter DB fallback:**
   - Xóa Redis key `seat:available:{wid}` → `getAvailable()` trả về giá trị từ DB
   - `total_capacity - confirmed_count` khớp với kỳ vọng
