-- =============================================================================
-- UniHub Workshop — PostgreSQL DDL Schema
-- Version: 3.0 (aligned with actual Drizzle implementation)
-- Architecture: PostgreSQL (persistent) + Redis (auxiliary: cache, rate limiting, queue)
-- Source of truth: PostgreSQL for all persistent data (xem adr.md ADR-02)
-- Bounded Contexts: Identity | Event Core | Transaction | Async | Idempotency
-- Total: 17 tables, 15 enum types
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- ENUMS — Centralized state definitions (15 types)
-- =============================================================================

-- Identity enums
CREATE TYPE staff_role AS ENUM ('BTC', 'CHECKIN_STAFF');
CREATE TYPE platform AS ENUM ('IOS', 'ANDROID');

-- Workshop lifecycle
CREATE TYPE workshop_status AS ENUM ('DRAFT', 'OPEN', 'CANCELLED', 'COMPLETED');

-- Registration state machine
CREATE TYPE registration_status AS ENUM (
    'PENDING',      -- Chờ thanh toán (chỉ workshop có phí)
    'CONFIRMED',    -- Hoàn tất đăng ký (workshop miễn phí) — không qua payment flow
    'PAID',         -- Thanh toán thành công
    'CANCELLED'     -- Đã hủy
);

-- Payment trạng thái
CREATE TYPE payment_status AS ENUM (
    'INITIATED',    -- Đã tạo payment record, đang gọi gateway
    'SUCCEEDED',    -- Gateway trả 200 OK
    'FAILED',       -- Gateway trả 4xx
    'UNRESOLVED'    -- Gateway timeout/5xx — non-terminal, cần reconciliation
);

CREATE TYPE payment_gateway AS ENUM ('VNPAY', 'STRIPE', 'MOMO', 'MOCK');

-- Notification enums
CREATE TYPE notification_type AS ENUM (
    'REGISTRATION_CONFIRMED',
    'REGISTRATION_CANCELLED',
    'WORKSHOP_UPDATED',
    'WORKSHOP_CANCELLED',
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'PAYMENT_CONFIRMED_LATE',
    'PAYMENT_FAILED_RECONCILED',
    'CHECKIN_REMINDER',
    'CSV_IMPORT_COMPLETED_WITH_ERRORS'
);

CREATE TYPE notification_channel AS ENUM ('APP', 'EMAIL', 'TELEGRAM');

CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'TIMEOUT');

-- Check-in
CREATE TYPE checkin_source AS ENUM ('ONLINE', 'OFFLINE_SYNC');

-- CSV sync
CREATE TYPE sync_job_status AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');
CREATE TYPE sync_error_reason AS ENUM ('DUPLICATE', 'INVALID_FORMAT', 'MISSING_FIELD', 'UNKNOWN');

-- AI summary
CREATE TYPE summary_status AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- Document upload
CREATE TYPE document_upload_status AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- Idempotency
CREATE TYPE idempotency_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'UNRESOLVED');


-- =============================================================================
-- BOUNDED CONTEXT 1: IDENTITY
-- Entities: students, staff, checkin_staff_assignments, device_tokens
-- ADR-02: tách biệt students (TEXT PK) và staff (UUID PK)
-- =============================================================================

