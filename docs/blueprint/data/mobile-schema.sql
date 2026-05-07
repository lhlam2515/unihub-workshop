-- ============================================================
-- UniHub Mobile — SQLite Schema
-- Runtime: expo-sqlite (SQLite 3.x embedded)
-- Scope: Offline-First Check-in cho CHECKIN_STAFF
-- ============================================================

-- ============================================================
-- BẢNG 1: cached_registrations
-- Mục đích: Mirror danh sách registration có qr_code từ server.
--           Server không có entity tickets riêng — qr_code nằm
--           trực tiếp trên registrations (xem design.md ADR-02).
-- Nguồn:    GET /checkin/workshops/{id}/registrations (khi online)
-- Dùng để: Tra cứu qr_code khi offline — phải cực nhanh.
--
-- PRE-LOAD FILTER: chỉ cache status IN ('paid', 'confirmed').
--   'paid'      → workshop có phí, đã thanh toán thành công
--   'confirmed' → workshop miễn phí (price = 0), đăng ký hoàn tất
--   'pending'   → KHÔNG cache: chưa hoàn tất registration (chờ payment)
--                 → cho check-in sẽ là bug (người chưa trả tiền được vào)
--   'cancelled' → KHÔNG cache: đăng ký đã hủy, QR không hợp lệ
-- ============================================================

CREATE TABLE IF NOT EXISTS cached_registrations (
    -- PK từ server (registrations.id), không tự sinh
    registration_id     TEXT PRIMARY KEY NOT NULL,

    -- Data để validate khi quét QR
    qr_code             TEXT NOT NULL,
    workshop_id         TEXT NOT NULL,

    -- Hiển thị trên màn hình sau khi quét thành công
    student_name        TEXT NOT NULL,
    student_code        TEXT NOT NULL,
    student_id          TEXT NOT NULL,

    -- Trạng thái đăng ký.
    -- Gap fix (M2): thêm 'confirmed' để mirror server schema (design.md ADR-02).
    -- Server hiện có 4 states: pending / confirmed / paid / cancelled.
    -- App chỉ pre-load 'paid' và 'confirmed' (xem filter comment ở trên).
    -- Giữ 'pending' và 'cancelled' trong CHECK để app có thể detect nếu server
    -- trả về status bất ngờ (e.g., status thay đổi sau khi cache) — log warning.
    registration_status TEXT NOT NULL DEFAULT 'paid'
                        CHECK (registration_status IN ('pending', 'confirmed', 'paid', 'cancelled')),

    -- Metadata cache
    cached_at           INTEGER NOT NULL,   -- Unix timestamp (ms)
    workshop_starts_at  INTEGER,            -- Unix timestamp (ms), hiển thị thông tin sự kiện
    workshop_title      TEXT
);

-- Index chính — đây là query hot nhất: lookup bằng qr_code khi quét QR
-- Phải là UNIQUE để tránh cache duplicate khi re-fetch
CREATE UNIQUE INDEX IF NOT EXISTS idx_cached_registrations_qr_code
    ON cached_registrations (qr_code);

-- Index phụ — lọc theo workshop khi pre-load/invalidate cache
CREATE INDEX IF NOT EXISTS idx_cached_registrations_workshop
    ON cached_registrations (workshop_id);


-- ============================================================
-- BẢNG 2: checkin_queue
-- Mục đích: Buffer lưu lượt check-in khi offline.
--           Khi online → batch POST lên /checkins/sync
--           Server INSERT INTO checkins ON CONFLICT (registration_id) DO NOTHING.
-- ============================================================

