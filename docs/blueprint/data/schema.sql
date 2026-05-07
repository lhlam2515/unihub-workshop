-- =============================================================================
-- UniHub Workshop — PostgreSQL DDL Schema
-- Version: 2.0 (aligned with design.md ADR-02)
-- Architecture: PostgreSQL (persistent) + Redis (auxiliary: cache, rate limiting, queue)
-- Source of truth: PostgreSQL for all persistent data (xem design.md dòng 14)
-- Bounded Contexts: Identity | Event Core | Transaction | Async
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- ENUMS — Centralized state definitions
-- =============================================================================

-- Design.md ADR-02: status cho registrations
-- 'CONFIRMED' phân biệt free-workshop (không qua payment) với paid-workshop đang chờ thanh toán
-- Gap fix: user-flow analysis cho thấy free workshop không có terminal state rõ ràng nếu thiếu 'CONFIRMED'
CREATE TYPE registration_status AS ENUM (
    'PENDING',      -- Chờ thanh toán (chỉ workshop có phí, price > 0)
    'CONFIRMED',    -- Hoàn tất đăng ký (workshop miễn phí, price = 0) — KHÔNG qua payment flow
    'PAID',         -- Thanh toán thành công (workshop có phí)
    'CANCELLED'     -- Đã hủy (bởi student hoặc BTC cancel workshop)
);

-- Design.md dòng 97: status TEXT CHECK ('INITIATED','SUCCEEDED','FAILED','UNRESOLVED')
CREATE TYPE payment_status AS ENUM (
    'INITIATED',    -- Đã tạo payment record, đang gọi gateway
    'SUCCEEDED',    -- Gateway trả 200 OK
    'FAILED',       -- Gateway trả 4xx (declined)
    'UNRESOLVED'    -- Gateway timeout/5xx — NON-TERMINAL, cần reconciliation
);

CREATE TYPE payment_gateway AS ENUM ('VNPAY', 'STRIPE', 'MOMO', 'MOCK');

-- Design.md dòng 61: status TEXT CHECK ('DRAFT','OPEN','CLOSED','CANCELLED')
CREATE TYPE workshop_status AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- Design.md dòng 64-65: summary_status CHECK ('NONE','QUEUED','PROCESSING','DONE','FAILED')
CREATE TYPE summary_status AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED');


-- =============================================================================
-- BOUNDED CONTEXT 1: IDENTITY
-- Entities: students, staff, device_tokens
-- Design.md ADR-02 dòng 18-48: tách biệt students (TEXT PK) và staff (UUID PK)
-- device_tokens (Gap fix): lưu FCM/APNs push token cho in-app notification (ADR-09)
-- =============================================================================

