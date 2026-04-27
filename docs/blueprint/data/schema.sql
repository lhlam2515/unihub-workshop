-- =============================================================================
-- UniHub Workshop — PostgreSQL DDL Schema
-- Version: 1.0
-- Architecture: PostgreSQL (persistent) + Redis (ephemeral, documented inline)
-- Bounded Contexts: Identity | Event Core | Transaction | Async
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS — Centralized state definitions
-- =============================================================================

CREATE TYPE user_role AS ENUM ('STUDENT', 'ORGANIZER', 'CHECKIN_STAFF');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

CREATE TYPE workshop_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

CREATE TYPE registration_status AS ENUM (
    'PENDING_PAYMENT',   -- Workshop có phí: chờ thanh toán
    'CONFIRMED',         -- Đã xác nhận (miễn phí: ngay sau đăng ký; có phí: sau payment success)
    'CANCELLED',         -- Đã hủy bởi sinh viên hoặc system
    'WAITLISTED'         -- Hết chỗ, vào danh sách chờ
);

CREATE TYPE ticket_status AS ENUM ('ACTIVE', 'VOID');
-- ACTIVE: vé hợp lệ để check-in
-- VOID: vé đã bị hủy (registration cancelled/refunded)

CREATE TYPE payment_status AS ENUM (
    'PENDING',           -- Đang chờ xử lý tại cổng thanh toán
    'SUCCESS',           -- Thanh toán thành công
    'FAILED',            -- Thanh toán thất bại
    'REFUNDED',          -- Đã hoàn tiền
    'TIMEOUT'            -- Cổng thanh toán không phản hồi trong thời gian cho phép
);

CREATE TYPE payment_gateway AS ENUM ('VNPAY', 'STRIPE', 'MOMO', 'MOCK');

CREATE TYPE notification_type AS ENUM (
    'REGISTRATION_CONFIRMED',
    'REGISTRATION_CANCELLED',
    'WORKSHOP_UPDATED',      -- Đổi phòng, đổi giờ
    'WORKSHOP_CANCELLED',
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'CHECKIN_REMINDER'
);

CREATE TYPE notification_channel AS ENUM ('APP', 'EMAIL', 'TELEGRAM');
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TYPE checkin_source AS ENUM ('ONLINE', 'OFFLINE_SYNC');

CREATE TYPE sync_job_status AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');
CREATE TYPE sync_error_reason AS ENUM ('DUPLICATE', 'INVALID_FORMAT', 'MISSING_FIELD', 'UNKNOWN');

CREATE TYPE ai_summary_status AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE document_upload_status AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');


-- =============================================================================
-- BOUNDED CONTEXT 1: IDENTITY
-- Entities: users, students
-- =============================================================================

CREATE TABLE users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL,
    status          user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS 'Tài khoản hệ thống cho tất cả actor. Authentication & Authorization.';
COMMENT ON COLUMN users.role IS 'RBAC role: STUDENT | ORGANIZER | CHECKIN_STAFF';

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role  ON users (role);


CREATE TABLE students (
    student_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID,                           -- NULL nếu sinh viên chưa tạo account
    student_code    VARCHAR(20) NOT NULL,           -- Mã số sinh viên từ hệ thống cũ
    full_name       VARCHAR(255) NOT NULL,
    faculty         VARCHAR(100),
    class_year      SMALLINT,                       -- Năm nhập học, VD: 2021
    email_edu       VARCHAR(255),                   -- Email trường (@university.edu.vn)
    last_synced_at  TIMESTAMPTZ,                    -- Thời điểm CSV import gần nhất cập nhật record này
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_students_student_code UNIQUE (student_code),
    CONSTRAINT uq_students_user_id      UNIQUE (user_id),      -- 1 user chỉ map 1 student profile
    CONSTRAINT fk_students_user_id      FOREIGN KEY (user_id)
                                        REFERENCES users (user_id)
                                        ON DELETE SET NULL      -- Xóa account không xóa academic record
);

