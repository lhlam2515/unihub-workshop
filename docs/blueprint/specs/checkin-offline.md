# Spec: Check-in Offline (`checkin-offline`)

> **ASR hiện thực hóa:** ASR-6 (Offline Availability), ASR-9 (Authorization)
>
> **ADR tham chiếu:** ADR-11 (SQLite Offline + Outbox Sync), ADR-02 (Schema — checkins, registrations), ADR-04 (JWT offline validation), ADR-05 (RBAC — checkin_staff role)
>
> **Trade-off chủ đạo:** AP — Availability được ưu tiên cho luồng check-in: staff có thể quét QR và nhận xác nhận ngay cả khi mất mạng. Eventual Consistency: kết quả sync lên server khi kết nối phục hồi. Strong Consistency không áp dụng cho luồng này vì đây là operational tracking, không phải financial transaction.

---

## 1. Mô tả

Check-in staff dùng mobile app để quét QR code từ thẻ đăng ký của student. Luồng có hai mode:

**Mode Online:** App có kết nối mạng. Ghi local ngay lập tức → sync ngay khi ghi xong → nhận kết quả trong cùng session.

**Mode Offline:** App mất kết nối. Ghi local ngay lập tức → status = `pending` → sync tự động khi mạng phục hồi (trigger: network change listener HOẶC timer 30s).

Trong cả hai mode, staff nhận xác nhận ngay lập tức từ local DB. Server là source of truth cho conflict resolution: **first check-in wins** (first received at server, không phải first scanned offline).

---

## 2. Luồng chính

### 2.1 Luồng quét QR (tại device)

```
Preconditions:
  - Staff đã đăng nhập, có JWT access token lưu trong secure storage
  - JWT còn hạn HOẶC app đang offline (token verify bằng public key local)
  - App ở màn hình "Scan QR"

Action: Staff quét QR code của student
```

**Bước 1 — Decode QR:**
```
QR code chứa: qr_code (UUID v4 random, không phải registration.id)
Validate format: UUID v4 — nếu không đúng format, hiển thị lỗi ngay
```

**Bước 2 — Kiểm tra duplicate local (tránh ghi 2 lần cho cùng scan):**
```
SELECT * FROM local_checkins
WHERE qr_code = :qr_code
  AND status IN ('pending', 'synced');

Nếu tồn tại:
  → Hiển thị: "QR này đã được quét [status: đã sync / chờ sync]"
  → Dừng (không ghi thêm)

Nếu không tồn tại → Tiếp tục Bước 3
```

**Bước 3 — Ghi vào SQLite local (immediate, không cần network):**
```
INSERT INTO local_checkins
  (local_id, qr_code, checked_at, status, created_at)
VALUES
  (UUID.v4(),           -- sinh offline, KHÔNG dùng server ID
   :qr_code,
   now_device_iso8601,  -- lưu timezone của device
   'pending',
   now_device_iso8601);

→ Hiển thị ngay: "✓ Check-in ghi nhận, đang đồng bộ..."
-- UX không bị block bởi network latency
```

**Bước 4 — Trigger sync (không chặn UI):**
```
Nếu có kết nối mạng:
  → Gọi sync flow (Section 2.2) trong background
  → UI update khi nhận kết quả từ server

Nếu không có kết nối:
  → Hiển thị: "✓ Check-in ghi nhận (offline). Sẽ đồng bộ khi có mạng."
  → Sync sẽ tự chạy khi mạng phục hồi
```

---

### 2.2 Luồng Sync lên Server

```
Trigger:
  (a) Network Change Listener: kết nối mạng phục hồi
  (b) Timer: mỗi 30 giây nếu có row status='pending'
  (c) Sau mỗi lần ghi local_checkin thành công (nếu có mạng)
```

**Bước 1 — Thu thập batch pending:**
```
SELECT local_id, qr_code, checked_at
FROM local_checkins
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 50;   -- max 50 records per request

Nếu empty → skip, không gọi API
```

**Bước 2 — Gửi batch lên server:**
```
POST /checkins/sync
Headers: Authorization: Bearer <access_token>
Body: [
  { "local_id": "...", "qr_code": "...", "checked_at": "2025-05-06T10:30:00+07:00" },
  ...
]
Timeout: 10 giây
```

**Bước 3 — Xử lý response:**
```
Server response:
[
  { "local_id": "...", "result": "ok",        "server_id": "uuid" },
  { "local_id": "...", "result": "duplicate", "first_checkin_at": "...",
                                               "first_staff_name": "Staff Nguyễn" },
  { "local_id": "...", "result": "rejected",  "reason": "qr_invalid" | "workshop_cancelled"
                                                       | "not_paid" }
]

FOR EACH item in response:
  UPDATE local_checkins
    SET status            = CASE item.result
                              WHEN 'ok'        THEN 'synced'
                              WHEN 'duplicate' THEN 'duplicate'
                              WHEN 'rejected'  THEN 'rejected'
                            END,
        server_id         = item.server_id,       -- NULL nếu không phải 'ok'
        sync_error        = item.reason,           -- NULL nếu 'ok'
        first_checkin_info = item.first_checkin_at || ' by ' || item.first_staff_name
                             -- chỉ populated nếu 'duplicate'
  WHERE local_id = item.local_id;

→ UI update từng item (real-time feedback cho staff đang xem danh sách)
```

