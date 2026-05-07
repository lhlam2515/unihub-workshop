## Tổng quan hệ thống actor

Hệ thống có **3 actor** với phạm vi truy cập hoàn toàn tách biệt:

| Actor | Giao diện chính | Phạm vi |
|---|---|---|
| **Sinh viên** | Web app / Mobile | Xem, đăng ký, check-in |
| **Ban tổ chức** | Admin web | Quản lý workshop, thống kê, CSV, AI |
| **Nhân sự check-in** | Mobile app | Chỉ quét QR |

---

## 🎓 SINH VIÊN — User Flows

### Flow 1 · Duyệt danh sách workshop

```
[Vào trang danh sách]
        │
        ▼
[Hệ thống hiển thị toàn bộ workshop trong tuần]
  • Tên, diễn giả, phòng, sơ đồ phòng
  • Số chỗ còn lại (real-time, từ cache TTL 10s)
  • Trạng thái: Mở đăng ký / Hết chỗ / Đã hủy
        │
        ▼
[Sinh viên lọc / tìm kiếm theo ngày, chủ đề]
        │
        ▼
[Chọn workshop → Xem trang chi tiết]
  • Thông tin đầy đủ
  • AI Summary (nếu ban tổ chức đã upload PDF)
  • Nút "Đăng ký" (nếu còn chỗ & đang mở)
```

---

### Flow 2 · Đăng ký workshop miễn phí

```
[Bấm "Đăng ký" trên trang chi tiết]
        │
        ▼
[Hệ thống kiểm tra idempotency key]  ← ADR-08
  • Nếu key đã tồn tại + status=completed → trả lại QR cũ (không tạo mới)
  • Nếu key chưa có → tiếp tục
        │
        ▼
[Optimistic Locking: đọc version hiện tại của workshop]  ← ADR-03
        │
        ▼
[Kiểm tra seats_available > 0]
  ┌─ Hết chỗ ──→ [Trả về lỗi 409: Workshop đã đầy]
  └─ Còn chỗ ──→ tiếp tục
        │
        ▼
[BEGIN TRANSACTION]
  1. INSERT INTO registrations (workshop_id, student_id)
     ON CONFLICT DO NOTHING
  2. Kiểm tra rowsAffected
     ┌─ = 0 (sinh viên đã đăng ký rồi) → ROLLBACK → trả lại QR cũ
     └─ = 1 → tiếp tục
  3. UPDATE workshops SET seats_available = seats_available - 1,
     version = version + 1
     WHERE id = ? AND version = ?  (OL check)
     ┌─ rowsAffected = 0 → ROLLBACK → retry tối đa 3 lần ← vòng lặp OL
     └─ rowsAffected = 1 → COMMIT
[END TRANSACTION]
        │
        ▼
[Sinh mã QR + cập nhật idempotency_keys → status='COMPLETED']
        │
        ▼
[Gửi thông báo async qua BullMQ]  ← ADR-10
  • Kênh: App notification + Email
  • Strategy Pattern → dễ thêm Telegram sau  ← ADR-09
        │
        ▼
[Sinh viên nhận QR + thông báo xác nhận]
```

---

### Flow 3 · Đăng ký workshop có phí

Đây là flow phức tạp nhất vì có 3 điểm thất bại: tranh chấp chỗ, thanh toán timeout, và idempotency.