-- Design.md dòng 24-30
CREATE TABLE students (
    student_id    TEXT PRIMARY KEY,              -- Mã sinh viên từ hệ thống trường (VD: 21127001)
    email         TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    password_hash TEXT,                          -- NULL nếu auth qua SSO trường (Stage 5)
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE students IS
    'Hồ sơ sinh viên. Source of truth: CSV export từ hệ thống quản lý sinh viên (xem ADR-12). '
    'student_id là TEXT PK (mã trường) — cho phép upsert từ CSV với ON CONFLICT (student_id).';

COMMENT ON COLUMN students.password_hash IS
    'NULL nếu trường dùng SSO (Stage 5). Hiện tại dùng password-based auth (ADR-04).';


-- Design.md dòng 34-43
CREATE TABLE staff (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('BTC', 'CHECKIN_STAFF')),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE staff IS
    'Nhân sự nội bộ (BTC, check-in staff). Tách biệt khỏi students — '
    'không dùng bảng users chung (xem ADR-02 rationale).';

CREATE INDEX idx_staff_role ON staff(role) WHERE is_active = true;


-- Gap fix: device_tokens — Push notification token cho in-app channel (ADR-09)
-- User-flow: Sinh viên nhận thông báo qua app sau đăng ký → cần FCM/APNs token
-- Tại sao tách bảng riêng (không cột trên students):
--   1 student có thể có nhiều device (iOS + Android + tablet) → 1-to-many
--   Token có lifecycle riêng (rotate khi app reinstall, expire sau 30 ngày không dùng)
CREATE TABLE device_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    -- ON DELETE CASCADE: khi student bị xóa/deactivated, tokens tự xóa — không có orphan tokens
    token       TEXT NOT NULL,
    -- FCM token (Android) hoặc APNs device token (iOS) — sinh bởi Firebase/Apple SDK
    platform    TEXT NOT NULL CHECK (platform IN ('IOS', 'ANDROID')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    -- false khi: user logout, FCM trả "token_expired/unregistered", hoặc job đêm dọn stale tokens
    last_seen   TIMESTAMPTZ DEFAULT now(),
    -- Cập nhật mỗi khi app foreground → job đêm SET is_active=false nếu last_seen > 30 ngày
    created_at  TIMESTAMPTZ DEFAULT now(),

    UNIQUE (token)  -- FCM/APNs token là globally unique per device-app installation
);

COMMENT ON TABLE device_tokens IS
    'FCM/APNs push token cho in-app notification (ADR-09 InAppChannel strategy). '
    'Một student có nhiều device → 1-to-many với students. '
    'UNIQUE(token) bảo vệ khỏi duplicate registration khi token bị re-issue cho cùng device. '
    'ON DELETE CASCADE trên student_id: orphan token không tồn tại sau khi student bị xóa.';

COMMENT ON COLUMN device_tokens.last_seen IS
    'Update mỗi khi app mở (foreground event). Cleanup job đêm: '
    'SET is_active=false WHERE last_seen < now() - interval ''30 days''. '
    'Tránh gửi push đến stale devices (tốn FCM quota, trigger token_not_registered error).';

COMMENT ON COLUMN device_tokens.is_active IS
    'false khi: (1) user logout → DELETE /device-tokens/:token, '
    '(2) FCM trả "token_not_registered" → InAppChannel tự SET false, '
    '(3) cleanup job đêm (last_seen > 30d). '
    'Không DELETE ngay để giữ lịch sử debug notification failures.';

-- Partial index: query pattern "lấy tất cả active tokens của student X để dispatch push"
CREATE INDEX idx_device_tokens_student ON device_tokens(student_id) WHERE is_active = true;


-- =============================================================================
-- BOUNDED CONTEXT 2: EVENT CORE
-- Entities: speakers, rooms, workshops
-- Design.md ADR-02 dòng 49-73
-- =============================================================================

CREATE TABLE speakers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   VARCHAR(255) NOT NULL,
    title       VARCHAR(255),                -- Chức danh: "CTO tại Công ty X"
    bio         TEXT,
    avatar_url  VARCHAR(1000),               -- URL trỏ tới Object Storage
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE speakers IS 'Diễn giả workshop. Có thể xuất hiện ở nhiều workshop.';


CREATE TABLE rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,       -- VD: "Phòng B2-01"
    building        VARCHAR(100),
    floor           SMALLINT,
    capacity        SMALLINT NOT NULL,
    floor_plan_url  VARCHAR(1000),               -- Sơ đồ phòng, URL trỏ Object Storage
    facilities      JSONB,                       -- {"projector": true, "ac": true, "mic": 2}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_rooms_capacity CHECK (capacity > 0)
);

COMMENT ON TABLE rooms IS 'Phòng tổ chức sự kiện. Là entity riêng để hỗ trợ đổi phòng và conflict detection.';

CREATE INDEX idx_rooms_name ON rooms (name);


