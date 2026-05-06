-- ============================================================
-- UniHub Mobile — SQLite Schema
-- Runtime: expo-sqlite (SQLite 3.x embedded)
-- Scope: Offline-First Check-in cho CHECKIN_STAFF
-- ============================================================

-- ============================================================
-- BẢNG 1: cached_tickets
-- Mục đích: Mirror danh sách Ticket ACTIVE từ server về local.
-- Nguồn:    GET /checkin/workshops/{id}/tickets (khi online)
-- Dùng để: Tra cứu qr_token khi offline — phải cực nhanh.
-- ============================================================

CREATE TABLE IF NOT EXISTS cached_tickets (
    -- PK từ server, không tự sinh
    ticket_id           TEXT PRIMARY KEY NOT NULL,

    -- Data để validate khi quét QR
    qr_token            TEXT NOT NULL,
    registration_id     TEXT NOT NULL,
    workshop_id         TEXT NOT NULL,

    -- Hiển thị trên màn hình sau khi quét thành công
    student_name        TEXT NOT NULL,
    student_code        TEXT NOT NULL,
    student_id          TEXT NOT NULL,

    -- Trạng thái vé — chỉ cache ACTIVE, nhưng giữ field để
    -- phát hiện nếu server trả về VOID trong lần sync sau
    ticket_status       TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (ticket_status IN ('ACTIVE', 'VOID')),

    -- Metadata cache
    cached_at           INTEGER NOT NULL,   -- Unix timestamp (ms)
    workshop_starts_at  INTEGER,            -- Unix timestamp (ms), hiển thị thông tin sự kiện
    workshop_title      TEXT
);

-- Index chính — đây là query hot nhất: lookup bằng qr_token khi quét QR
-- Phải là UNIQUE để tránh cache duplicate khi re-fetch
CREATE UNIQUE INDEX IF NOT EXISTS idx_cached_tickets_qr_token
    ON cached_tickets (qr_token);

-- Index phụ — lọc theo workshop khi pre-load/invalidate cache
CREATE INDEX IF NOT EXISTS idx_cached_tickets_workshop
    ON cached_tickets (workshop_id);


-- ============================================================
-- BẢNG 2: checkin_queue
-- Mục đích: Buffer lưu lượt check-in khi offline.
--           Khi online → batch POST lên /checkin/sync
--           Backend INSERT ON CONFLICT DO NOTHING.
-- ============================================================

CREATE TABLE IF NOT EXISTS checkin_queue (
    -- UUID sinh trên device — dùng làm local idempotency key
    local_id            TEXT PRIMARY KEY NOT NULL,

    -- Data đủ để server reconstruct checkin_record
    qr_token            TEXT NOT NULL,
    ticket_id           TEXT NOT NULL,
    workshop_id         TEXT NOT NULL,
    student_id          TEXT NOT NULL,
    student_name        TEXT NOT NULL,
    student_code        TEXT NOT NULL,

    -- Thời điểm quét thực tế trên device (offline time)
    checked_in_at       INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Device context
    device_id           TEXT NOT NULL,
    checked_in_by       TEXT NOT NULL,      -- user_id của CHECKIN_STAFF (từ JWT)

    -- Sync lifecycle
    -- PENDING   → chưa sync lên server
    -- SYNCING   → đang trong batch request (tránh double-submit)
    -- SYNCED    → server đã nhận, ON CONFLICT DO NOTHING thành công
    -- CONFLICT  → server báo vé đã VOID hoặc đã check-in bởi device khác
    -- FAILED    → network/server error, sẽ retry
    sync_status         TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (sync_status IN (
                            'PENDING', 'SYNCING', 'SYNCED', 'CONFLICT', 'FAILED'
                        )),

    -- Thời điểm sync thành công / thất bại
    synced_at           INTEGER,            -- Unix timestamp (ms)

    -- Lý do nếu CONFLICT hoặc FAILED
    error_detail        TEXT,

    -- Số lần retry (dùng cho exponential backoff)
    retry_count         INTEGER NOT NULL DEFAULT 0,

    -- Timestamp ghi nhận trên device
    created_at          INTEGER NOT NULL    -- Unix timestamp (ms)
);

-- Index chính — worker quét hàng đợi để sync
CREATE INDEX IF NOT EXISTS idx_checkin_queue_sync_status
    ON checkin_queue (sync_status)
    WHERE sync_status IN ('PENDING', 'FAILED');

