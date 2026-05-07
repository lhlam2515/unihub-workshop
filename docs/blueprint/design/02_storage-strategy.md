# UniHub Workshop — Storage Strategy

## Thiết kế cơ sở dữ liệu

Hệ thống UniHub Workshop đối mặt với hai thái cực dữ liệu: một bên là dữ liệu tài chính/đặt chỗ đòi hỏi tính chính xác tuyệt đối, một bên là dữ liệu trạng thái (giữ chỗ, đếm lượt truy cập) biến đổi cực nhanh trong các khung giờ cao điểm. Do đó, nhóm quyết định áp dụng chiến lược **Lưu trữ Lai (Explicit Hybrid Storage)**, chia dữ liệu thành 3 nhóm để xử lý bằng các công nghệ chuyên biệt.

**Nguyên tắc cốt lõi:** PostgreSQL là **sole source of truth** cho mọi dữ liệu persistent. Redis là lớp phụ trợ (cache, rate limiting, message queue) — không bao giờ là source of truth. (xem `design.md` dòng 14, ADR-02 Section 1)

### 1. Phân loại dữ liệu và Lý do lựa chọn Database

**A. Dữ liệu Giao dịch Cốt lõi (Core Transactional Data)**

- **Thực thể:** Users (Students, Staff), Device Tokens, Speakers, Rooms, Workshops, Registrations, Payments, Check-ins, Idempotency Keys, Import Logs, Notification Logs.
- **Đặc điểm & Yêu cầu:** Có cấu trúc quan hệ chặt chẽ. Yêu cầu tính toàn vẹn dữ liệu (ACID) tuyệt đối. Sai lệch dữ liệu sẽ dẫn đến lỗi nghiệp vụ nghiêm trọng (như bán vượt số chỗ - Overselling, hoặc trừ tiền hai lần - Double-charging).
- **Công nghệ Lựa chọn:** **PostgreSQL** (Hệ quản trị CSDL quan hệ - RDBMS / SQL).
- **Lý do (Trade-offs):** Hỗ trợ Transaction mạnh mẽ. Cung cấp cơ chế **Optimistic Locking** thông qua cột `version` + `UPDATE ... WHERE version = ? AND seats_available > 0` (xem ADR-03). Các ràng buộc (Constraints như CHECK, UNIQUE, FOREIGN KEY) bảo vệ tính đúng đắn của dữ liệu ở mức vật lý. `ON CONFLICT` (PostgreSQL native upsert) cho phép idempotent insert cho cả registration (ADR-03) và payment (ADR-08).

**B. Dữ liệu Tốc độ cao & Vòng đời ngắn (High-Velocity & Ephemeral Data)**

- **Thực thể:** Seat Availability Cache, Workshop List Cache, Rate Limiting Counters, Message Queue Streams, Token Blacklist.
- **Đặc điểm & Yêu cầu:** Tần suất Đọc/Ghi cực cao (hàng ngàn requests/giây). Dữ liệu chỉ có giá trị trong một thời gian ngắn (TTL vài giây đến vài phút). Không yêu cầu ACID — eventual consistency là chấp nhận được.
- **Công nghệ Lựa chọn:** **Redis** (Lưu trữ Key-Value trên RAM - NoSQL) với 3 vai trò logic:
  - **DB0 — Cache:** Cache-Aside với Write-Invalidate. Cho `seats_available` (TTL 10s) và workshop list (TTL 60s). `maxmemory-policy: allkeys-lru`.
  - **DB1 — Message Queue:** BullMQ cho async processing (AI summary, notification dispatch). `maxmemory-policy: noeviction`.
  - **DB2 — Rate Limiting:** Sliding Window Counters (Sorted Set) 3-tier độc lập. `maxmemory-policy: volatile-ttl`.
- **Lý do (Trade-offs):** Tốc độ phản hồi dưới 1ms giúp gỡ bỏ nút thắt cổ chai (bottleneck) của PostgreSQL. Các **Phép toán nguyên tử** (INCR, DECR, ZADD, SET NX) cho phép thao tác an toàn trên dữ liệu tạm thời. Cơ chế **TTL (Time-to-Live)** giúp tự động dọn dẹp dữ liệu hết hạn. Redis hoạt động trên RAM với cấu trúc dữ liệu phong phú phù hợp với các bài toán real-time khác nhau.

**C. Dữ liệu Tĩnh & Nhị phân (Static & Binary Data)**