-- Design.md ADR-02 dòng 50-73 (updated): workshops với room_id và speaker_id FKs
-- Gap fix (user-flow):
--   Flow 1 (sinh viên xem detail): cần "thông tin diễn giả" + "sơ đồ phòng" → speaker_id + room_id FK
--   Flow 7 (BTC đổi phòng): cần FK reference, không phải text free-form → room_id FK
--   location TEXT đã được thay bằng rooms entity (tách để tránh duplicate floor_plan_url)
CREATE TABLE workshops (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,

    -- Gap fix: FK thay cho location TEXT NOT NULL (ADR-02 original)
    -- NULL cho phép ở status='DRAFT' — BTC chưa cần chọn phòng khi tạo draft
    -- Khi publish (draft → open): application layer enforce room_id IS NOT NULL
    -- Lý do không dùng DB CHECK: không thể viết conditional NOT NULL đơn giản
    --   theo status trong PostgreSQL mà không có trigger — app-layer validation rõ ràng hơn
    room_id         UUID REFERENCES rooms(id),

    -- Gap fix: FK đến speakers table (thay vì text free-form trong description)
    -- NULL cho phép: BTC có thể tạo workshop trước khi confirm diễn giả
    speaker_id      UUID REFERENCES speakers(id),

    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    seats_total     INT NOT NULL CHECK (seats_total > 0),
    seats_available INT NOT NULL CHECK (seats_available >= 0 AND seats_available <= seats_total),
    price           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 0 = free workshop
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED')),
    -- ADR-14: Summary fields gộp trực tiếp trên workshops (không tách bảng riêng)
    pdf_url         TEXT,
    summary_text    TEXT,
    summary_status  TEXT DEFAULT 'NONE'
                    CHECK (summary_status IN ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED')),
    created_by      UUID REFERENCES staff(id),
    -- ADR-03: Optimistic Lock; BIGINT tránh overflow dưới spike đăng ký
    version         BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CHECK (ends_at > starts_at)
);

COMMENT ON TABLE workshops IS
    'Thực thể trung tâm. seats_total + seats_available trực tiếp trên workshops — '
    'không tách bảng workshop_slots riêng (xem ADR-02 Section 4 rationale). '
    'Optimistic Lock qua version column (xem ADR-03). '
    'Summary + PDF fields gộp trực tiếp (xem ADR-14: "Không tách bảng 1-1"). '
    'room_id FK thay thế location TEXT — cho phép lưu floor_plan_url và hỗ trợ đổi phòng. '
    'speaker_id FK — cho phép hiển thị thông tin diễn giả trên detail page.';

COMMENT ON COLUMN workshops.room_id IS
    'FK đến rooms.id. NULL được phép ở status=draft. '
    'Application layer enforce NOT NULL khi publish (draft→open). '
    'Cho phép JOIN rooms.floor_plan_url để hiển thị sơ đồ phòng cho sinh viên (Gap fix Flow 1).';

COMMENT ON COLUMN workshops.speaker_id IS
    'FK đến speakers.id. NULL được phép — BTC có thể tạo workshop trước khi confirm diễn giả. '
    'Cho phép JOIN speakers.(full_name, title, bio, avatar_url) cho trang chi tiết workshop.';

COMMENT ON COLUMN workshops.seats_available IS
    'Source of truth cho available seats (PostgreSQL). '
    'Redis cache:workshop:{id}:seats là cache hint 10s TTL (xem ADR-13) — '
    'KHÔNG phải source of truth.';

COMMENT ON COLUMN workshops.version IS
    'Optimistic lock counter. Incremented on every seat-draining UPDATE. '
    'BIGINT (không INT) — tránh overflow dưới spike đăng ký (ADR-02).';

-- Partial index: chỉ index workshop đang open để scan nhanh
CREATE INDEX idx_workshops_status_starts ON workshops(status, starts_at) WHERE status = 'OPEN';

-- Gap fix: index cho lookup theo phòng (BTC xem lịch sử phòng, conflict detection)
CREATE INDEX idx_workshops_room ON workshops(room_id, starts_at);


-- =============================================================================
-- BOUNDED CONTEXT 3: TRANSACTION
-- Entities: registrations, payments, checkins, idempotency_keys
-- Design.md ADR-02 dòng 74-143
-- =============================================================================

-- Design.md dòng 75-88
CREATE TABLE registrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id   UUID NOT NULL REFERENCES workshops(id),
    student_id    TEXT NOT NULL REFERENCES students(student_id),
    -- Gap fix: thêm 'CONFIRMED' cho free workshop (price = 0)
    -- State machine:
    --   Free:  [INSERT] → 'CONFIRMED' (terminal, không qua payment)
    --   Paid:  [INSERT] → 'PENDING' → 'PAID' (payment succeeded)
    --                             → 'CANCELLED' (payment failed / BTC cancel)
    -- Ảnh hưởng check-in (Flow 5): query WHERE status IN ('PAID', 'CONFIRMED')
    --   Nếu chỉ check 'PAID', free-workshop registrations bị từ chối check-in → bug nghiệp vụ
    status        TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED')),
    qr_code       TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    registered_at TIMESTAMPTZ DEFAULT now(),

    -- ADR-03: DB constraint ngăn 1 SV đăng ký 2 lần (dự phòng cho idempotency bug)
    UNIQUE (workshop_id, student_id)
);