---

### 2.3 Server-side Sync Endpoint

```
Endpoint: POST /checkins/sync
Auth: JWT với role = 'checkin_staff'
Rate limit: 30 req/60s per user (T2 — xem ADR-06)
```

**Xử lý mỗi item trong batch:**
```
FOR EACH item IN request_body:

  -- Lookup registration bằng QR code
  SELECT r.id AS registration_id, r.student_id, r.status AS reg_status,
         w.id AS workshop_id, w.status AS workshop_status,
         w.title AS workshop_title
  FROM registrations r
  JOIN workshops w ON w.id = r.workshop_id
  WHERE r.qr_code = :qr_code;

  Nếu không tìm thấy:
    → append { local_id, result: "rejected", reason: "qr_invalid" }
    CONTINUE

  Nếu r.status != 'paid':
    → append { local_id, result: "rejected", reason: "not_paid" }
    CONTINUE

  Nếu w.status = 'cancelled':
    → append { local_id, result: "rejected", reason: "workshop_cancelled" }
    CONTINUE

  -- Attempt insert: first check-in wins
  INSERT INTO checkins
    (id, registration_id, checked_in_at, received_at, checked_by, client_local_id)
  SELECT
    gen_random_uuid(),
    :registration_id,
    :checked_at,     -- timestamp từ device (có thể lệch giờ)
    now(),           -- server-side timestamp (luôn đúng, dùng cho audit)
    :staff_id,       -- từ JWT
    :local_id
  ON CONFLICT (registration_id) DO NOTHING;

  IF rowsAffected = 1:
    → append { local_id, result: "ok", server_id: <new_checkin_id> }
    CONTINUE

  -- rowsAffected = 0: đã có check-in trước (first-wins conflict)
  SELECT c.checked_in_at, s.full_name AS staff_name
  FROM checkins c
  JOIN staff s ON s.id = c.checked_by
  WHERE c.registration_id = :registration_id;

  → append {
      local_id,
      result: "duplicate",
      first_checkin_at:   <checked_in_at>,
      first_staff_name:   <staff_name>
    }

RETURN results_array
```

---

## 3. Kịch bản lỗi

### E-01: QR code không tồn tại trong DB
```
Điều kiện: Không có registration nào có qr_code khớp
Hành vi server: Trả result = "rejected", reason = "qr_invalid"
Hành vi mobile: local_checkins.status = 'rejected', sync_error = 'qr_invalid'
UI: "QR code không hợp lệ hoặc đã hết hiệu lực"
```

### E-02: Student chưa thanh toán
```
Điều kiện: registrations.status = 'pending' (chưa thanh toán)
Hành vi server: Trả result = "rejected", reason = "not_paid"
UI: "Sinh viên này chưa hoàn tất thanh toán"
```

### E-03: Workshop đã bị hủy
```
Điều kiện: workshops.status = 'cancelled'
Hành vi server: Trả result = "rejected", reason = "workshop_cancelled"
UI: "Workshop này đã bị hủy"
```

### E-04: Duplicate — hai staff quét cùng QR offline
```
Điều kiện:
  Staff A (offline) quét QR lúc 10:30
  Staff B (offline) quét cùng QR lúc 10:31
  Staff A sync trước → checkins INSERT thành công
  Staff B sync sau → INSERT ON CONFLICT DO NOTHING → rowsAffected = 0

Hành vi server:
  B nhận: result = "duplicate",
           first_checkin_at = "10:30:00",
           first_staff_name = "Staff Nguyễn Văn A"

UI Staff B: "QR này đã được check-in lúc 10:30:00 bởi Staff Nguyễn Văn A"
Action: Staff B ghi nhận và tiếp tục (không phải lỗi — là expected race condition)
```

### E-05: Mạng không phục hồi trong thời gian sự kiện (extreme case)
```
Điều kiện: Device không kết nối lại trong suốt sự kiện
Hành vi: local_checkins.status = 'pending' mãi mãi
Hậu quả: Check-in data không được sync lên server
Mitigation: Đây là acceptable loss — check-in là operational tracking, không phải financial transaction.
            BTC dùng danh sách backup in ra giấy cho audit nếu cần.
```

### E-06: JWT hết hạn khi offline
```
Điều kiện: Đang offline, access_token.exp < now()
Hành vi: Mobile verify token bằng public key local → token expired
         Ghi local_checkins vẫn chạy (không cần validate với server)
         Khi sync (khi có mạng): server trả 401
         Mobile: cần refresh token trước khi sync (POST /auth/refresh)
Operational note: Staff refresh token khi về khu vực có sóng trước khi sync
```