-- Index để hiển thị lịch sử quét theo thứ tự thời gian (dashboard tại cửa)
CREATE INDEX IF NOT EXISTS idx_checkin_queue_checked_in_at
    ON checkin_queue (checked_in_at DESC);

-- Index để đếm nhanh số lượt đã quét theo workshop (stats màn hình)
CREATE INDEX IF NOT EXISTS idx_checkin_queue_workshop
    ON checkin_queue (workshop_id, sync_status);

-- Ràng buộc local idempotency: cùng vé không thể quét 2 lần
-- Mirror UNIQUE(ticket_id, workshop_id) của server
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_queue_ticket_workshop
    ON checkin_queue (ticket_id, workshop_id);


-- ============================================================
-- BẢNG 3: app_session
-- Mục đích: Lưu JWT + session context để hoạt động offline.
--           Chỉ có đúng 1 row (single-user app).
--           Token nhạy cảm → chỉ lưu non-sensitive fields,
--           raw token string lưu trong Expo SecureStore.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_session (
    -- Singleton row
    id                  INTEGER PRIMARY KEY NOT NULL DEFAULT 1,

    -- Identity (decode từ JWT payload, không cần gọi server)
    user_id             TEXT NOT NULL,
    email               TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'CHECKIN_STAFF',

    -- Scope — danh sách workshop được phân công (từ JWT payload)
    -- Lưu dạng JSON string: ["wid-1", "wid-2"]
    allowed_workshop_ids TEXT NOT NULL DEFAULT '[]',

    -- Token expiry — dùng để check offline nếu còn hạn không
    -- Không lưu raw token ở đây — lưu trong Expo SecureStore
    access_token_exp    INTEGER NOT NULL,   -- Unix timestamp (giây) — JWT exp claim
    refresh_token_exp   INTEGER NOT NULL,   -- Unix timestamp (giây)

    -- SecureStore keys — reference đến nơi lưu raw token
    -- App dùng key này để gọi SecureStore.getItemAsync(key)
    access_token_key    TEXT NOT NULL DEFAULT 'unihub_access_token',
    refresh_token_key   TEXT NOT NULL DEFAULT 'unihub_refresh_token',

    -- Thời điểm login và cập nhật session
    logged_in_at        INTEGER NOT NULL,   -- Unix timestamp (ms)
    updated_at          INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Chỉ cho phép đúng 1 row
    CONSTRAINT chk_singleton CHECK (id = 1)
);


-- ============================================================
-- BẢNG 4: cache_metadata
-- Mục đích: Track trạng thái cache của từng workshop.
--           Biết khi nào cache stale → cần re-fetch.
--           Biết workshop nào đã load xong → cho phép offline.
-- ============================================================

CREATE TABLE IF NOT EXISTS cache_metadata (
    workshop_id         TEXT PRIMARY KEY NOT NULL,

    -- Thời điểm fetch gần nhất từ server
    last_fetched_at     INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Tổng số vé đã cache (để hiển thị progress)
    ticket_count        INTEGER NOT NULL DEFAULT 0,

    -- Trạng thái cache
    -- FRESH      → mới fetch, tin cậy
    -- STALE      → quá 30 phút, nên re-fetch nếu có mạng
    -- INVALID    → server báo stale (workshop bị update), cần re-fetch bắt buộc
    cache_status        TEXT NOT NULL DEFAULT 'FRESH'
                        CHECK (cache_status IN ('FRESH', 'STALE', 'INVALID')),

    -- ETag hoặc last_modified từ server (HTTP cache headers)
    -- Dùng cho conditional request: If-None-Match để tiết kiệm bandwidth
    etag                TEXT
);


-- ============================================================
-- BẢNG 5: sync_log
-- Mục đích: Audit trail của các lần sync — giúp debug
--           và hiển thị "Đồng bộ lần cuối: 5 phút trước"
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_log (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Thời điểm bắt đầu / kết thúc batch sync
    started_at          INTEGER NOT NULL,   -- Unix timestamp (ms)
    completed_at        INTEGER,

    -- Kết quả
    status              TEXT NOT NULL DEFAULT 'RUNNING'
                        CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),

    -- Số liệu batch
    total_records       INTEGER NOT NULL DEFAULT 0,
    synced_count        INTEGER NOT NULL DEFAULT 0,
    conflict_count      INTEGER NOT NULL DEFAULT 0,
    failed_count        INTEGER NOT NULL DEFAULT 0,

    -- Lý do nếu FAILED (network error, 401, 5xx...)
    error_detail        TEXT
);