COMMENT ON TABLE registrations IS
    'Đơn đăng ký workshop. qr_code là UUID v4 độc lập (không dùng id) — '
    'ngăn brute-force scan từ registration ID (xem design.md rationale dòng 186-187). '
    'status=confirmed dành cho free workshops (price=0), status=paid cho paid workshops. '
    'Check-in staff query: WHERE status IN (''PAID'', ''CONFIRMED'') — không thể chỉ check ''PAID''.';

COMMENT ON COLUMN registrations.status IS
    'pending: chờ payment (chỉ paid workshop). '
    'confirmed: đăng ký hoàn tất không qua payment (free workshop, price=0). '
    'paid: payment gateway xác nhận thành công. '
    'cancelled: hủy bởi student hoặc BTC cancel workshop.';

CREATE INDEX idx_registrations_workshop ON registrations(workshop_id);
CREATE INDEX idx_registrations_student  ON registrations(student_id);
CREATE INDEX idx_registrations_qr       ON registrations(qr_code);


-- Design.md dòng 91-103
CREATE TABLE payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id    UUID NOT NULL REFERENCES registrations(id),
    amount             NUMERIC(10,2) NOT NULL,
    currency           TEXT NOT NULL DEFAULT 'VND',
    gateway_charge_id  TEXT,                    -- ID từ gateway, NULL nếu chưa nhận response
    status             TEXT NOT NULL CHECK (status IN ('INITIATED', 'SUCCEEDED', 'FAILED', 'UNRESOLVED')),
    idempotency_key    TEXT NOT NULL REFERENCES idempotency_keys(key),
    created_at         TIMESTAMPTZ DEFAULT now(),
    resolved_at        TIMESTAMPTZ
);

COMMENT ON TABLE payments IS
    'Giao dịch thanh toán. idempotency_key có FK đến idempotency_keys(key) — '
    'ADR-08: không thể tạo payment record mà không có idempotency key entry tương ứng. '
    'status UNRESOLVED là non-terminal — cho phép retry với cùng key (xem ADR-08).';

COMMENT ON COLUMN payments.gateway_charge_id IS
    'ID giao dịch từ payment gateway. NULL khi chưa gọi gateway hoặc chưa nhận response.';

-- Partial index: monitor initiated + unresolved payments (cần timeout job hoặc reconciliation)
CREATE INDEX idx_payments_status_created ON payments(status, created_at)
    WHERE status IN ('INITIATED', 'UNRESOLVED');


-- Design.md dòng 106-115
CREATE TABLE checkins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id),
    checked_in_at   TIMESTAMPTZ NOT NULL,    -- Timestamp từ device
    received_at     TIMESTAMPTZ DEFAULT now(), -- Server-side timestamp
    checked_by      UUID NOT NULL REFERENCES staff(id),
    client_local_id TEXT,                     -- local_id từ SQLite mobile (dedup sync batch)

    UNIQUE (registration_id)                  -- First check-in wins; INSERT ON CONFLICT DO NOTHING
);