- **Thực thể:** File PDF Workshop, File CSV đầu vào (Legacy System), File CSV lỗi (Error Quarantine).
- **Đặc điểm & Yêu cầu:** Kích thước file lớn (Binary), dạng tĩnh, không cần truy vấn tìm kiếm theo nội dung bằng SQL.
- **Công nghệ Lựa chọn:** **Local File System** (Docker volume) cho giai đoạn prototyping; Object Storage (AWS S3 / Cloudflare R2) cho production.
- **Lý do (Trade-offs):** Giữ cho Cơ sở dữ liệu chính luôn nhẹ (chỉ lưu URL trỏ tới file). Dễ dàng tích hợp với CDN để tăng tốc độ tải tài nguyên. Dễ dàng migrate từ local filesystem lên S3-compatible storage mà không cần thay đổi schema.

---

### 2. Thiết kế Schema cho các Entity chính (Core Schema)

Dưới đây là cấu trúc các thực thể chính theo `design.md` ADR-02 và `data/schema.sql`. Tất cả các bảng sử dụng UUID làm Khóa chính (PK) để tăng tính bảo mật, che giấu số lượng bản ghi thực tế và dễ dàng mở rộng phân tán.

#### Vùng Dữ liệu Bền vững (PostgreSQL — Core Tables)

**1. Bảng students (Sinh viên — Identity Context)**

- **Cột quan trọng:** `student_id` (PK, TEXT), `email`, `full_name`, `password_hash`, `updated_at`.
- **Kiểu dữ liệu:** TEXT, TEXT, TEXT, TEXT (nullable — NULL nếu auth qua SSO), TIMESTAMPTZ.
- **Vai trò & Ràng buộc:** `student_id` là TEXT PK (mã sinh viên từ hệ thống trường, VD: 21127001). Thiết kế này cho phép upsert từ CSV với `ON CONFLICT (student_id)` mà không cần mapping giữa student_id và UUID — xem ADR-12.

**2. Bảng staff (Nhân sự nội bộ — Identity Context)**

- **Cột quan trọng:** `id` (PK, UUID), `email` (UNIQUE), `full_name`, `password_hash`, `role`, `is_active`, `created_at`.
- **Kiểu dữ liệu:** UUID, TEXT, TEXT, TEXT, TEXT CHECK (role IN ('BTC', 'CHECKIN_STAFF')), BOOLEAN, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:** Tách biệt khỏi `students` vì lifecycle khác nhau — staff được provision thủ công bởi admin, không qua CSV import. `idx_staff_role` partial index WHERE `is_active = true`.

**3. Bảng device_tokens (Push Token — Identity Context)**

- **Cột quan trọng:** `id` (PK, UUID), `student_id` (FK → students, ON DELETE CASCADE), `token` (UNIQUE), `platform`, `is_active`, `last_seen`, `created_at`.
- **Kiểu dữ liệu:** UUID, TEXT, TEXT, TEXT CHECK (platform IN ('IOS', 'ANDROID')), BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:**
  - Lưu FCM token (Android) hoặc APNs device token (iOS) để gửi push notification qua in-app channel (ADR-09).
  - User-flow: sinh viên nhận thông báo xác nhận đăng ký qua app → InAppChannel cần token.
  - Một student có nhiều device (1-to-many) — tách bảng riêng, không thêm cột vào `students`.
  - `UNIQUE (token)`: FCM/APNs token là globally unique per device-app installation.
  - `ON DELETE CASCADE` trên `student_id`: orphan token tự xóa khi student bị deactivate.
  - `last_seen`: cập nhật khi app foreground; cleanup job đêm SET `is_active = false` nếu `last_seen > 30 ngày`.
  - `is_active = false` (không DELETE): giữ lịch sử để debug notification failures.
- **Indexes:** `idx_device_tokens_student` partial index WHERE `is_active = true` — pattern query: "lấy tất cả active tokens của student X để dispatch push".
- **Token lifecycle (ADR-09 InAppChannel):**
  - App start: `UPSERT ON CONFLICT (token) DO UPDATE SET last_seen=now(), is_active=true`
  - App logout: `UPDATE SET is_active=false WHERE token=:token`
  - FCM trả `token_not_registered`: InAppChannel tự SET `is_active=false`

**4. Bảng speakers (Diễn giả — Event Core Context)**

- **Cột quan trọng:** `id` (PK, UUID), `full_name`, `title`, `bio`, `avatar_url`.
- **Vai trò:** Diễn giả của workshop. Có thể xuất hiện ở nhiều workshop. `avatar_url` trỏ tới Object Storage.

**5. Bảng rooms (Phòng tổ chức — Event Core Context)**