```
[Bấm "Đăng ký" → Xem tóm tắt + giá tiền]
        │
        ▼
[Client sinh Idempotency Key (UUID v4)]  ← ADR-08
[Gửi request kèm key trong header]
        │
        ▼
[Server: kiểm tra idempotency_keys table]
  ┌─ status='COMPLETED' → trả lại response đã lưu (QR cũ)
  ├─ status='IN_PROGRESS' → trả lại 202 "Đang xử lý"
  ├─ status='UNRESOLVED' → gateway forward (xem bên dưới)
  └─ không có → INSERT với status='IN_PROGRESS', locked_until=now+30s
        │
        ▼
[Kiểm tra Circuit Breaker]  ← ADR-07
  ┌─ OPEN (gateway đang lỗi) → trả lỗi 503 + message thân thiện
  │  "Cổng thanh toán tạm thời không khả dụng, vui lòng thử lại sau"
  │  (Workshop listing vẫn hoạt động bình thường — Graceful Degradation)
  └─ CLOSED/HALF-OPEN → tiếp tục
        │
        ▼
[Tương tự Flow 2: OL + Transaction giữ chỗ tạm]
        │
        ▼
[Gọi Payment Gateway với timeout 10s]
  ┌─ SUCCESS
  │     → COMMIT registrations
  │     → UPDATE idempotency_keys SET status='COMPLETED'
  │     → Sinh QR, gửi thông báo
  │
  ├─ PAYMENT FAILED (declined)
  │     → ROLLBACK registrations (hoàn chỗ)
  │     → UPDATE idempotency_keys SET status='COMPLETED', response=error
  │     → Thông báo thất bại cho sinh viên
  │
  └─ TIMEOUT (không biết gateway có nhận chưa)
        → ROLLBACK registrations (hoàn chỗ)
        → UPDATE idempotency_keys SET status='UNRESOLVED'  ← ADR-08
        → Thông báo: "Thanh toán chưa xác nhận, sẽ kiểm tra lại"
        → Reconciliation job sẽ xử lý sau  ← specs/payment-reconciliation.md
```

---

### Flow 4 · Xem QR và lịch đăng ký cá nhân

```
[Sinh viên vào mục "Đăng ký của tôi"]
        │
        ▼
[Danh sách các workshop đã đăng ký]
  • Tên, thời gian, phòng
  • Trạng thái: Đã xác nhận / Đã check-in / Workshop đã hủy
        │
        ▼
[Chọn workshop → Hiển thị mã QR]
  • QR chứa: registration_id hoặc token đã ký (JWT ngắn hạn)
  • Sinh viên screenshot hoặc để app mở sẵn khi đến cửa
```

---

## 🏛️ BAN TỔ CHỨC — User Flows

### Flow 5 · Tạo workshop mới

```
[Đăng nhập admin (JWT 15 phút + refresh 7 ngày)]  ← ADR-04
        │
        ▼
[RBAC check: role = 'organizer']  ← ADR-05
  └─ Nếu không phải → 403 Forbidden
        │
        ▼
[Form tạo workshop]
  • Tên, mô tả, diễn giả
  • Phòng tổ chức + sơ đồ phòng (upload ảnh)
  • Thời gian bắt đầu / kết thúc
  • Sức chứa tối đa (→ seats_available ban đầu)
  • Loại: Miễn phí / Có phí (nhập giá)
  • Thời gian mở đăng ký
        │
        ▼
[Validation server-side]
  • Phòng không bị trùng lịch với workshop khác cùng khung giờ?
  • Ngày nằm trong khoảng 5 ngày sự kiện?
        │
        ▼
[INSERT workshops record]
  • version = 0 (khởi tạo OL counter)
  • seats_available = capacity
        │
        ▼
[Thành công → Workshop xuất hiện trên danh sách sinh viên]
```

---

### Flow 6 · Cập nhật / hủy workshop

```
[Chọn workshop cần sửa]
        │
        ▼
Các thao tác có thể:
  ┌─ Đổi phòng / đổi giờ
  │     → Cập nhật record
  │     → Trigger thông báo cho sinh viên đã đăng ký (async, BullMQ)
  │
  ├─ Cập nhật mô tả / diễn giả
  │     → Cập nhật record (không cần notify)
  │
  └─ Hủy workshop
        → Cập nhật status='CANCELLED'
        → Nếu có phí: trigger hoàn tiền cho tất cả người đã đăng ký
        → Gửi thông báo hủy đến toàn bộ sinh viên đã đăng ký
        → seats_available không còn hiển thị
```

---

### Flow 7 · Upload PDF → AI Summary

```
[Vào trang chi tiết workshop → Tab "AI Summary"]
        │
        ▼
[Upload file PDF giới thiệu workshop]
        │
        ▼
[Server nhận file → đẩy job vào BullMQ]  ← ADR-10
        │
        ▼
[Worker nhận job]
  1. Tách nội dung văn bản từ PDF
  2. Làm sạch: loại bỏ header/footer, số trang, ký tự lạ
  3. Gọi AI Model API với nội dung đã làm sạch
  4. Nhận kết quả tóm tắt
  5. Lưu vào workshops.ai_summary
        │
        ▼
[Trang chi tiết workshop hiển thị AI Summary]
  • Sinh viên thấy ngay trên trang workshop
  • Ban tổ chức có thể xem preview + chỉnh sửa thủ công nếu cần
```