COMMENT ON TABLE checkins IS
    'Ghi nhận tham dự. UNIQUE(registration_id) = first-check-in-wins. '
    'client_local_id lưu local_id từ mobile SQLite — dùng để dedup sync batch (ADR-11).';

COMMENT ON COLUMN checkins.client_local_id IS
    'UUID từ mobile device. Cho phép server trả "duplicate" kèm ID để mobile cập nhật local status, '
    'giảm số lượng conflict query.';

CREATE INDEX idx_checkins_staff_received ON checkins(checked_by, received_at);


-- Design.md dòng 121-137. ADR-03 và ADR-08 dùng chung bảng này (resource_type phân cách)
CREATE TABLE idempotency_keys (
    key            TEXT PRIMARY KEY,            -- UUID v4 sinh từ client trước khi gửi request
    resource_type  TEXT NOT NULL CHECK (resource_type IN ('REGISTRATION', 'PAYMENT')),
    status         TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'UNRESOLVED')),
    -- 'IN_PROGRESS'  : đang xử lý, locked_until còn hiệu lực
    -- 'COMPLETED'    : kết quả xác định (200/4xx) — terminal, response_body đáng tin để cache
    -- 'UNRESOLVED'   : đã gọi gateway nhưng không nhận được response (timeout/network drop)
    --                  KHÔNG terminal — retry với cùng key (xem ADR-08)
    response_body  JSONB,                       -- NULL khi in_progress/unresolved
    status_code    INT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    expires_at     TIMESTAMPTZ,                 -- TTL = created_at + 24h; job đêm dọn
    locked_until   TIMESTAMPTZ                  -- Deadline của in_progress (~30s); crash recovery
);

COMMENT ON TABLE idempotency_keys IS
    'Idempotency keys dùng chung cho registration (ADR-03) và payment (ADR-08). '
    '3-state lifecycle: in_progress → completed (terminal) | unresolved (non-terminal). '
    'Redis KHÔNG dùng làm idempotency store (xem ADR-08 Section 4: "Redis là volatile").';

COMMENT ON COLUMN idempotency_keys.locked_until IS
    'Deadline cho in_progress state. Nếu quá hạn mà status vẫn in_progress → crash recovery: '
    'có thể retry safely. Default ~30s từ thời điểm claim.';

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);


-- =============================================================================
-- BOUNDED CONTEXT 4: ASYNC
-- Entities: import_logs, notification_logs, notification_channel_configs
-- Design.md ADR-12 (import_logs), ADR-09 (notification_logs), ADR-14 (summary trên workshops)
-- =============================================================================

-- Design.md dòng 144-153 (ADR-12)
CREATE TABLE import_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at          TIMESTAMPTZ DEFAULT now(),
    total_rows      INT,
    success_count   INT,
    failed_count    INT,
    error_file_path TEXT,                     -- Đường dẫn file errors/YYYY-MM-DD.csv (local filesystem)
    triggered_by    TEXT NOT NULL CHECK (triggered_by IN ('CRON', 'MANUAL')),
    status          TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED'))
);

COMMENT ON TABLE import_logs IS
    'Log cho mỗi lần chạy CSV import pipeline (ADR-12). '
    'error_file_path trỏ đến file CSV local (không S3) — errors/YYYY-MM-DD.csv trong thư mục input. '
    'Concurrent run protection: check import_logs có row status=in_progress trước khi start.';

COMMENT ON COLUMN import_logs.error_file_path IS
    'Đường dẫn file CSV chứa các dòng lỗi. Format: errors/YYYY-MM-DD.csv. '
    'File này được sinh ra trong Stage 5 của pipeline ADR-12, '
    'lưu trên local filesystem (không object storage) để giảm dependency.';