CREATE TABLE IF NOT EXISTS checkin_queue (
    -- UUID sinh trên device — dùng làm local idempotency key
    local_id            TEXT PRIMARY KEY NOT NULL,

    -- Data đủ để server reconstruct checkin record
    -- Server resolve registration_id từ qr_code:
    --   SELECT id FROM registrations WHERE qr_code = :code
    qr_code             TEXT NOT NULL,
    registration_id     TEXT NOT NULL,
    workshop_id         TEXT NOT NULL,
    student_id          TEXT NOT NULL,
    student_name        TEXT NOT NULL,
    student_code        TEXT NOT NULL,

    -- Thời điểm quét thực tế trên device (offline time)
    checked_in_at       INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Device context
    -- device_id lấy từ device_config.device_id (Gap fix M1 — xem bảng device_config)
    device_id           TEXT NOT NULL,
    checked_in_by       TEXT NOT NULL,      -- staff.id của CHECKIN_STAFF (từ JWT)

    -- Sync lifecycle
    -- PENDING   → chưa sync lên server
    -- SYNCING   → đang trong batch request (tránh double-submit)
    -- SYNCED    → server đã nhận, ON CONFLICT DO NOTHING thành công
    -- CONFLICT  → server báo registration đã check-in bởi device khác
    -- FAILED    → network/server error, sẽ retry
    sync_status         TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (sync_status IN (
                            'PENDING', 'SYNCING', 'SYNCED', 'CONFLICT', 'FAILED'
                        )),

    -- Thời điểm sync thành công / thất bại
    synced_at           INTEGER,            -- Unix timestamp (ms), NULL nếu chưa SYNCED

    -- Gap fix (M6): Timestamp khi row chuyển sang SYNCING.
    -- Dùng cho crash recovery: sau khi app restart, reset rows có
    --   sync_status = 'SYNCING' AND syncing_at < now - 5*60*1000
    -- về PENDING để worker retry.
    -- Không dùng created_at (= thời điểm quét QR, có thể là vài giờ trước).
    -- Không dùng synced_at (chỉ set khi thành công, NULL nếu crash).
    syncing_at          INTEGER,            -- Unix timestamp (ms), NULL nếu chưa từng SYNCING

    -- Lý do nếu CONFLICT hoặc FAILED
    error_detail        TEXT,

    -- Số lần retry (đếm tích lũy)
    retry_count         INTEGER NOT NULL DEFAULT 0,

    -- Gap fix (M4): Thời điểm sớm nhất được phép retry tiếp theo.
    -- Sync worker chỉ lấy FAILED rows có next_retry_at IS NULL OR <= now().
    -- App set: next_retry_at = now + min(2^retry_count * 60s, 3600s)
    --   retry 1 → +60s, retry 2 → +120s, retry 3 → +240s, ..., max +3600s
    -- NULL = chưa retry lần nào hoặc retry ngay lập tức (PENDING initial state)
    next_retry_at       INTEGER,            -- Unix timestamp (ms)

    -- Timestamp ghi nhận trên device
    created_at          INTEGER NOT NULL    -- Unix timestamp (ms)
);

-- Index chính — worker quét hàng đợi để sync
-- Gap fix (M4): bổ sung next_retry_at vào điều kiện để skip rows đang trong backoff window
-- Partial index không support expression condition (WHERE next_retry_at <= :now) trong SQLite
-- → filter next_retry_at ở application layer sau khi fetch từ index này
CREATE INDEX IF NOT EXISTS idx_checkin_queue_sync_status
    ON checkin_queue (sync_status, next_retry_at)
    WHERE sync_status IN ('PENDING', 'FAILED');

-- Index để hiển thị lịch sử quét theo thứ tự thời gian (dashboard tại cửa)
CREATE INDEX IF NOT EXISTS idx_checkin_queue_checked_in_at
    ON checkin_queue (checked_in_at DESC);

-- Index để đếm nhanh số lượt đã quét theo workshop (stats màn hình)
CREATE INDEX IF NOT EXISTS idx_checkin_queue_workshop
    ON checkin_queue (workshop_id, sync_status);

-- Ràng buộc local idempotency: cùng qr_code không thể quét 2 lần
-- Mirror server-side UNIQUE(registration_id) trên checkins
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_queue_qr_workshop
    ON checkin_queue (qr_code, workshop_id);

-- Gap fix (M6) — SYNCING crash recovery (corrected):
-- Nếu app crash giữa batch sync, rows sync_status='SYNCING' bị kẹt.
-- Khi app restart, sweep rows có:
--   sync_status = 'SYNCING' AND syncing_at < now() - 5*60*1000  (5 phút)
-- về PENDING để worker retry.
--
-- QUAN TRỌNG: Dùng syncing_at (thời điểm bắt đầu SYNCING), KHÔNG phải:
--   - created_at (= thời điểm quét QR, có thể là vài giờ trước → luôn > 5 phút)
--   - synced_at  (= chỉ có giá trị khi SYNCED thành công, NULL khi crash)
--
-- Server-side ON CONFLICT (registration_id) DO NOTHING đảm bảo re-send
-- sau crash là idempotent — không tạo duplicate checkin record.


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
    allowed_workshop_ids TEXT NOT NULL DEFAULT '[]',

    -- Token expiry — dùng để check offline nếu còn hạn không
    access_token_exp    INTEGER NOT NULL,   -- Unix timestamp (giây) — JWT exp claim
    refresh_token_exp   INTEGER NOT NULL,   -- Unix timestamp (giây)

    -- SecureStore keys — reference đến nơi lưu raw token
    access_token_key    TEXT NOT NULL DEFAULT 'unihub_access_token',
    refresh_token_key   TEXT NOT NULL DEFAULT 'unihub_refresh_token',

    -- Thời điểm login và cập nhật session
    logged_in_at        INTEGER NOT NULL,   -- Unix timestamp (ms)
    updated_at          INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Chỉ cho phép đúng 1 row
    CONSTRAINT chk_singleton CHECK (id = 1)
);