### E-07: Sync timeout (10s không nhận response)
```
Điều kiện: Server quá tải, response > 10s
Hành vi: Batch không được update status
         Timer 30s trigger sync lại
         local_checkins.status = 'pending' vẫn giữ nguyên cho đến khi sync thành công
```

### E-08: Đồng hồ device lệch giờ
```
Điều kiện: Device clock bị set sai (ví dụ: device clock = UTC thay vì UTC+7)
Hành vi: checked_in_at lưu theo device clock → timestamp sai
         Không ảnh hưởng logic "đã check-in hay chưa" (ON CONFLICT check theo registration_id)
         Ảnh hưởng: report thống kê check-in theo giờ bị sai
Mitigation: Server lưu received_at = now() (server time, luôn đúng) trong bảng checkins.
            Audit dùng received_at, không dùng checked_in_at.
```

### E-09: QR bị scan 2 lần trên cùng device (staff bấm nhầm)
```
Điều kiện: Cùng qr_code đã có trong local_checkins với status != 'rejected'
Hành vi: Bước 2 của luồng quét QR phát hiện → dừng, KHÔNG ghi thêm
UI: "QR này đã được quét [trạng thái: synced / chờ sync]"
```

### E-10: Degrade Mode — Online-only (nếu prototype SQLite thất bại)
```
Điều kiện: Week 4 deadline — SQLite/offline sync không hoàn thành

Hành vi thay thế:
  POST /checkins (thay vì /checkins/sync)
  Body: { qr_code, checked_at }
  Server xử lý đồng bộ, trả kết quả ngay

Operational impact:
  - Staff ở khu vực mất sóng KHÔNG thể check-in
  - BTC chuẩn bị sẵn danh sách đăng ký in ra giấy trước sự kiện
  - Document hạn chế rõ ràng trong user guide

Không cần code path mới cho degrade — chỉ là endpoint khác, không có SQLite layer.
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — First Check-in Wins:**
Mỗi `registration_id` chỉ có tối đa 1 row trong `checkins`.
Enforcement: `UNIQUE (registration_id)` trên bảng `checkins`.
Check-in thứ 2 cho cùng student tại cùng workshop nhận `duplicate`, không phải error.

**INV-02 — Server Wins Conflicts:**
Khi hai thiết bị sync cùng qr_code, request nào đến server trước thì thắng.
Device time KHÔNG được dùng để resolve conflict — server received_at là tie-breaker.

**INV-03 — Local ID Không Phải Server ID:**
`local_checkins.local_id` là UUID v4 sinh offline — không được dùng làm `checkins.id` trên server.
Server luôn gen mới `checkins.id` khi insert.

**INV-04 — Status Chỉ Tiến Không Lùi:**
`local_checkins.status` chỉ được transition theo hướng:
`pending` → `synced` | `duplicate` | `rejected`
Không có transition ngược lại (đã sync không thể về pending).

**INV-05 — Ghi Local Không Phụ Thuộc Network:**
`INSERT INTO local_checkins` phải thành công không phụ thuộc vào trạng thái mạng hoặc server.
Staff không bao giờ thấy "Error: Cannot scan — no connection".

**INV-06 — QR Code Là Random UUID, Không Phải Registration ID:**
QR code là `registrations.qr_code` (UUID v4 riêng), không phải `registrations.id`.
Ngăn attacker brute-force registration ID để fake check-in.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Happy path online:**
Staff quét QR hợp lệ, có mạng.
Then: UI hiển thị "✓" ngay (< 100ms — từ local write). Server nhận check-in. checkins +1 row.

**AC-02 — Happy path offline:**
Staff quét QR hợp lệ, không có mạng.
Then: UI hiển thị "✓ (offline)" ngay. local_checkins.status = 'pending'.
When mạng phục hồi: sync tự động. local_checkins.status = 'synced'. checkins +1 row.

**AC-03 — First check-in wins (concurrent offline):**
Staff A và B cùng quét QR X offline. A sync trước.
Then: A → synced. B → duplicate với thông tin "checked-in lúc HH:MM bởi Staff A".
DB: checkins chỉ có 1 row cho registration này.

**AC-04 — Rejected invalid QR:**
Staff quét QR không tồn tại trong DB.
Then: local write với status='pending'. Sau sync: status='rejected', sync_error='qr_invalid'.
UI: "QR code không hợp lệ".

**AC-05 — Batch sync:**
Staff offline 5 phút, quét 15 QR.
When mạng phục hồi: một POST /checkins/sync gửi tất cả 15 items.
Then: tất cả 15 items được xử lý, status update tương ứng.

**AC-06 — No double-write local:**
Staff quét cùng QR 2 lần (bấm nhầm).
Then: local_checkins chỉ có 1 row. Lần 2 bị chặn ở Bước 2 kiểm tra local.

**AC-07 — JWT offline validation:**
Staff ở khu vực mất mạng, token còn hạn.
Then: Có thể quét QR và ghi local. Không gọi server để validate JWT.

**AC-08 — Timer trigger:**
Sau 30 giây có row 'pending' và có mạng.
Then: Sync tự động chạy mà không cần staff thao tác.