- **Cột quan trọng:** `id` (PK, UUID), `name` (UNIQUE), `building`, `floor`, `capacity`, `floor_plan_url`, `facilities` (JSONB).
- **Vai trò:** Phòng tổ chức sự kiện. Là entity riêng để hỗ trợ đổi phòng và conflict detection. `capacity` là sức chứa vật lý của phòng (khác `seats_total` của workshop). `floor_plan_url` trỏ tới Object Storage — là nguồn cung cấp "sơ đồ phòng" mà spec yêu cầu hiển thị cho sinh viên.

**6. Bảng workshops (Thông tin sự kiện — Event Core Context)**

- **Cột quan trọng:** `id` (PK, UUID), `title`, `description`, `room_id` (FK → rooms), `speaker_id` (FK → speakers), `starts_at`, `ends_at`, `seats_total`, `seats_available`, `price`, `status`, `pdf_url`, `summary_text`, `summary_status`, `created_by`, `version`, `created_at`, `updated_at`.
- **Kiểu dữ liệu:** UUID, TEXT, TEXT, UUID (nullable FK), UUID (nullable FK), TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, NUMERIC(10,2), TEXT CHECK (...), TEXT, TEXT, TEXT CHECK (...), UUID (FK → staff), BIGINT, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:**
  - `room_id FK` thay thế `location TEXT NOT NULL` (gap fix): cho phép JOIN `rooms.floor_plan_url` để hiển thị sơ đồ phòng, và hỗ trợ "đổi phòng" của BTC bằng cách cập nhật FK thay vì text.
  - `speaker_id FK` thay thế thông tin diễn giả inline (gap fix): cho phép JOIN `speakers.(full_name, title, bio, avatar_url)` cho trang chi tiết — đúng với spec "thông tin diễn giả".
  - Cả `room_id` và `speaker_id` đều **nullable**: BTC có thể tạo draft workshop trước khi confirm phòng và diễn giả. Application layer enforce NOT NULL khi publish (status: `DRAFT → OPEN`).
  - `seats_total` và `seats_available` lưu trực tiếp trên workshops (không tách bảng `workshop_slots` riêng) — xem ADR-02 Section 4 rationale.
  - `seats_available` là **source of truth** cho available seats. Redis cache chỉ là hint TTL 10s (xem ADR-13).
  - `version` là Optimistic Lock counter, tăng mỗi khi UPDATE. BIGINT tránh overflow dưới spike đăng ký (ADR-03).
  - `summary_status` enum đầy đủ: `NONE`/`QUEUED`/`PROCESSING`/`DONE`/`FAILED`.
  - CHECK constraints: `seats_total > 0`, `seats_available >= 0 AND seats_available <= seats_total`, `ends_at > starts_at`.
- **Indexes:**
  - `idx_workshops_status_starts` partial index WHERE `status = 'OPEN'` — chỉ workshop đang mở mới được query bởi sinh viên, giảm size index xuống 1/4.
  - `idx_workshops_room` trên `(room_id, starts_at)` — BTC xem lịch sử phòng, phát hiện room conflict.

**7. Bảng registrations (Đơn đăng ký — Transaction Context)**

- **Cột quan trọng:** `id` (PK, UUID), `workshop_id` (FK → workshops), `student_id` (FK → students), `status`, `qr_code` (UNIQUE), `registered_at`.
- **Kiểu dữ liệu:** UUID, UUID, TEXT, TEXT CHECK (status IN ('PENDING', **'CONFIRMED'**, 'PAID', 'CANCELLED')), TEXT, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:**
  - `UNIQUE (workshop_id, student_id)` — DB constraint ngăn 1 SV đăng ký 2 lần, kể cả khi idempotency logic có bug.
  - `qr_code` là UUID v4 độc lập (KHÔNG dùng `id`) — ngăn brute-force scan từ registration ID.
  - **State machine (Gap fix — thêm `'CONFIRMED'`):**
    - `PENDING`: chờ payment — chỉ dùng cho workshop có phí (`price > 0`).
    - `CONFIRMED`: đăng ký hoàn tất không qua payment — chỉ dùng cho workshop miễn phí (`price = 0`). *Trước đây không có state này → free workshop không có terminal state rõ ràng.*
    - `PAID`: payment gateway xác nhận thành công (workshop có phí).
    - `CANCELLED`: hủy bởi student hoặc BTC cancel workshop.
  - **Ảnh hưởng check-in (Flow 5):** staff app validate `WHERE status IN ('PAID', 'CONFIRMED')` — không thể chỉ check `'PAID'` vì free workshop registrations sẽ bị từ chối sai.

**8. Bảng payments (Lịch sử giao dịch — Transaction Context)**

