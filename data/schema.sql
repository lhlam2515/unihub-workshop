-- =============================================================================
-- UniHub Workshop — Database Schema DDL v3.0
-- =============================================================================
-- Nguồn: Drizzle ORM schemas tại apps/server/src/infra/database/schema/
--
-- Cách sử dụng:
--   psql "$DATABASE_URL" -f data/schema.sql
--
-- Khuyến nghị: dùng drizzle migrations (có versioning):
--   cd apps/server && pnpm db:migrate
--
-- Script này dành cho trường hợp cần khởi tạo schema độc lập mà
-- không cần toàn bộ toolchain Node.js (ví dụ: CI, review thủ công).
-- =============================================================================

SET client_encoding = 'UTF8';

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Identity
CREATE TYPE staff_role AS ENUM ('BTC', 'CHECKIN_STAFF');
CREATE TYPE platform    AS ENUM ('IOS', 'ANDROID');

-- Workshop lifecycle
CREATE TYPE workshop_status AS ENUM ('DRAFT', 'OPEN', 'CANCELLED', 'COMPLETED');

-- Registration & payment lifecycle
CREATE TYPE registration_status AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED');
CREATE TYPE payment_status      AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'UNRESOLVED');
CREATE TYPE payment_gateway     AS ENUM ('VNPAY', 'STRIPE', 'MOMO', 'MOCK');

-- Notifications
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
CREATE TYPE notification_status  AS ENUM ('PENDING', 'SENT', 'FAILED', 'TIMEOUT');

-- Check-in
CREATE TYPE checkin_source AS ENUM ('ONLINE', 'OFFLINE_SYNC');

-- CSV student sync
CREATE TYPE sync_job_status   AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');
CREATE TYPE sync_error_reason AS ENUM ('DUPLICATE', 'INVALID_FORMAT', 'MISSING_FIELD', 'UNKNOWN');

-- AI Summary
CREATE TYPE summary_status          AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE document_upload_status  AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- Idempotency
CREATE TYPE idempotency_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'UNRESOLVED');


-- =============================================================================
-- IDENTITY LAYER
-- identity.schema.ts
-- =============================================================================