-- ============================================================
-- BẢNG 4: device_config   ← Gap fix M1
-- Mục đích: Lưu thông tin device-level, persist qua nhiều session.
--           Tách khỏi app_session vì device_id không gắn với
--           lifecycle của một session cụ thể:
--             - Logout + login lại → app_session bị REPLACE
--             - device_id phải giữ nguyên (UUID sinh 1 lần khi install)
--           checkin_queue.device_id lấy từ đây.
--
-- Sinh device_id: khi app khởi lần đầu (device_config chưa có row),
--   app tự sinh UUID v4 và INSERT. Mọi lần sau chỉ READ.
--   Không dùng Expo.Constants.deviceId (deprecated + không unique đủ).
-- ============================================================

CREATE TABLE IF NOT EXISTS device_config (
    -- Singleton row
    id                  INTEGER PRIMARY KEY NOT NULL DEFAULT 1,

    -- UUID v4 sinh một lần khi app install lần đầu.
    -- Dùng trong checkin_queue.device_id để server biết thiết bị nào check-in.
    -- Persist kể cả sau logout/login — chỉ mất khi uninstall app.
    device_id           TEXT NOT NULL,

    -- App version tại thời điểm install (debug/support)
    app_version         TEXT,

    -- Thời điểm khởi tạo lần đầu
    initialized_at      INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Chỉ cho phép đúng 1 row
    CONSTRAINT chk_device_singleton CHECK (id = 1)
);


-- ============================================================
-- BẢNG 5: cache_metadata   (renumber từ 4 → 5 sau khi thêm device_config)
-- Mục đích: Track trạng thái cache của từng workshop.
--           Biết khi nào cache stale → cần re-fetch.
--           Biết workshop nào đã load xong → cho phép offline.
-- ============================================================

CREATE TABLE IF NOT EXISTS cache_metadata (
    workshop_id         TEXT PRIMARY KEY NOT NULL,

    -- Thời điểm fetch gần nhất từ server
    last_fetched_at     INTEGER NOT NULL,   -- Unix timestamp (ms)

    -- Tổng số registration đã cache (để hiển thị progress bar khi pre-loading)
    registration_count  INTEGER NOT NULL DEFAULT 0,

    -- Gap fix (M3): Tổng số registration trên server tại thời điểm fetch.
    -- Server trả trong response header X-Total-Count hoặc body.pagination.total.
    -- So sánh với registration_count để detect partial preload:
    --   IF registration_count < server_total → preload bị gián đoạn (network drop giữa page)
    --   IF registration_count = server_total → cache đầy đủ, an toàn offline
    -- NULL = chưa fetch lần nào hoặc server không trả total (fallback: trust registration_count)
    server_total        INTEGER,            -- NULL nếu chưa biết

    -- Gap fix (M3): Flag tường minh thay vì suy diễn từ registration_count = server_total.
    -- is_fully_loaded = 1 chỉ khi tất cả pages đã fetch xong (không bị interrupt).
    -- App chỉ cho phép offline mode khi is_fully_loaded = 1.
    -- Trường hợp server_total = NULL: app SET is_fully_loaded = 1 khi nhận empty last page.
    is_fully_loaded     INTEGER NOT NULL DEFAULT 0  -- SQLite BOOLEAN: 0 = false, 1 = true
                        CHECK (is_fully_loaded IN (0, 1)),

    -- Trạng thái cache
    -- FRESH      → mới fetch, tin cậy
    -- STALE      → quá 30 phút, nên re-fetch nếu có mạng
    -- INVALID    → server báo stale (workshop bị update), cần re-fetch bắt buộc
    cache_status        TEXT NOT NULL DEFAULT 'FRESH'
                        CHECK (cache_status IN ('FRESH', 'STALE', 'INVALID')),

    -- ETag hoặc last_modified từ server (HTTP cache headers)
    etag                TEXT
);


-- ============================================================
-- BẢNG 6: sync_log   (renumber từ 5 → 6 sau khi thêm device_config)
-- Mục đích: Audit trail của các lần sync — giúp debug
--           và hiển thị "Đồng bộ lần cuối: 5 phút trước"
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_log (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Gap fix (M5): Workshop context cho batch sync này.
    -- Cho phép query "lần sync gần nhất của Workshop A là khi nào?"
    --   SELECT MAX(completed_at) FROM sync_log
    --   WHERE workshop_id = :id AND status = 'SUCCESS'
    -- NULL = sync global (tất cả workshop), không phải per-workshop batch.
    workshop_id         TEXT,               -- NULL = global sync

    -- Thời điểm bắt đầu / kết thúc batch sync
    started_at          INTEGER NOT NULL,   -- Unix timestamp (ms)
    completed_at        INTEGER,            -- NULL nếu đang RUNNING hoặc crash

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

-- Index cho "last sync per workshop" query — dùng bởi UI hiển thị sync status
CREATE INDEX IF NOT EXISTS idx_sync_log_workshop_completed
    ON sync_log (workshop_id, completed_at DESC)
    WHERE status IN ('SUCCESS', 'PARTIAL');