---

### Flow 8 · Import dữ liệu sinh viên từ CSV

```
[Lịch cố định: mỗi đêm, chạy tự động]  ← ADR-12
        │
        ▼
[Batch Job đọc file CSV được export từ SIS]
        │
        ▼
[Validation từng dòng]
  • Định dạng MSSV hợp lệ?
  • Email đúng format?
  • Tên không rỗng?
  ┌─ Dòng lỗi → ghi log, bỏ qua dòng đó, tiếp tục
  └─ Dòng hợp lệ → tiếp tục
        │
        ▼
[Xử lý từng record hợp lệ]
  • INSERT INTO students ON CONFLICT (student_id) DO UPDATE
    (upsert: sinh viên mới thêm, sinh viên cũ cập nhật thông tin)
  • Không xóa sinh viên cũ không còn trong CSV
    (sinh viên đã có đăng ký vẫn hợp lệ)
        │
        ▼
[Ghi báo cáo sau khi chạy xong]
  • Tổng record xử lý
  • Số thêm mới / cập nhật / lỗi
  • Danh sách dòng lỗi chi tiết
        │
        ▼
[Ban tổ chức xem báo cáo import trên admin]
```

---

### Flow 9 · Xem thống kê đăng ký

```
[Dashboard admin]
        │
        ▼
[Thống kê tổng quan]
  • Tổng số đăng ký toàn sự kiện
  • Tỉ lệ lấp đầy từng workshop
  • Số lượng check-in thực tế vs đăng ký (no-show rate)
        │
        ▼
[Drill-down theo workshop]
  • Danh sách sinh viên đã đăng ký
  • Export CSV nếu cần
```

---

## 📱 NHÂN SỰ CHECK-IN — User Flows

### Flow 10 · Check-in online (mạng ổn định)

```
[Mở mobile app → Đăng nhập]
[RBAC: role = 'CHECKIN_STAFF' → chỉ thấy màn hình quét QR]  ← ADR-05
        │
        ▼
[Chọn workshop đang diễn ra]
        │
        ▼
[Bật camera → Quét mã QR của sinh viên]
        │
        ▼
[Gửi request lên server: POST /checkins {qr_token, workshop_id}]
        │
        ▼
[Server xử lý]
  • Validate token: còn hạn? đúng workshop?
  • INSERT INTO checkins (registration_id, checked_in_at)
    ON CONFLICT DO NOTHING  ← chống check-in 2 lần
  • rowsAffected = 0 → sinh viên đã check-in rồi → thông báo "Đã check-in trước đó"
  • rowsAffected = 1 → thành công
        │
        ▼
[App hiển thị kết quả ngay lập tức]
  • ✅ Check-in thành công — tên sinh viên, ảnh (nếu có)
  • ⚠️ Đã check-in trước đó
  • ❌ QR không hợp lệ / hết hạn
```

---

### Flow 11 · Check-in offline (mất mạng) + đồng bộ lại

```
[Nhân sự ở khu vực mất mạng]
        │
        ▼
[App phát hiện mất kết nối → chuyển sang Offline Mode]
  • Banner cảnh báo hiện lên: "Đang hoạt động offline"
        │
        ▼
[Quét QR bình thường]
        │
        ▼
[App validate QR cục bộ]  ← ADR-11
  • SQLite local DB chứa danh sách QR token hợp lệ
    (được tải về và đồng bộ trước khi vào khu vực mất mạng)
  • Kiểm tra: token có trong local DB? Chưa check-in locally?
  ┌─ Hợp lệ → ghi vào local checkins table + hiển thị ✅
  └─ Không hợp lệ → hiển thị ❌ (không thể xác nhận)
        │
        ▼
[Khi kết nối được phục hồi]
        │
        ▼
[Outbox Sync]  ← ADR-11
  • App gửi toàn bộ offline check-in records lên server
  • Server xử lý từng record:
    INSERT INTO checkins ON CONFLICT DO NOTHING
    (đảm bảo idempotent — không bị trùng dù đã online check-in)
  • Server trả về kết quả từng record
  • App xóa record khỏi local outbox sau khi sync thành công
        │
        ▼
[Banner thông báo: "Đã đồng bộ X bản ghi check-in"]
```