-- Design.md dòng 156-167 (ADR-09)
CREATE TABLE notification_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,                      -- student_id hoặc staff.id
    event_type  TEXT NOT NULL,                      -- 'registration_confirmed', 'workshop_cancelled', ...
    channel     TEXT NOT NULL,                      -- 'email', 'in_app', 'telegram'
    status      TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'TIMEOUT')),
    error_msg   TEXT,                               -- NULL nếu sent
    payload     JSONB,                              -- Snapshot payload để retry thủ công nếu cần
    created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE notification_logs IS
    'Audit trail cho mọi thông báo. user_id là TEXT vì có thể là student_id (TEXT) hoặc staff.id (UUID). '
    'Partial index idx_notif_logs_failed dùng cho retry job.';

CREATE INDEX idx_notif_logs_failed ON notification_logs(status, created_at)
    WHERE status IN ('FAILED', 'TIMEOUT');


-- Bảng hỗ trợ ADR-09: cấu hình channel (không có trong design.md schema block,
-- nhưng cần cho Strategy Pattern của notification system)
CREATE TABLE notification_channel_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type    TEXT NOT NULL UNIQUE,          -- 'email', 'in_app', 'telegram'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    config_json     JSONB NOT NULL DEFAULT '{}',   -- Endpoint, API key pattern, template ID, v.v.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_channel_configs IS
    'Cấu hình kênh thông báo. Externalize channel config để hỗ trợ mở rộng kênh mới '
    '(Telegram, Zalo, SMS) mà không cần thay đổi code notification core.';


-- =============================================================================
-- TRIGGERS — Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Áp dụng trigger cho tất cả bảng có cột updated_at
-- device_tokens KHÔNG có updated_at (last_seen thay vai trò đó — semantics khác nhau)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'students', 'staff', 'speakers', 'rooms',
        'workshops', 'notification_channel_configs'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;


-- =============================================================================
-- VIEWS — Convenience queries
-- =============================================================================

-- Gap fix: view mở rộng với room và speaker JOINs
-- Trước đây không có room/speaker JOIN vì workshops dùng location TEXT thuần
-- Sau khi thêm room_id FK và speaker_id FK, view có thể expose thông tin đầy đủ
-- cho API GET /workshops (list view) mà không cần application-layer JOIN
CREATE VIEW v_workshop_availability AS
SELECT
    w.id,
    w.title,
    w.starts_at,
    w.ends_at,
    w.status,
    w.seats_total,
    w.seats_available,
    (w.seats_total - w.seats_available) AS reserved_count,
    w.price,
    -- Room info (nullable: NULL nếu workshop ở status='DRAFT' chưa assign phòng)
    r.id            AS room_id,
    r.name          AS room_name,
    r.building      AS room_building,
    r.floor         AS room_floor,
    r.floor_plan_url AS room_map_url,  -- Sơ đồ phòng — hiển thị cho sinh viên (Flow 1)
    -- Speaker info (nullable: NULL nếu chưa confirm diễn giả)
    s.id            AS speaker_id,
    s.full_name     AS speaker_name,
    s.title         AS speaker_title,
    s.bio           AS speaker_bio,
    s.avatar_url    AS speaker_avatar_url
FROM workshops w
LEFT JOIN rooms    r ON w.room_id    = r.id
LEFT JOIN speakers s ON w.speaker_id = s.id
WHERE w.status = 'OPEN';

COMMENT ON VIEW v_workshop_availability IS
    'Workshop đang mở với thông tin phòng và diễn giả đầy đủ. '
    'LEFT JOIN rooms: NULL nếu draft chưa assign phòng (không xuất hiện trong view vì WHERE status=open). '
    'LEFT JOIN speakers: NULL nếu chưa confirm diễn giả — frontend hiển thị "TBA". '
    'seats_available là source of truth từ PostgreSQL (xem ADR-02 dòng 14). '
    'Redis cache:workshop:{id}:seats là cache hint 10s TTL (cache-aside, xem ADR-13) — '
    'KHÔNG phải source of truth. Không dùng DECR trên Redis key này. '
    'Dùng cho cả reporting lẫn hiển thị real-time (qua Redis cache layer).';