- **Cột quan trọng:** `id` (PK, UUID), `registration_id` (FK → registrations), `amount`, `currency`, `gateway_charge_id`, `status`, `idempotency_key` (FK → idempotency_keys), `created_at`, `resolved_at`.
- **Kiểu dữ liệu:** UUID, UUID, NUMERIC(10,2), TEXT DEFAULT 'VND', TEXT, TEXT CHECK (...), TEXT, TIMESTAMPTZ, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:** `idempotency_key` có FK đến `idempotency_keys(key)` — không thể tạo payment record mà không có idempotency key entry tương ứng. `idx_payments_status_created` partial index WHERE status IN ('INITIATED', 'UNRESOLVED') cho reconciliation job.

**9. Bảng idempotency_keys (Khóa lũy đẳng — Transaction Context)**

- **Cột quan trọng:** `key` (PK, TEXT), `resource_type`, `status`, `response_body` (JSONB), `status_code`, `created_at`, `expires_at`, `locked_until`.
- **Kiểu dữ liệu:** TEXT, TEXT CHECK (...), TEXT CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'UNRESOLVED')), JSONB, INT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ.
- **Vai trò & Ràng buộc:** Dùng chung cho cả registration (ADR-03) và payment (ADR-08), phân biệt bằng `resource_type` ('registration'/'payment'). 3-state lifecycle: `IN_PROGRESS` → `COMPLETED` (terminal) | `UNRESOLVED` (non-terminal, cho phép retry). `locked_until` là deadline cho crash recovery (~30s). Redis KHÔNG dùng làm idempotency store (xem ADR-08 Section 4).

**10. Bảng checkins (Ghi nhận điểm danh — Transaction Context)**

- **Cột quan trọng:** `id` (PK, UUID), `registration_id` (FK, UNIQUE), `checked_in_at`, `received_at`, `checked_by` (FK → staff), `client_local_id`.
- **Kiểu dữ liệu:** UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ DEFAULT now(), UUID, TEXT.
- **Vai trò & Ràng buộc:** `UNIQUE (registration_id)` — first check-in wins. `client_local_id` lưu local_id từ mobile SQLite — dùng để dedup sync batch (ADR-11).

**11. Bảng import_logs (Audit CSV import — Async Context)**

- **Cột quan trọng:** `id` (PK, UUID), `run_at`, `total_rows`, `success_count`, `failed_count`, `error_file_path`, `triggered_by`, `status`.
- **Vai trò:** Log cho mỗi lần chạy CSV import pipeline (ADR-12). `triggered_by` CHECK ('CRON', 'MANUAL'). Concurrent run protection: check có row `status='IN_PROGRESS'` trước khi start.

**12. Bảng notification_logs (Audit Notification — Async Context)**

- **Cột quan trọng:** `id` (PK, UUID), `user_id` (TEXT), `event_type`, `channel`, `status`, `error_msg`, `payload` (JSONB).
- **Vai trò:** Audit trail cho mọi thông báo (ADR-09). `idx_notif_logs_failed` partial index WHERE status IN ('FAILED', 'TIMEOUT'). `user_id` là TEXT để chứa cả `student_id` (TEXT) lẫn `staff.id` (UUID dạng string). Channel in-app dispatch đọc `device_tokens` của student trước khi gửi push — kết quả (sent/failed) ghi vào đây.

**13. Bảng notification_channel_configs (Cấu hình kênh — Async Context)**

- **Cột quan trọng:** `id` (PK, UUID), `channel_type` (UNIQUE), `is_active`, `config_json` (JSONB).
- **Vai trò:** Externalize channel config để hỗ trợ mở rộng kênh mới (Telegram, Zalo, SMS) mà không cần thay đổi code notification core.

#### Vùng Trạng thái Tốc độ cao (Redis Data Structures)

Redis đóng **3 vai trò** độc lập, mỗi vai trò trên một logical database riêng:

**Vai trò 1 — Cache (DB0: allkeys-lru)**

1. **Bộ đếm chỗ ngồi (Cache-Aside)**
   - **Key:** `cache:workshop:{workshop_id}:seats`
   - **Kiểu:** String (integer)
   - **TTL:** 10 giây
   - **Hành vi:** Cache-Aside + Write-Invalidate (xem ADR-13). Đây là **cache hint**, KHÔNG phải source of truth. Source of truth là `workshops.seats_available` trong PostgreSQL. Cache stale dưới 10s → OL collision → retry → đọc DB → đúng correctness.
   - **Read path:** `GET` → hit trả về, miss → `SELECT seats_available FROM workshops` → `SET ... EX 10` → trả về.
   - **Write path:** Sau OL UPDATE commit → `DEL` (fire-and-forget, ngoài transaction).