-- students
-- TEXT PK: dùng mã sinh viên từ hệ thống cũ (vd. "23127001").
-- Cho phép CSV upsert (ON CONFLICT DO UPDATE) không cần lookup UUID.
CREATE TABLE students (
    student_id    TEXT        PRIMARY KEY,
    email         TEXT,
    full_name     TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_email ON students (email);

-- staff
-- UUID PK: identity tự quản lý cho BTC và nhân sự check-in.
CREATE TABLE staff (
    staff_id      UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT       NOT NULL UNIQUE,
    full_name     TEXT       NOT NULL,
    password_hash TEXT       NOT NULL,
    role          staff_role NOT NULL,
    is_active     BOOLEAN    NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_role  ON staff (role)  WHERE is_active = TRUE;
CREATE INDEX idx_staff_email ON staff (email);

-- checkin_staff_assignments
-- Mỗi nhân sự check-in chỉ có một bản ghi (UNIQUE staff_id).
-- workshop_ids: mảng UUID workshop được phép check-in.
CREATE TABLE checkin_staff_assignments (
    assignment_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id      UUID        NOT NULL REFERENCES staff (staff_id) ON DELETE CASCADE,
    workshop_ids  JSONB       NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checkin_staff_assignments_staff UNIQUE (staff_id)
);

CREATE INDEX idx_checkin_staff_assignments_staff ON checkin_staff_assignments (staff_id);

-- device_tokens
-- Dùng cho push notification (FCM / APNs). Soft-delete qua is_active.
CREATE TABLE device_tokens (
    device_token_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      TEXT        NOT NULL REFERENCES students (student_id) ON DELETE CASCADE,
    token           TEXT        NOT NULL UNIQUE,
    platform        platform    NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_tokens_student ON device_tokens (student_id) WHERE is_active = TRUE;
CREATE INDEX idx_device_tokens_token   ON device_tokens (token);


-- =============================================================================
-- EVENT CORE LAYER
-- event-core.schema.ts
-- =============================================================================

-- speakers
CREATE TABLE speakers (
    speaker_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name  VARCHAR(255) NOT NULL,
    title      VARCHAR(255),
    bio        TEXT,
    avatar_url VARCHAR(1000),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- rooms
CREATE TABLE rooms (
    room_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    building      VARCHAR(100),
    floor         SMALLINT,
    capacity      SMALLINT     NOT NULL,
    floor_plan_url VARCHAR(1000),
    facilities    JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rooms_capacity CHECK (capacity > 0)
);

CREATE INDEX idx_rooms_name ON rooms (name);

-- workshops
-- version: Optimistic Locking (ADR-03) — tăng mỗi UPDATE.
-- seats_available: được Redis sync, PostgreSQL là persistent backup.
-- speaker_id, room_id NULLABLE: cho phép DRAFT chưa assign.
CREATE TABLE workshops (
    workshop_id     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500)    NOT NULL,
    description     TEXT,
    speaker_id      UUID            REFERENCES speakers (speaker_id),
    room_id         UUID            REFERENCES rooms (room_id),
    starts_at       TIMESTAMPTZ     NOT NULL,
    ends_at         TIMESTAMPTZ     NOT NULL,
    seats_total     INTEGER         NOT NULL,
    seats_available INTEGER         NOT NULL,
    price           NUMERIC(10, 2)  DEFAULT 0,
    status          workshop_status NOT NULL DEFAULT 'DRAFT',
    created_by      UUID            NOT NULL REFERENCES staff (staff_id),
    version         BIGINT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_workshops_time             CHECK (ends_at > starts_at),
    CONSTRAINT chk_workshops_seats_total      CHECK (seats_total > 0),
    CONSTRAINT chk_workshops_seats_available  CHECK (
        seats_available >= 0 AND seats_available <= seats_total
    ),
    CONSTRAINT chk_workshops_price            CHECK (price >= 0)
);

CREATE INDEX idx_workshops_status_starts ON workshops (status, starts_at)
    WHERE status = 'OPEN';
CREATE INDEX idx_workshops_room          ON workshops (room_id, starts_at);
CREATE INDEX idx_workshops_speaker_id    ON workshops (speaker_id);

-- Một phòng không thể có hai workshop trùng khung giờ
CREATE UNIQUE INDEX uq_workshops_room_time_slot
    ON workshops (room_id, starts_at, ends_at);


-- =============================================================================
-- TRANSACTION LAYER
-- transaction.schema.ts
-- =============================================================================

-- registrations
CREATE TABLE registrations (
    registration_id     UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          TEXT                NOT NULL REFERENCES students (student_id),
    workshop_id         UUID                NOT NULL REFERENCES workshops (workshop_id),
    status              registration_status NOT NULL DEFAULT 'PENDING',
    qr_code             TEXT                NOT NULL UNIQUE,
    registered_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    confirmed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    version             BIGINT              NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Partial unique index: một sinh viên chỉ có một đăng ký active mỗi workshop.
-- Cho phép đăng ký lại sau khi đã hủy (status = 'CANCELLED' không bị check).
CREATE UNIQUE INDEX uq_registrations_student_workshop_active
    ON registrations (student_id, workshop_id)
    WHERE status <> 'CANCELLED';

CREATE INDEX idx_registrations_student_id  ON registrations (student_id);
CREATE INDEX idx_registrations_workshop_id ON registrations (workshop_id);
CREATE INDEX idx_registrations_status      ON registrations (status);
CREATE INDEX idx_registrations_qr_code     ON registrations (qr_code);

-- payments
-- idempotency_key: Layer 2 chống charge 2 lần (Layer 1 là Redis SET NX).
CREATE TABLE payments (
    payment_id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id      UUID            NOT NULL REFERENCES registrations (registration_id),
    student_id           TEXT            NOT NULL REFERENCES students (student_id),
    amount               NUMERIC(12, 2)  NOT NULL,
    currency             CHAR(3)         NOT NULL DEFAULT 'VND',
    gateway              payment_gateway NOT NULL,
    status               payment_status  NOT NULL DEFAULT 'INITIATED',
    idempotency_key      TEXT            NOT NULL,
    gateway_txn_id       VARCHAR(255),
    initiated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ,
    timeout_at           TIMESTAMPTZ,
    raw_gateway_response JSONB,
    CONSTRAINT chk_payments_amount CHECK (amount > 0)
);

CREATE INDEX idx_payments_registration_id ON payments (registration_id);
CREATE INDEX idx_payments_student_id      ON payments (student_id);
CREATE INDEX idx_payments_status          ON payments (status);
CREATE INDEX idx_payments_gateway         ON payments (gateway);
CREATE INDEX idx_payments_pending         ON payments (initiated_at)
    WHERE status = 'INITIATED';

-- checkin_records
-- UNIQUE (registration_id, workshop_id): mỗi đăng ký chỉ check-in một lần mỗi workshop.
-- source: ONLINE (trực tiếp) hoặc OFFLINE_SYNC (mobile app sync lại khi có mạng).
CREATE TABLE checkin_records (
    checkin_id      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID           NOT NULL REFERENCES registrations (registration_id),
    student_id      TEXT           NOT NULL REFERENCES students (student_id),
    workshop_id     UUID           NOT NULL REFERENCES workshops (workshop_id),
    checked_in_at   TIMESTAMPTZ    NOT NULL,
    synced_at       TIMESTAMPTZ,
    checked_in_by   UUID           NOT NULL REFERENCES staff (staff_id),
    source          checkin_source NOT NULL DEFAULT 'ONLINE',
    device_id       VARCHAR(100),
    CONSTRAINT uq_checkin_registration_workshop UNIQUE (registration_id, workshop_id)
);

CREATE INDEX idx_checkin_workshop_id ON checkin_records (workshop_id);
CREATE INDEX idx_checkin_student_id  ON checkin_records (student_id);
CREATE INDEX idx_checkin_source      ON checkin_records (source)
    WHERE source = 'OFFLINE_SYNC';


-- =============================================================================
-- ASYNC / BACKGROUND LAYER
-- async.schema.ts
-- =============================================================================

-- notification_channel_configs
-- Một hàng duy nhất mỗi kênh (uq_channel_config_type).
-- config_json: SMTP settings, Telegram bot token, v.v.
CREATE TABLE notification_channel_configs (
    channel_config_id UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type      notification_channel NOT NULL,
    is_active         BOOLEAN              NOT NULL DEFAULT TRUE,
    config_json       JSONB                NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_channel_config_type UNIQUE (channel_type)
);

-- notification_logs
-- user_id: TEXT (có thể là student_id TEXT hoặc staff UUID dạng text).
CREATE TABLE notification_logs (
    notification_id UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT                 NOT NULL,
    workshop_id     UUID                 REFERENCES workshops (workshop_id) ON DELETE SET NULL,
    type            notification_type    NOT NULL,
    channel         notification_channel NOT NULL,
    status          notification_status  NOT NULL DEFAULT 'SENT',
    payload         JSONB                NOT NULL DEFAULT '{}',
    sent_at         TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_id     ON notification_logs (user_id);
CREATE INDEX idx_notif_workshop_id ON notification_logs (workshop_id);
CREATE INDEX idx_notif_status      ON notification_logs (status)
    WHERE status IN ('FAILED', 'TIMEOUT');

-- workshop_documents
-- File PDF được upload để AI Summary xử lý.
CREATE TABLE workshop_documents (
    document_id     UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id     UUID                   NOT NULL REFERENCES workshops (workshop_id) ON DELETE CASCADE,
    file_url        VARCHAR(1000)          NOT NULL,
    original_name   VARCHAR(500),
    file_size_bytes BIGINT,
    upload_status   document_upload_status NOT NULL DEFAULT 'UPLOADED',
    uploaded_by     UUID                   NOT NULL REFERENCES staff (staff_id),
    uploaded_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_workshop_id ON workshop_documents (workshop_id);

-- ai_summaries
-- Một document chỉ có một summary (uq_summary_document).
CREATE TABLE ai_summaries (
    summary_id    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID           NOT NULL REFERENCES workshop_documents (document_id) ON DELETE CASCADE,
    workshop_id   UUID           NOT NULL REFERENCES workshops (workshop_id) ON DELETE CASCADE,
    raw_text      TEXT,
    summary_text  TEXT,
    model_used    VARCHAR(100),
    status        summary_status NOT NULL DEFAULT 'NONE',
    generated_at  TIMESTAMPTZ,
    error_message TEXT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_summary_document UNIQUE (document_id)
);

CREATE INDEX idx_summary_workshop_id ON ai_summaries (workshop_id);
CREATE INDEX idx_summary_status      ON ai_summaries (status)
    WHERE status IN ('QUEUED', 'PROCESSING');

-- student_sync_jobs
-- Theo dõi mỗi lần import CSV sinh viên (cron đêm hoặc manual trigger).
CREATE TABLE student_sync_jobs (
    job_id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    triggered_by     VARCHAR(10)     NOT NULL DEFAULT 'MANUAL',
    source_file_name VARCHAR(500)    NOT NULL,
    status           sync_job_status NOT NULL DEFAULT 'RUNNING',
    total_rows       INTEGER,
    processed_rows   INTEGER         DEFAULT 0,
    error_rows       INTEGER         DEFAULT 0,
    completed_at     TIMESTAMPTZ,
    error_log_url    VARCHAR(1000),
    CONSTRAINT chk_sync_rows      CHECK (
        (processed_rows IS NULL OR processed_rows >= 0)
        AND (error_rows IS NULL OR error_rows >= 0)
    ),
    CONSTRAINT chk_triggered_by   CHECK (triggered_by IN ('CRON', 'MANUAL'))
);

CREATE INDEX idx_sync_job_status    ON student_sync_jobs (status);
CREATE INDEX idx_sync_job_triggered ON student_sync_jobs (triggered_at DESC);

-- student_sync_errors
-- Lưu các hàng CSV bị lỗi trong một sync job để BTC có thể review.
CREATE TABLE student_sync_errors (
    error_id     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID              NOT NULL REFERENCES student_sync_jobs (job_id) ON DELETE CASCADE,
    row_number   INTEGER           NOT NULL,
    raw_data     TEXT              NOT NULL,
    error_reason sync_error_reason NOT NULL,
    error_detail TEXT,
    created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_error_job_id ON student_sync_errors (job_id);


-- =============================================================================
-- IDEMPOTENCY LAYER
-- idempotency.schema.ts
-- =============================================================================

-- idempotency_keys
-- Layer 2 chống charge 2 lần (Layer 1 là Redis SET NX với TTL 24h).
-- key_hash: SHA-256 của idempotency key gốc từ client.
-- locked_until: window 30 giây chống concurrent duplicate request.
CREATE TABLE idempotency_keys (
    key_hash      VARCHAR(64)        PRIMARY KEY,
    status        idempotency_status NOT NULL DEFAULT 'IN_PROGRESS',
    resource_type VARCHAR(20)        NOT NULL,
    response_body JSONB,
    status_code   SMALLINT,
    locked_until  TIMESTAMPTZ        NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds'),
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_idempotency_stale ON idempotency_keys (status, locked_until);