-- ADR-02, ADR-12: student_id là TEXT PK (mã sinh viên từ CSV)
CREATE TABLE students (
    student_id    TEXT PRIMARY KEY,              -- Mã sinh viên từ hệ thống trường
    email         TEXT,                          -- NULL nếu CSV không có email
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE students IS
    'Hồ sơ sinh viên. student_id là TEXT PK (mã trường) — cho phép CSV upsert. '
    'password_hash NOT NULL — authentication dùng password trực tiếp.';

COMMENT ON COLUMN students.email IS
    'NULL nếu dữ liệu CSV import không có email. '
    'Không có UNIQUE constraint — một email có thể xuất hiện nhiều lần trong legacy data.';

CREATE INDEX idx_students_email ON students(email);


-- ADR-02 Section 4: staff tách biệt students
CREATE TABLE staff (
    staff_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          staff_role NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staff IS
    'Nhân sự nội bộ (BTC, check-in staff). Tách biệt khỏi students — '
    'không dùng bảng users chung (ADR-02 rationale). Lifecycle khác: '
    'students qua CSV import, staff qua manual provision.';

COMMENT ON COLUMN staff.is_active IS
    'Soft-deactivate staff khi không còn làm việc, giữ nguyên lịch sử check-in.';

CREATE INDEX idx_staff_role ON staff(role) WHERE is_active = true;
CREATE INDEX idx_staff_email ON staff(email);


-- `checkin_staff_assignments` — maps check-in staff to their authorized workshops
-- ADR-04, ADR-11, `02_storage-strategy.md`
-- Mỗi staff có 1 row (UNIQUE staff_id), workshop_ids là JSONB array
CREATE TABLE checkin_staff_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id      UUID NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    workshop_ids  JSONB NOT NULL DEFAULT '[]',       -- JSON array of workshop UUIDs
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (staff_id)
);

COMMENT ON TABLE checkin_staff_assignments IS
    'Phân quyền check-in staff — staff nào được check-in cho workshop nào. '
    'UNIQUE(staff_id) = mỗi staff chỉ có một assignment row. '
    'workshop_ids là JSONB array cho phép update dễ dàng không cần bảng pivot.';

COMMENT ON COLUMN checkin_staff_assignments.workshop_ids IS
    'JSONB array chứa danh sách workshop UUIDs mà staff được phép check-in. '
    'Ví dụ: ["uuid-1", "uuid-2"]. Update atomic bằng jsonb_set.';

CREATE INDEX idx_checkin_staff_assignments_staff ON checkin_staff_assignments(staff_id);


-- ADR-09: FCM/APNs push token cho in-app notification
CREATE TABLE device_tokens (
    device_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,         -- FCM (Android) / APNs (iOS) token
    platform        platform NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE device_tokens IS
    'Push notification tokens. Một student có nhiều device → 1-to-many. '
    'ON DELETE CASCADE: xóa student → xóa tokens. '
    'is_active=false khi token expired (FCM trả unregistered) hoặc user logout.';

COMMENT ON COLUMN device_tokens.is_active IS
    'false khi: (1) user logout, (2) FCM trả "unregistered" → tự SET false, '
    '(3) cleanup job đêm (last_seen > 30d). Giữ row để debug notification failures.';

COMMENT ON COLUMN device_tokens.last_seen IS
    'Cập nhật mỗi khi app mở. Cleanup job: SET is_active=false '
    'WHERE last_seen < now() - interval \'30 days\'.';

CREATE INDEX idx_device_tokens_student ON device_tokens(student_id) WHERE is_active = true;
CREATE INDEX idx_device_tokens_token ON device_tokens(token);


-- =============================================================================
-- BOUNDED CONTEXT 2: EVENT CORE
-- Entities: speakers, rooms, workshops
-- =============================================================================

CREATE TABLE speakers (
    speaker_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   VARCHAR(255) NOT NULL,
    title       VARCHAR(255),              -- Chức danh: "CTO tại Công ty X"
    bio         TEXT,
    avatar_url  VARCHAR(1000),             -- URL Object Storage
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE speakers IS 'Diễn giả workshop. Một speaker có thể xuất hiện ở nhiều workshop.';


CREATE TABLE rooms (
    room_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    building        VARCHAR(100),
    floor           SMALLINT,
    capacity        SMALLINT NOT NULL,
    floor_plan_url  VARCHAR(1000),          -- Sơ đồ phòng
    facilities      JSONB,                  -- {"projector": true, "ac": true, "mic": 2}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_rooms_capacity CHECK (capacity > 0)
);

COMMENT ON TABLE rooms IS
    'Phòng tổ chức sự kiện. name không có UNIQUE constraint — '
    'nhiều phòng có thể trùng tên nếu khác building. '
    'Index thay vì unique cho phép tìm kiếm linh hoạt.';

COMMENT ON COLUMN rooms.facilities IS
    'JSONB chứa tiện ích phòng. Schema mở để dễ mở rộng: '
    '{"projector": boolean, "ac": boolean, "mic": integer, "whiteboard": boolean}.';

CREATE INDEX idx_rooms_name ON rooms(name);


-- ADR-02, ADR-03: workshops entity trung tâm
CREATE TABLE workshops (
    workshop_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,

    -- FK nullable — cho phép DRAFT trước khi assign
    speaker_id      UUID REFERENCES speakers(speaker_id),
    room_id         UUID REFERENCES rooms(room_id),

    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    seats_total     INTEGER NOT NULL,
    seats_available INTEGER NOT NULL,
    price           NUMERIC(10,2) DEFAULT '0',       -- 0 = free workshop
    status          workshop_status NOT NULL DEFAULT 'DRAFT',
    created_by      UUID NOT NULL REFERENCES staff(staff_id),
    -- ADR-03: Optimistic Lock
    version         BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_workshops_time CHECK (ends_at > starts_at),
    CONSTRAINT chk_workshops_seats_total CHECK (seats_total > 0),
    CONSTRAINT chk_workshops_seats_available
        CHECK (seats_available >= 0 AND seats_available <= seats_total),
    CONSTRAINT chk_workshops_price CHECK (price >= 0)
);

COMMENT ON TABLE workshops IS
    'Thực thể trung tâm của hệ thống. Optimistic Lock qua version column (ADR-03). '
    'Summary + PDF fields được tách sang workshop_documents + ai_summaries (xem BC4). '
    'room_id và speaker_id FK nullable — cho phép tạo DRAFT trước khi assign. '
    'created_by NOT NULL — mọi workshop phải có người tạo (staff).';

COMMENT ON COLUMN workshops.seats_available IS
    'Source of truth cho available seats (PostgreSQL). '
    'Redis cache:workshop:{id}:seats là cache hint 10s TTL (ADR-13) — '
    'KHÔNG phải source of truth.';

COMMENT ON COLUMN workshops.version IS
    'Optimistic lock counter. Incremented on every seat-draining UPDATE. '
    'BIGINT tránh overflow dưới spike đăng ký (ADR-03).';

-- Partial index: chỉ scan workshop đang OPEN
CREATE INDEX idx_workshops_status_starts ON workshops(status, starts_at) WHERE status = 'OPEN';
-- Index cho lookup theo phòng + thời gian (conflict detection)
CREATE INDEX idx_workshops_room ON workshops(room_id, starts_at);
-- Index cho lookup theo speaker
CREATE INDEX idx_workshops_speaker_id ON workshops(speaker_id);
-- Ngăn double-booking cùng phòng tại cùng thời điểm
CREATE UNIQUE INDEX uq_workshops_room_time_slot ON workshops(room_id, starts_at, ends_at);


-- =============================================================================
-- BOUNDED CONTEXT 3: TRANSACTION
-- Entities: registrations, payments, checkin_records
-- =============================================================================

-- ADR-02, ADR-03: Registration với optimistic lock + partial unique index
CREATE TABLE registrations (
    registration_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          TEXT NOT NULL REFERENCES students(student_id),
    workshop_id         UUID NOT NULL REFERENCES workshops(workshop_id),
    status              registration_status NOT NULL DEFAULT 'PENDING',
    qr_code             TEXT NOT NULL UNIQUE,
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at        TIMESTAMPTZ,     -- Thời điểm chuyển → CONFIRMED (free) / PAID (paid)
    cancelled_at        TIMESTAMPTZ,     -- Thời điểm hủy
    cancellation_reason TEXT,
    -- ADR-03: Optimistic Lock, version + 1 trên mỗi status transition
    version             BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE registrations IS
    'Đơn đăng ký workshop. State machine:
     Free  (price=0): [INSERT] → CONFIRMED (terminal)
     Paid  (price>0): [INSERT] → PENDING → PAID (terminal)
                                    → CANCELLED
     qr_code là UUID v4 độc lập (không dùng registration_id) — ngăn brute-force scan.
     Partial unique index: chỉ enforce unique (student_id, workshop_id) khi status != CANCELLED,
     cho phép student hủy rồi đăng ký lại.';

COMMENT ON COLUMN registrations.confirmed_at IS
    'Set khi status chuyển sang CONFIRMED (free workshop) hoặc PAID (paid workshop). '
    'Dùng cho reporting: thời gian từ registered → confirmed.';

-- Partial unique: 1 student chỉ có 1 active registration/workshop
CREATE UNIQUE INDEX uq_registrations_student_workshop_active
    ON registrations(student_id, workshop_id) WHERE status <> 'CANCELLED';

CREATE INDEX idx_registrations_student_id ON registrations(student_id);
CREATE INDEX idx_registrations_workshop_id ON registrations(workshop_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_qr_code ON registrations(qr_code);


-- ADR-08: Payment với idempotency_key (TEXT, không FK)
CREATE TABLE payments (
    payment_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id      UUID NOT NULL REFERENCES registrations(registration_id),
    student_id           TEXT NOT NULL REFERENCES students(student_id),
    amount               NUMERIC(12,2) NOT NULL,
    currency             CHAR(3) NOT NULL DEFAULT 'VND',
    gateway              payment_gateway NOT NULL,
    status               payment_status NOT NULL DEFAULT 'INITIATED',
    idempotency_key      TEXT NOT NULL,
    gateway_txn_id       VARCHAR(255),              -- ID từ payment gateway
    initiated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at         TIMESTAMPTZ,               -- Thời điểm SUCCEEDED / FAILED
    timeout_at           TIMESTAMPTZ,               -- Thời điểm timeout (UNRESOLVED)
    raw_gateway_response JSONB,                     -- Raw response từ gateway (debug)

    CONSTRAINT chk_payments_amount CHECK (amount > 0)
);

COMMENT ON TABLE payments IS
    'Giao dịch thanh toán. idempotency_key là TEXT — KHÔNG có FK đến idempotency_keys
     vì key được hash (SHA-256) trước khi lưu, không lưu raw key.
     student_id được denormalize để join nhanh không cần qua registration.
     status UNRESOLVED là non-terminal — retry với cùng key (ADR-08).';

COMMENT ON COLUMN payments.gateway IS
    'Cổng thanh toán được chọn. MOCK dùng cho development/testing.';

COMMENT ON COLUMN payments.raw_gateway_response IS
    'Raw JSON response từ payment gateway. Chỉ dùng để debug — không dùng trong business logic. '
    'Có thể chứa dữ liệu nhạy cảm (1 phần thẻ) — cần mask trong logs.';

CREATE INDEX idx_payments_registration_id ON payments(registration_id);
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_gateway ON payments(gateway);
-- Partial index cho payment timeout job
CREATE INDEX idx_payments_pending ON payments(initiated_at) WHERE status = 'INITIATED';


-- ADR-11: Check-in records với denormalized FKs + source tracking
CREATE TABLE checkin_records (
    checkin_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL REFERENCES registrations(registration_id),
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    workshop_id       UUID NOT NULL REFERENCES workshops(workshop_id),
    checked_in_at     TIMESTAMPTZ NOT NULL,        -- Timestamp từ device
    synced_at         TIMESTAMPTZ,                 -- Server-side timestamp (đồng bộ)
    checked_in_by     UUID NOT NULL REFERENCES staff(staff_id),
    source            checkin_source NOT NULL DEFAULT 'ONLINE',
    device_id         VARCHAR(100),                -- Device ID cho offline check-in

    UNIQUE (registration_id, workshop_id)          -- First check-in wins
);

COMMENT ON TABLE checkin_records IS
    'Ghi nhận tham dự. student_id và workshop_id denormalized để join nhanh.
     UNIQUE(registration_id, workshop_id) = first-check-in-wins.
     source = ONLINE (web staff) hoặc OFFLINE_SYNC (mobile sync).
     Không có client_local_id — sync dedup dùng device_id + checked_in_at.';

COMMENT ON COLUMN checkin_records.device_id IS
    'ID của mobile device thực hiện check-in. Dùng cho offline sync conflict resolution.';

CREATE INDEX idx_checkin_workshop_id ON checkin_records(workshop_id);
CREATE INDEX idx_checkin_student_id ON checkin_records(student_id);
-- Partial index cho OFFLINE_SYNC records (monitoring + retry)
CREATE INDEX idx_checkin_source ON checkin_records(source) WHERE source = 'OFFLINE_SYNC';


-- =============================================================================
-- BOUNDED CONTEXT 4: ASYNC
-- Entities: notification_channel_configs, notification_logs,
--           workshop_documents, ai_summaries,
--           student_sync_jobs, student_sync_errors
-- =============================================================================

-- ADR-09: Cấu hình channel
CREATE TABLE notification_channel_configs (
    channel_config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type      notification_channel NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    config_json       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- API key, endpoint, template ID
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (channel_type)
);

COMMENT ON TABLE notification_channel_configs IS
    'Cấu hình kênh thông báo. Externalize config để hỗ trợ thêm kênh mới '
    '(Zalo, SMS) không cần đổi code. UNIQUE(channel_type) — mỗi channel 1 config.';

COMMENT ON COLUMN notification_channel_configs.config_json IS
    'Config JSON theo channel: EMAIL → {smtp_host, port, username}, '
    'TELEGRAM → {bot_token, chat_id}, APP → {fcm_server_key}. Schema mở.';


-- ADR-09: Audit trail notifications
CREATE TABLE notification_logs (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,                         -- student_id hoặc staff_id
    workshop_id     UUID REFERENCES workshops(workshop_id) ON DELETE SET NULL,
    type            notification_type NOT NULL,
    channel         notification_channel NOT NULL,
    status          notification_status NOT NULL DEFAULT 'SENT',
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- Snapshot để retry
    sent_at         TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_logs IS
    'Audit trail cho mọi thông báo. user_id là TEXT (student_id TEXT hoặc staff_id UUID).
     workshop_id FK với ON DELETE SET NULL — giữ log khi workshop bị xóa.
     payload lưu snapshot dùng cho manual retry nếu cần.';

COMMENT ON COLUMN notification_logs.error_message IS
    'Error message từ delivery attempt. NULL nếu sent thành công. '
    'Không lưu stack trace — chỉ lưu message.';

CREATE INDEX idx_notif_user_id ON notification_logs(user_id);
CREATE INDEX idx_notif_workshop_id ON notification_logs(workshop_id);
-- Partial index cho failed notification retry job
CREATE INDEX idx_notif_status ON notification_logs(status)
    WHERE status IN ('FAILED', 'TIMEOUT');


-- ADR-14: Workshop documents (thay cho pdf_url trực tiếp trên workshops)
CREATE TABLE workshop_documents (
    document_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id     UUID NOT NULL REFERENCES workshops(workshop_id) ON DELETE CASCADE,
    file_url        VARCHAR(1000) NOT NULL,           -- URL Object Storage
    original_name   VARCHAR(500),                     -- Tên file gốc khi upload
    file_size_bytes BIGINT,                           -- Kích thước file (bytes)
    upload_status   document_upload_status NOT NULL DEFAULT 'UPLOADED',
    uploaded_by     UUID NOT NULL REFERENCES staff(staff_id),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workshop_documents IS
    'Tài liệu workshop (PDF slides, tài liệu tham khảo).
     Tách khỏi workshops table để hỗ trợ multiple documents per workshop.
     ON DELETE CASCADE: xóa workshop → xóa documents.
     upload_status tracking cho async processing pipeline (virus scan, OCR).';

COMMENT ON COLUMN workshop_documents.file_url IS
    'URL trỏ đến Object Storage (S3/MinIO). Format: /bucket/workshops/{workshop_id}/{uuid}.pdf';

CREATE INDEX idx_doc_workshop_id ON workshop_documents(workshop_id);


-- ADR-14: AI summaries (thay cho summary_text trực tiếp trên workshops)
CREATE TABLE ai_summaries (
    summary_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID NOT NULL REFERENCES workshop_documents(document_id) ON DELETE CASCADE,
    workshop_id   UUID NOT NULL REFERENCES workshops(workshop_id) ON DELETE CASCADE,
    raw_text      TEXT,                              -- Raw text extracted từ document
    summary_text  TEXT,                              -- AI-generated summary
    model_used    VARCHAR(100),                      -- Model name + version
    status        summary_status NOT NULL DEFAULT 'NONE',
    generated_at  TIMESTAMPTZ,                       -- Thời điểm sinh summary
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (document_id)                             -- 1 summary per document
);

COMMENT ON TABLE ai_summaries IS
    'AI-generated summaries cho workshop documents.
     UNIQUE(document_id) — mỗi document chỉ có 1 summary (được regenerate).
     Tách khỏi workshops table vì: (1) dependency vào document, (2) async generation,
     (3) có thể null trong thời gian dài (chờ LLM queue).';

COMMENT ON COLUMN ai_summaries.raw_text IS
    'Raw text extracted từ document (PDF parser output). Dùng làm input cho LLM.
     Có thể null nếu extraction thất bại.';

COMMENT ON COLUMN ai_summaries.model_used IS
    'Tên model AI được dùng. VD: "gpt-4o", "claude-sonnet-4-20250517". '
    'Giúp tracking performance theo model version.';

CREATE INDEX idx_summary_workshop_id ON ai_summaries(workshop_id);
-- Partial index cho async processing queue
CREATE INDEX idx_summary_status ON ai_summaries(status)
    WHERE status IN ('QUEUED', 'PROCESSING');


-- ADR-12: Student sync jobs (thay thế import_logs)
CREATE TABLE student_sync_jobs (
    job_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    triggered_by    VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    source_file_name VARCHAR(500) NOT NULL,
    status          sync_job_status NOT NULL DEFAULT 'RUNNING',
    total_rows      INTEGER,
    processed_rows  INTEGER DEFAULT 0,
    error_rows      INTEGER DEFAULT 0,
    completed_at    TIMESTAMPTZ,
    error_log_url   VARCHAR(1000),                   -- URL file CSV lỗi

    CONSTRAINT chk_sync_rows CHECK (
        (processed_rows IS NULL OR processed_rows >= 0)
        AND (error_rows IS NULL OR error_rows >= 0)
    ),
    CONSTRAINT chk_triggered_by CHECK (triggered_by IN ('CRON', 'MANUAL'))
);

COMMENT ON TABLE student_sync_jobs IS
    'Job log cho mỗi lần chạy CSV sync pipeline (ADR-12).
     Thay thế import_logs — bổ sung partial progress tracking (processed_rows, error_rows)
     và error_log_url trỏ đến file CSV chứa dòng lỗi.
     Concurrent run protection: check for RUNNING status before starting.';

CREATE INDEX idx_sync_job_status ON student_sync_jobs(status);
CREATE INDEX idx_sync_job_triggered ON student_sync_jobs(triggered_at DESC);


-- ADR-12: Per-row sync errors
CREATE TABLE student_sync_errors (
    error_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id        UUID NOT NULL REFERENCES student_sync_jobs(job_id) ON DELETE CASCADE,
    row_number    INTEGER NOT NULL,
    raw_data      TEXT NOT NULL,                      -- Raw CSV line
    error_reason  sync_error_reason NOT NULL,
    error_detail  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE student_sync_errors IS
    'Chi tiết lỗi cho từng dòng trong CSV sync job.
     ON DELETE CASCADE: xóa job → xóa errors.
     raw_data lưu dòng CSV gốc để debug.';

CREATE INDEX idx_sync_error_job_id ON student_sync_errors(job_id);


-- =============================================================================
-- BOUNDED CONTEXT 5: IDEMPOTENCY
-- Entity: idempotency_keys
-- ADR-03, ADR-08: Idempotency keys dùng chung cho registration và payment
-- =============================================================================

CREATE TABLE idempotency_keys (
    key_hash      VARCHAR(64) PRIMARY KEY,      -- SHA-256 hash of idempotency key
    status        idempotency_status NOT NULL DEFAULT 'IN_PROGRESS',
    resource_type VARCHAR(20) NOT NULL,         -- 'REGISTRATION' hoặc 'PAYMENT' (không ENUM)
    response_body JSONB,                        -- NULL khi in_progress
    status_code   SMALLINT,                     -- HTTP status code của response
    locked_until  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 seconds',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ                  -- Thời điểm completed / unresolved
);

COMMENT ON TABLE idempotency_keys IS
    'Idempotency keys dùng chung cho registration (ADR-03) và payment (ADR-08).
     PK là SHA-256 hash — không lưu raw key để tránh leak idempotency key.
     3-state lifecycle: in_progress → completed (terminal) | unresolved (non-terminal).
     locked_until dùng cho crash recovery — nếu quá hạn mà status vẫn IN_PROGRESS
     thì có thể retry safely.';

COMMENT ON COLUMN idempotency_keys.key_hash IS
    'SHA-256 hash của idempotency key (client-generated UUID v4).
     Hash được dùng thay raw key để không lưu plaintext key trong DB.
     VARCHAR(64) vì SHA-256 output là 64 hex characters.';

COMMENT ON COLUMN idempotency_keys.resource_type IS
    'VARCHAR(20) thay vì ENUM — resource types có thể mở rộng
     (thêm CHECKOUT, REFUND) không cần migration enum.';

COMMENT ON COLUMN idempotency_keys.locked_until IS
    'Deadline cho in_progress state. Default 30s từ thời điểm insert.
     Nếu quá hạn (NOW() > locked_until) mà status vẫn IN_PROGRESS → crash:
     có thể claim lại và retry.';

-- Index cho garbage collection: tìm stale IN_PROGRESS entries
CREATE INDEX idx_idempotency_stale ON idempotency_keys(status, locked_until);


-- =============================================================================
-- SUMMARY — 17 tables across 5 bounded contexts
-- =============================================================================

-- | # | Bounded Context | Table | PK Type | Key Indexes | ADR |
-- |---|-----------------|-------|---------|-------------|-----|
-- | 1 | Identity | checkin_staff_assignments | UUID | 1 | ADR-04, ADR-11 |
-- | 2 | Identity | students | TEXT | 1 | ADR-02, ADR-12 |
-- | 3 | Identity | staff | UUID | 2 | ADR-02 |
-- | 4 | Identity | device_tokens | UUID | 2 | ADR-09 |
-- | 5 | Event Core | speakers | UUID | 0 | |
-- | 6 | Event Core | rooms | UUID | 1 | |
-- | 7 | Event Core | workshops | UUID | 3 + 1 unique | ADR-02, ADR-03 |
-- | 8 | Transaction | registrations | UUID | 4 + 1 partial unique | ADR-02, ADR-03 |
-- | 9 | Transaction | payments | UUID | 5 | ADR-08 |
-- | 10 | Transaction | checkin_records | UUID | 3 | ADR-11 |
-- | 11 | Async | notification_channel_configs | UUID | 0 | ADR-09 |
-- | 12 | Async | notification_logs | UUID | 3 | ADR-09 |
-- | 13 | Async | workshop_documents | UUID | 1 | ADR-14 |
-- | 14 | Async | ai_summaries | UUID | 2 | ADR-14 |
-- | 15 | Async | student_sync_jobs | UUID | 2 | ADR-12 |
-- | 16 | Async | student_sync_errors | UUID | 1 | ADR-12 |
-- | 17 | Idempotency | idempotency_keys | VARCHAR(64) | 1 | ADR-03, ADR-08 |