2. **Workshop list cache**
   - **Key:** `cache:workshop:list`
   - **Kiểu:** String (JSON array)
   - **TTL:** 60 giây
   - **Hành vi:** Cache danh sách workshop đang `status='OPEN'`. TTL dài hơn (60s) vì dữ liệu ít thay đổi hơn seats.

**Vai trò 2 — Rate Limiting (DB2: volatile-ttl)**

1. **Sliding Window Counters (3-tier độc lập — ADR-06)**
   - **Thuật toán:** Sliding Window Counter với Redis Sorted Set (score=timestamp, member=timestamp).
   - **Pipeline:** `MULTI { ZREMRANGEBYSCORE key 0 {window_start} → ZADD key {now} {now} → ZCARD key → EXPIRE key 60 } EXEC` → IF count > threshold → 429.

   | Tier | Key | Threshold | Window | Purpose |
   |------|-----|-----------|--------|---------|
   | T1 — IP | `rl:ip:{ip_address}` | 60 req | 60s | Bảo vệ unauthenticated endpoints |
   | T2 — User | `rl:user:{user_id}` | 30 req | 60s | Per-user fairness (authenticated) |
   | T3 — Reg | `rl:reg:{user_id}:{workshop_id}` | 5 req | 60s | Chống spam click một workshop (giảm hot-row contention ADR-03) |

**Vai trò 3 — Message Queue (DB1: noeviction)**

1. **BullMQ cho async processing (ADR-10)**
   - **Stream keys:** `Queue: ai-summary`, `Queue: notification`, `Queue: payment-timeout`.
   - **DLQ keys:** `Queue: ai-summary-dlq`, `Queue: notification-dlq`.
   - **Pattern:** Job queue với `@Processor` decorator + auto-ack. Stalled job detection built-in reclaim job khi worker crash.
   - **Crash recovery:** BullMQ stalled job detection — job bị crash (worker không ack) tự động được reclaim sau 30s.
   - **Retry:** 3 lần với exponential backoff → job chuyển vào DLQ → admin can thiệp thủ công.

**Vai trò phụ trợ (Deferred / Scope phụ)**

1. **Token Blacklist (Placeholder — ngoài scope Stage 1-2)**
   - **Key:** `token:blacklist:{jti}`
   - **TTL:** Thời gian còn lại của JWT
   - **Hành vi:** Revoke JWT trước hạn (ví dụ: admin kick user). Deferred đến Stage 5.
   - **⚠️ Yêu cầu bắt buộc khi implement Stage 5:** Token Blacklist **phải** dùng DB1 (`noeviction`), **không phải DB0** (`allkeys-lru`). DB0 với policy `allkeys-lru` có thể evict key chưa hết TTL dưới memory pressure — token đã revoke sẽ pass validation như token hợp lệ (security breach). Với `noeviction`, Redis trả OOM error thay vì silent evict — fail-loud thay vì fail-silent. Xem chi tiết tại `redis-keys.md` Section 4.

2. **Circuit Breaker (In-memory, KHÔNG Redis — ADR-07)**
   - Circuit breaker state được lưu **in-process memory** (process variable), không phải Redis.
   - Lý do: Modular Monolith single-process (ADR-01) — tất cả request qua cùng CB instance, không cần distributed state coordination.
   - Restart process = reset CB về CLOSED — correctness guarantee (gateway có thể đã phục hồi trong lúc restart).

### Cấu hình Persistence cho Redis

Redis được deploy dưới dạng managed service (Upstash/Redis 7+), persistence được quản lý bởi provider.

**Tác động khi mất Redis (degrade có kiểm soát):**

| Chức năng | Ảnh hưởng | Cơ chế bảo vệ |
|-----------|-----------|---------------|
| Cache (seats, workshop list) | Cache miss → đọc từ DB | Correctness vẫn đúng (OL ở DB), chỉ chậm hơn |
| Rate Limiting | Tắt — tất cả request đi qua | OL (ADR-03) vẫn bảo vệ seat contention |
| Message Queue | Job queue treo | AI summary không xử lý; workshop vẫn hoạt động |
| Circuit Breaker | In-memory → không ảnh hưởng | Không phụ thuộc Redis |
| Idempotency Keys | Lưu trong PostgreSQL → không ảnh hưởng | Không phụ thuộc Redis |

**Không có Redis data nào là source of truth.** Mất Redis không gây mất dữ liệu giao dịch. Đây là quyết định thiết kế cốt lõi (xem ADR-02).