COMMENT ON TABLE students IS 'Academic profile sinh viên. Source of truth: CSV export từ hệ thống quản lý sinh viên.';
COMMENT ON COLUMN students.user_id IS 'NULL = sinh viên tồn tại trong CSV nhưng chưa đăng ký account UniHub.';
COMMENT ON COLUMN students.last_synced_at IS 'Timestamp của lần CSV import cuối cùng chạm vào record này.';

CREATE INDEX idx_students_user_id      ON students (user_id);
CREATE INDEX idx_students_student_code ON students (student_code);
CREATE INDEX idx_students_email_edu    ON students (email_edu);


-- =============================================================================
-- BOUNDED CONTEXT 2: EVENT CORE
-- Entities: speakers, rooms, workshops, workshop_slots
-- =============================================================================

CREATE TABLE speakers (
    speaker_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   VARCHAR(255) NOT NULL,
    title       VARCHAR(255),               -- Chức danh: "CTO tại Công ty X"
    bio         TEXT,
    avatar_url  VARCHAR(1000),              -- URL trỏ tới Object Storage
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE speakers IS 'Diễn giả workshop. Có thể xuất hiện ở nhiều workshop.';


CREATE TABLE rooms (
    room_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,      -- VD: "Phòng B2-01"
    building        VARCHAR(100),
    floor           SMALLINT,
    capacity        SMALLINT NOT NULL,
    floor_plan_url  VARCHAR(1000),              -- Sơ đồ phòng, URL trỏ Object Storage
    facilities      JSONB,                      -- {"projector": true, "ac": true, "mic": 2}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_rooms_capacity CHECK (capacity > 0)
);

COMMENT ON TABLE rooms IS 'Phòng tổ chức sự kiện. Là entity riêng để hỗ trợ đổi phòng và conflict detection.';
COMMENT ON COLUMN rooms.facilities IS 'JSONB cho phép lưu danh sách tiện ích linh hoạt mà không cần thêm cột.';

CREATE INDEX idx_rooms_name ON rooms (name);


CREATE TABLE workshops (
    workshop_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    speaker_id      UUID NOT NULL,
    room_id         UUID NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    capacity        SMALLINT NOT NULL,
    is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
    price           NUMERIC(12, 2),             -- NULL nếu is_paid = FALSE
    status          workshop_status NOT NULL DEFAULT 'DRAFT',
    created_by      UUID NOT NULL,              -- FK → users (ORGANIZER)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_workshops_speaker    FOREIGN KEY (speaker_id)
                                       REFERENCES speakers (speaker_id),
    CONSTRAINT fk_workshops_room       FOREIGN KEY (room_id)
                                       REFERENCES rooms (room_id),
    CONSTRAINT fk_workshops_created_by FOREIGN KEY (created_by)
                                       REFERENCES users (user_id),
    CONSTRAINT chk_workshops_time      CHECK (ends_at > starts_at),
    CONSTRAINT chk_workshops_capacity  CHECK (capacity > 0),
    CONSTRAINT chk_workshops_price     CHECK (
        (is_paid = FALSE AND price IS NULL) OR
        (is_paid = TRUE  AND price > 0)
    )
);

COMMENT ON TABLE workshops IS 'Thực thể trung tâm. Mọi luồng nghiệp vụ đều bắt nguồn từ đây.';
COMMENT ON COLUMN workshops.capacity IS 'Snapshot capacity tại thời điểm tạo. WorkshopSlot là source of truth real-time.';

CREATE INDEX idx_workshops_status      ON workshops (status);
CREATE INDEX idx_workshops_starts_at   ON workshops (starts_at);
CREATE INDEX idx_workshops_speaker_id  ON workshops (speaker_id);
CREATE INDEX idx_workshops_room_id     ON workshops (room_id);

-- Room conflict detection: không có 2 workshop cùng phòng, cùng giờ, cùng status PUBLISHED
CREATE UNIQUE INDEX uq_workshops_room_time_slot
    ON workshops (room_id, starts_at, ends_at)
    WHERE status = 'PUBLISHED';


CREATE TABLE workshop_slots (
    slot_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id         UUID NOT NULL,
    total_capacity      SMALLINT NOT NULL,
    -- Redis là source of truth real-time cho 2 counter dưới đây.
    -- PostgreSQL lưu để reconciliation cuối ngày và reporting.
    locked_count        SMALLINT NOT NULL DEFAULT 0,    -- Ghế đang hold (pending payment), có TTL trên Redis
    confirmed_count     SMALLINT NOT NULL DEFAULT 0,    -- Ghế đã payment success / đăng ký confirmed
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_workshop_slots_workshop FOREIGN KEY (workshop_id)
                                          REFERENCES workshops (workshop_id)
                                          ON DELETE CASCADE,
    CONSTRAINT uq_workshop_slots_workshop UNIQUE (workshop_id),   -- 1 workshop chỉ có 1 slot record
    CONSTRAINT chk_slot_capacity CHECK (total_capacity > 0),
    CONSTRAINT chk_slot_counts   CHECK (
        locked_count >= 0 AND
        confirmed_count >= 0 AND
        (locked_count + confirmed_count) <= total_capacity
    )
);

COMMENT ON TABLE workshop_slots IS
    'Quản lý chỗ ngồi real-time. '
    'Redis keys: '
    '  seat:available:{workshop_id} → DECR atomic counter (source of truth cho available count) '
    '  seat:lock:{workshop_id}:{registration_id} → SET NX EX 900 (TTL 15 phút, tự expire) '
    'PostgreSQL locked_count + confirmed_count chỉ dùng cho reconciliation và reporting.';

COMMENT ON COLUMN workshop_slots.locked_count IS
    'Số ghế đang hold chờ thanh toán. '
    'Tương ứng với số Redis keys "seat:lock:{wid}:*" còn sống. '
    'available_count = total_capacity - locked_count - confirmed_count (computed, không lưu).';


-- =============================================================================
-- BOUNDED CONTEXT 3: TRANSACTION
-- Entities: registrations, tickets, payments, checkin_records, offline_checkin_queue
-- =============================================================================

CREATE TABLE registrations (
    registration_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL,
    workshop_id         UUID NOT NULL,
    status              registration_status NOT NULL DEFAULT 'PENDING_PAYMENT',
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at        TIMESTAMPTZ,                        -- Timestamp khi chuyển sang CONFIRMED
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_registrations_student  FOREIGN KEY (student_id)
                                         REFERENCES students (student_id),
    CONSTRAINT fk_registrations_workshop FOREIGN KEY (workshop_id)
                                         REFERENCES workshops (workshop_id),
    -- Một sinh viên chỉ đăng ký một workshop một lần (trừ trạng thái CANCELLED cho phép đăng ký lại)
    CONSTRAINT uq_registrations_student_workshop
        UNIQUE (student_id, workshop_id)
);

COMMENT ON TABLE registrations IS
    'Đơn đăng ký (Order). Lifecycle: PENDING_PAYMENT → CONFIRMED → CANCELLED | WAITLISTED. '
    'Tách biệt với Ticket (quyền vào cửa). Một Registration CONFIRMED sinh ra đúng 1 Ticket.';

CREATE INDEX idx_registrations_student_id  ON registrations (student_id);
CREATE INDEX idx_registrations_workshop_id ON registrations (workshop_id);
CREATE INDEX idx_registrations_status      ON registrations (status);


CREATE TABLE tickets (
    ticket_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id     UUID NOT NULL,
    qr_token            VARCHAR(255) NOT NULL,      -- JWT hoặc UUID signed, dùng để quét check-in
    status              ticket_status NOT NULL DEFAULT 'ACTIVE',
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at           TIMESTAMPTZ,                -- Thời điểm void khi registration bị cancel

    CONSTRAINT fk_tickets_registration FOREIGN KEY (registration_id)
                                       REFERENCES registrations (registration_id)
                                       ON DELETE RESTRICT,      -- Không xóa ticket ngay, phải VOID trước
    CONSTRAINT uq_tickets_registration UNIQUE (registration_id), -- 1 registration → 1 ticket
    CONSTRAINT uq_tickets_qr_token     UNIQUE (qr_token),
    CONSTRAINT chk_tickets_void        CHECK (
        (status = 'ACTIVE'  AND voided_at IS NULL) OR
        (status = 'VOID'    AND voided_at IS NOT NULL)
    )
);

COMMENT ON TABLE tickets IS
    'Vé vào cửa (Admission Pass). Tách khỏi Registration để: '
    '(1) Mobile app offline chỉ sync bảng tickets WHERE status=ACTIVE — giảm payload. '
    '(2) QR đã in ra giấy bị VOID rõ ràng, không phụ thuộc vào registration.status. '
    'Lifecycle: ACTIVE → VOID (khi registration bị cancel hoặc hoàn tiền).';

-- Index chính để QR scan lookup — query hot nhất của hệ thống check-in
CREATE INDEX idx_tickets_qr_token  ON tickets (qr_token);
CREATE INDEX idx_tickets_status    ON tickets (status);


CREATE TABLE payments (
    payment_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id         UUID NOT NULL,
    student_id              UUID NOT NULL,
    amount                  NUMERIC(12, 2) NOT NULL,
    currency                CHAR(3) NOT NULL DEFAULT 'VND',
    gateway                 payment_gateway NOT NULL,
    status                  payment_status NOT NULL DEFAULT 'PENDING',
    -- Idempotency: Backend sinh key này trước khi gọi payment gateway.
    -- Unique constraint ngăn tạo 2 payment row cho cùng 1 intent.
    -- Redis key: idempotency:{idempotency_key} → payment_id, TTL 24h (first-check trước khi hit DB).
    idempotency_key         VARCHAR(255) NOT NULL,
    gateway_txn_id          VARCHAR(255),           -- ID giao dịch từ phía payment gateway (sau khi gọi xong)
    initiated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,            -- NULL nếu chưa có kết quả cuối
    timeout_at              TIMESTAMPTZ,            -- Deadline timeout, sau đó system mark TIMEOUT
    raw_gateway_response    JSONB,                  -- Lưu toàn bộ response từ gateway để debug/audit

    CONSTRAINT fk_payments_registration FOREIGN KEY (registration_id)
                                        REFERENCES registrations (registration_id),
    CONSTRAINT fk_payments_student      FOREIGN KEY (student_id)
                                        REFERENCES students (student_id),
    CONSTRAINT uq_payments_idempotency  UNIQUE (idempotency_key),   -- Chống double-charge tại DB layer
    CONSTRAINT chk_payments_amount      CHECK (amount > 0)
);

COMMENT ON TABLE payments IS
    'Giao dịch thanh toán. '
    'Chống double-charge: '
    '  Layer 1 — Redis: SET NX idempotency:{key} {payment_id} EX 86400 (24h TTL). '
    '             Nếu key đã tồn tại → trả về payment_id cũ, không tạo mới. '
    '  Layer 2 — DB: UNIQUE(idempotency_key) bắt race condition Redis miss. '
    'Circuit breaker state cho payment gateway lưu trên Redis: '
    '  circuit:payment:{gateway} → {state: CLOSED|OPEN|HALF_OPEN, failure_count, opened_at}';

COMMENT ON COLUMN payments.idempotency_key IS
    'Format đề xuất: REG_{registration_id}_{attempt_number} hoặc UUID v4 sinh phía client. '
    'Mỗi lần user bấm "Thử lại", client phải dùng lại cùng key để tránh charge 2 lần.';

CREATE INDEX idx_payments_registration_id  ON payments (registration_id);
CREATE INDEX idx_payments_student_id       ON payments (student_id);
CREATE INDEX idx_payments_status           ON payments (status);
CREATE INDEX idx_payments_gateway          ON payments (gateway);
-- Partial index: chỉ index các payment đang PENDING (cần monitor/timeout job)
CREATE INDEX idx_payments_pending          ON payments (initiated_at)
    WHERE status = 'PENDING';


CREATE TABLE checkin_records (
    checkin_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id     UUID NOT NULL,
    ticket_id           UUID NOT NULL,
    student_id          UUID NOT NULL,
    workshop_id         UUID NOT NULL,
    checked_in_at       TIMESTAMPTZ NOT NULL,       -- Thời điểm thực tế check-in (có thể là lúc offline)
    synced_at           TIMESTAMPTZ,                -- NULL nếu từ offline và chưa sync
    checked_in_by       UUID NOT NULL,              -- FK → users (CHECKIN_STAFF)
    source              checkin_source NOT NULL DEFAULT 'ONLINE',
    device_id           VARCHAR(100),               -- Mobile device ID của nhân sự check-in

    CONSTRAINT fk_checkin_registration  FOREIGN KEY (registration_id)
                                        REFERENCES registrations (registration_id),
    CONSTRAINT fk_checkin_ticket        FOREIGN KEY (ticket_id)
                                        REFERENCES tickets (ticket_id),
    CONSTRAINT fk_checkin_student       FOREIGN KEY (student_id)
                                        REFERENCES students (student_id),
    CONSTRAINT fk_checkin_workshop      FOREIGN KEY (workshop_id)
                                        REFERENCES workshops (workshop_id),
    CONSTRAINT fk_checkin_staff         FOREIGN KEY (checked_in_by)
                                        REFERENCES users (user_id),
    -- Idempotency cho offline sync: cùng ticket không thể check-in 2 lần cho cùng workshop
    CONSTRAINT uq_checkin_ticket_workshop UNIQUE (ticket_id, workshop_id)
);

COMMENT ON TABLE checkin_records IS
    'Ghi nhận tham dự. '
    'UNIQUE(ticket_id, workshop_id) đảm bảo idempotency khi offline sync: '
    'nếu device sync lại record đã tồn tại → INSERT ON CONFLICT DO NOTHING.';

CREATE INDEX idx_checkin_workshop_id  ON checkin_records (workshop_id);
CREATE INDEX idx_checkin_student_id   ON checkin_records (student_id);
CREATE INDEX idx_checkin_source       ON checkin_records (source) WHERE source = 'OFFLINE_SYNC';


CREATE TABLE offline_checkin_queue (
    -- Bảng này đại diện cho local storage trên mobile device.
    -- Khi sync, server nhận batch và INSERT INTO checkin_records ON CONFLICT DO NOTHING.
    local_id        UUID PRIMARY KEY,               -- UUID sinh trên device, không phải server
    qr_token        VARCHAR(255) NOT NULL,
    workshop_id     UUID NOT NULL,
    checked_in_at   TIMESTAMPTZ NOT NULL,
    device_id       VARCHAR(100) NOT NULL,
    checked_in_by   UUID NOT NULL,                  -- user_id của nhân sự (lưu local để sync)
    sync_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (sync_status IN ('PENDING', 'SYNCED', 'CONFLICT')),
    synced_at       TIMESTAMPTZ,
    conflict_reason TEXT                            -- Mô tả lý do conflict nếu sync_status = CONFLICT
);

COMMENT ON TABLE offline_checkin_queue IS
    'Buffer cho check-in offline trên mobile device. '
    'Khi có mạng, app POST batch → server chạy: '
    '  INSERT INTO checkin_records (...) ON CONFLICT (ticket_id, workshop_id) DO NOTHING. '
    'sync_status = CONFLICT nếu ticket đã bị VOID trước khi sync về server.';


-- =============================================================================
-- BOUNDED CONTEXT 4: ASYNC
-- Entities: notification_channel_configs, notification_logs,
--           workshop_documents, ai_summaries,
--           student_sync_jobs, student_sync_errors
-- =============================================================================

CREATE TABLE notification_channel_configs (
    channel_config_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type        notification_channel NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    -- config_json chứa endpoint, API key pattern, template ID, v.v.
    -- Thêm kênh mới (Telegram) chỉ cần INSERT row mới, không thay đổi code core.
    config_json         JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_channel_config_type UNIQUE (channel_type)
);

COMMENT ON TABLE notification_channel_configs IS
    'Cấu hình kênh thông báo. Externalize channel config để hỗ trợ mở rộng kênh mới '
    '(Telegram, Zalo, SMS) mà không cần thay đổi code notification core. '
    'Chỉ cần INSERT row mới với config_json phù hợp.';


CREATE TABLE notification_logs (
    notification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    workshop_id         UUID,                           -- NULL cho thông báo không liên quan workshop
    type                notification_type NOT NULL,
    channel             notification_channel NOT NULL,
    status              notification_status NOT NULL DEFAULT 'PENDING',
    payload             JSONB NOT NULL DEFAULT '{}',    -- Nội dung thực tế đã gửi
    sent_at             TIMESTAMPTZ,
    error_message       TEXT,                           -- Lý do thất bại nếu status = FAILED
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notif_user     FOREIGN KEY (user_id)
                                 REFERENCES users (user_id),
    CONSTRAINT fk_notif_workshop FOREIGN KEY (workshop_id)
                                 REFERENCES workshops (workshop_id)
                                 ON DELETE SET NULL
);

COMMENT ON TABLE notification_logs IS 'Audit trail đầy đủ cho mọi thông báo đã gửi hoặc cố gắng gửi.';

CREATE INDEX idx_notif_user_id     ON notification_logs (user_id);
CREATE INDEX idx_notif_workshop_id ON notification_logs (workshop_id);
CREATE INDEX idx_notif_status      ON notification_logs (status) WHERE status = 'PENDING';


CREATE TABLE workshop_documents (
    document_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id     UUID NOT NULL,
    file_url        VARCHAR(1000) NOT NULL,          -- URL trỏ Object Storage (S3/MinIO)
    original_name   VARCHAR(500),                   -- Tên file gốc khi upload
    file_size_bytes BIGINT,
    upload_status   document_upload_status NOT NULL DEFAULT 'UPLOADED',
    uploaded_by     UUID NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_doc_workshop    FOREIGN KEY (workshop_id)
                                  REFERENCES workshops (workshop_id)
                                  ON DELETE CASCADE,
    CONSTRAINT fk_doc_uploaded_by FOREIGN KEY (uploaded_by)
                                  REFERENCES users (user_id)
);

COMMENT ON TABLE workshop_documents IS
    'File PDF được upload bởi ban tổ chức. '
    'File binary không lưu trong DB — chỉ lưu URL trỏ tới Object Storage.';

CREATE INDEX idx_doc_workshop_id ON workshop_documents (workshop_id);


CREATE TABLE ai_summaries (
    summary_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL,
    workshop_id     UUID NOT NULL,
    raw_text        TEXT,               -- Text sau khi extract và clean từ PDF
    summary_text    TEXT,               -- Output từ AI model, hiển thị trên trang chi tiết workshop
    model_used      VARCHAR(100),       -- VD: "claude-sonnet-4-6", "gpt-4o"
    status          ai_summary_status NOT NULL DEFAULT 'PENDING',
    generated_at    TIMESTAMPTZ,
    error_message   TEXT,               -- Lý do thất bại nếu status = FAILED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_summary_document FOREIGN KEY (document_id)
                                   REFERENCES workshop_documents (document_id)
                                   ON DELETE CASCADE,
    CONSTRAINT fk_summary_workshop FOREIGN KEY (workshop_id)
                                   REFERENCES workshops (workshop_id)
                                   ON DELETE CASCADE,
    CONSTRAINT uq_summary_document UNIQUE (document_id)     -- 1 document → 1 summary (retry overwrites)
);

CREATE INDEX idx_summary_workshop_id ON ai_summaries (workshop_id);
CREATE INDEX idx_summary_status      ON ai_summaries (status) WHERE status IN ('PENDING', 'PROCESSING');


CREATE TABLE student_sync_jobs (
    job_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_file_name    VARCHAR(500) NOT NULL,
    status              sync_job_status NOT NULL DEFAULT 'RUNNING',
    total_rows          INTEGER,
    processed_rows      INTEGER DEFAULT 0,
    error_rows          INTEGER DEFAULT 0,
    completed_at        TIMESTAMPTZ,
    error_log_url       VARCHAR(1000)       -- URL tới file log chi tiết trên Object Storage

    CONSTRAINT chk_sync_rows CHECK (
        processed_rows IS NULL OR processed_rows >= 0 AND
        error_rows IS NULL OR error_rows >= 0
    )
);

COMMENT ON TABLE student_sync_jobs IS
    'Track từng lần CSV import. Hỗ trợ partial success: job không fail toàn bộ '
    'khi một số dòng lỗi — status = PARTIAL_FAILURE + chi tiết trong student_sync_errors.';

CREATE INDEX idx_sync_job_status ON student_sync_jobs (status);
CREATE INDEX idx_sync_job_triggered ON student_sync_jobs (triggered_at DESC);


CREATE TABLE student_sync_errors (
    error_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL,
    row_number      INTEGER NOT NULL,           -- Số dòng trong file CSV gây lỗi
    raw_data        TEXT NOT NULL,              -- Nội dung dòng lỗi để debug
    error_reason    sync_error_reason NOT NULL,
    error_detail    TEXT,                       -- Mô tả chi tiết lỗi
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sync_error_job FOREIGN KEY (job_id)
                                 REFERENCES student_sync_jobs (job_id)
                                 ON DELETE CASCADE
);

CREATE INDEX idx_sync_error_job_id ON student_sync_errors (job_id);


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
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'students', 'speakers', 'rooms', 'workshops',
        'workshop_slots', 'notification_channel_configs', 'workshop_documents'
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

-- View: Số chỗ còn lại real-time (computed từ PostgreSQL — reconciliation only)
-- Source of truth thực sự là Redis counter seat:available:{workshop_id}
CREATE VIEW v_workshop_availability AS
SELECT
    w.workshop_id,
    w.title,
    w.starts_at,
    w.status,
    ws.total_capacity,
    ws.locked_count,
    ws.confirmed_count,
    (ws.total_capacity - ws.locked_count - ws.confirmed_count) AS available_count
FROM workshops w
JOIN workshop_slots ws ON ws.workshop_id = w.workshop_id
WHERE w.status = 'PUBLISHED';

COMMENT ON VIEW v_workshop_availability IS
    'Số chỗ còn lại tính từ PostgreSQL. Dùng cho reporting và reconciliation. '
    'Luồng đăng ký real-time phải dùng Redis counter seat:available:{workshop_id}.';


-- View: Thống kê check-in theo workshop (cho ban tổ chức)
CREATE VIEW v_workshop_checkin_stats AS
SELECT
    w.workshop_id,
    w.title,
    ws.confirmed_count                                          AS total_registered,
    COUNT(cr.checkin_id)                                        AS total_checkedin,
    COUNT(cr.checkin_id) FILTER (WHERE cr.source = 'OFFLINE_SYNC') AS offline_checkins,
    ROUND(
        COUNT(cr.checkin_id)::NUMERIC / NULLIF(ws.confirmed_count, 0) * 100, 2
    )                                                           AS checkin_rate_pct
FROM workshops w
JOIN workshop_slots ws ON ws.workshop_id = w.workshop_id
LEFT JOIN checkin_records cr ON cr.workshop_id = w.workshop_id
GROUP BY w.workshop_id, w.title, ws.confirmed_count;
