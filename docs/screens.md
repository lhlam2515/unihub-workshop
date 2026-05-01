# UniHub Workshop — Phân tích & Đặc tả Màn hình UI

## Tổng quan

| Nền tảng | Nhóm Actor | Số màn hình |
|:---|:---|:---:|
| Web Portal | Công cộng / Xác thực | 3 |
| Web Portal | Sinh viên (STUDENT) | 9 |
| Web Portal | Ban tổ chức (ORGANIZER) | 19 |
| Mobile App | Nhân sự điểm danh (CHECKIN_STAFF) | 8 |
| **Tổng** | | **39** |

**Nguyên tắc phân loại màn hình đã áp dụng:**
Mỗi màn hình phải có: mục đích tương tác độc lập, phạm vi dữ liệu riêng, điểm điều hướng vào/ra rõ ràng. Các trạng thái (loading, empty, error), dialog xác nhận đơn giản (Yes/No), và thao tác inline không được tính là màn hình.

---

## PHẦN I — WEB PORTAL

**Nền tảng:** Next.js App Router | **Base path:** `/` (public), `/me` (student), `/admin` (organizer)

---

### NHÓM 1 — Màn hình Công cộng & Xác thực

---

#### SCR-W01 — Màn hình Đăng nhập

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Login Screen |
| **URL Path** | `/login` |
| **Người dùng** | STUDENT, ORGANIZER, CHECKIN_STAFF (Web) |
| **FR liên quan** | FR-F01-001, FR-F01-002 |

**Mô tả chức năng:** Cổng vào duy nhất của Web Portal. Người dùng xác thực bằng email + mật khẩu. Hệ thống sinh Dual-Token (Access Token trả về body, Refresh Token set HttpOnly Cookie). Sau đăng nhập thành công, hệ thống redirect về trang phù hợp với role: STUDENT → `/workshops`, ORGANIZER → `/admin`. Lỗi xác thực không tiết lộ field nào sai (chống enumeration attack — BR-001).

**Dữ liệu hiển thị:**

- Form nhập email, mật khẩu
- Thông báo lỗi chung khi sai credential (code `INVALID_CREDENTIALS`)
- Thông báo tài khoản bị đình chỉ (code `USER_SUSPENDED`)
- Logo/branding UniHub

**Hành động chính:**

- Submit đăng nhập → POST `/api/v1/auth/login` → redirect theo role
- Không có link "Đăng ký" (student được tạo sẵn từ CSV import)

---

#### SCR-W02 — Màn hình Danh sách Workshop (Công cộng)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Public Workshop Listing Screen |
| **URL Path** | `/workshops` |
| **Người dùng** | PUBLIC (không cần đăng nhập), STUDENT, ORGANIZER |
| **FR liên quan** | FR-F02-006 |

**Mô tả chức năng:** Trang duyệt danh sách workshop đã được publish. Là trang đích sau khi đăng nhập với role STUDENT. Hiển thị workshop card với số chỗ còn lại đọc trực tiếp từ Redis (`seat:available:{workshop_id}`) — dữ liệu real-time, không phải từ PostgreSQL. Hỗ trợ filter và phân trang phía client.

**Dữ liệu hiển thị:**

- Danh sách `WorkshopSummary`: tên, diễn giả (tên + chức danh + avatar), phòng (tên + tòa nhà), thời gian bắt đầu/kết thúc, loại (miễn phí / có phí + giá), `available_seats` (từ Redis), badge trạng thái
- Filter: theo khoa (`faculty`), ngày (`date_from`, `date_to`), loại (`is_paid`)
- Phân trang: `page`, `limit`, `total`, `totalPages`
- Trạng thái "Hết chỗ" khi `available_seats = 0`
- Trạng thái "Bạn đã đăng ký" khi user đã có registration (chỉ khi đăng nhập)

---

#### SCR-W03 — Màn hình Chi tiết Workshop (Công cộng)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Public Workshop Detail Screen |
| **URL Path** | `/workshops/[workshopId]` |
| **Người dùng** | PUBLIC, STUDENT, ORGANIZER, CHECKIN_STAFF |
| **FR liên quan** | FR-F02-007, FR-F04-003, FR-F04-004 |

**Mô tả chức năng:** Trang chi tiết đầy đủ của một workshop đã PUBLISHED. Đây là điểm khởi đầu luồng đăng ký. Trang trả 404 nếu workshop không tồn tại hoặc không ở trạng thái PUBLISHED. Nút "Đăng ký" thực hiện POST /registrations và xử lý kết quả:

- **Workshop miễn phí:** Hiện toast thành công → điều hướng đến `/me/tickets`
- **Workshop có phí:** Điều hướng đến `/payments/checkout/[registrationId]`
- **Hết chỗ:** Nút bị disable, hiển thị "Hết chỗ"
- **Đã đăng ký:** Nút thay bằng "Xem vé của bạn" → link đến `/me/tickets/[ticketId]`

**Dữ liệu hiển thị:**

- `WorkshopDetail`: tên, mô tả đầy đủ, thời gian (bắt đầu/kết thúc, duration)
- **Speaker section:** ảnh đại diện, tên, chức danh, tiểu sử
- **Room section:** tên phòng, tòa nhà, tầng, sơ đồ phòng (`floor_plan_url` từ Object Storage), danh sách tiện ích (`facilities` JSONB)
- `available_seats` (real-time từ Redis) + thanh tiến độ sức chứa
- Giá (nếu `is_paid = TRUE`) + đơn vị tiền tệ
- **AI Summary section:** chỉ hiển thị khi `ai_summary.status = DONE`, gồm `summary_text` và `model_used`
- Countdown timer "Đăng ký mở" (nếu chưa đến giờ) hoặc "Kết thúc đăng ký"

---

### NHÓM 2 — Màn hình Sinh viên (STUDENT)

> Tất cả route trong nhóm này yêu cầu xác thực với `role = STUDENT`. IDOR protection được áp dụng: mọi query đều inject `WHERE student_id = jwt.sub`.

---

#### SCR-W04 — Màn hình Thanh toán (Checkout)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Payment Checkout Screen |
| **URL Path** | `/payments/checkout/[registrationId]` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F05-001, FR-F05-002, FR-F05-005 |

**Mô tả chức năng:** Màn hình hoàn tất thanh toán cho workshop có phí, sau khi Registration đã được tạo ở trạng thái `PENDING_PAYMENT`. Đây là màn hình quan trọng với ranh giới tương tác rõ ràng **Browse → Transaction** — người dùng chuyển từ bối cảnh xem sang bối cảnh giao dịch tài chính. Hiển thị **Countdown timer 15 phút** của SeatLock (`seat:lock:{wid}:{reg_id}`). Khi timer hết, nút thanh toán bị disable và hiển thị cảnh báo "Ghế đã được nhả, vui lòng đăng ký lại". Sau khi bấm "Thanh toán", hệ thống sinh `X-Idempotency-Key`, gọi POST `/api/v1/payments`, nhận `redirect_url` và chuyển hướng trình duyệt đến cổng thanh toán bên ngoài.

**Dữ liệu hiển thị:**

- Tóm tắt đơn hàng: tên workshop, thời gian, phòng, diễn giả
- Số tiền cần thanh toán (`amount`, `currency`)
- Countdown timer trực quan (đếm ngược từ `payment_deadline`)
- Lựa chọn cổng thanh toán: VNPAY / MOMO / STRIPE (radio buttons)
- `registration_id`, `status = PENDING_PAYMENT`
- Cảnh báo khi Circuit Breaker OPEN: "Dịch vụ thanh toán đang bảo trì..."
- Lỗi `SEAT_LOCK_EXPIRED` khi SeatLock đã hết hạn

**Hành động chính:**

- Chọn cổng thanh toán → POST `/api/v1/payments` (với `X-Idempotency-Key` tự động sinh) → redirect đến `redirect_url`
- Hủy đơn → DELETE `/api/v1/registrations/[registrationId]` → về `/workshops`

---

#### SCR-W05 — Màn hình Kết quả Thanh toán

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Payment Result Screen |
| **URL Path** | `/payments/result?payment_id=[paymentId]&status=[success\|failed]` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F05-003, FR-F06-001 |

**Mô tả chức năng:** Màn hình landing sau khi cổng thanh toán redirect trình duyệt trở lại hệ thống. Hệ thống gọi GET `/api/v1/students/me/payments/[paymentId]` để lấy trạng thái thực từ DB (không tin vào query param từ gateway để đảm bảo bảo mật). Đây là màn hình độc lập với ranh giới **External Redirect → Confirmation** — người dùng quay về sau khi rời sang trang bên ngoài, cần một điểm tiếp nhận riêng biệt.

**Dữ liệu hiển thị (trường hợp SUCCESS):**

- Icon thành công, thông báo xác nhận
- Tóm tắt: tên workshop, số tiền, mã giao dịch (`gateway_txn_id`), thời gian giao dịch
- `payment_id`, `status = SUCCESS`
- CTA: "Xem vé của tôi" → `/me/tickets/[ticketId]`

**Dữ liệu hiển thị (trường hợp FAILED / TIMEOUT):**

- Icon thất bại, thông báo lỗi
- Lý do thất bại (nếu có)
- CTA: "Thử thanh toán lại" → `/payments/checkout/[registrationId]` (với cùng `idempotency_key`)
- CTA: "Hủy đăng ký" → DELETE registration

---

#### SCR-W06 — Màn hình Lịch sử Đăng ký

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Registration History Screen |
| **URL Path** | `/me/registrations` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F04-006 |

**Mô tả chức năng:** Danh sách toàn bộ các đơn đăng ký của sinh viên hiện tại. IDOR protection đảm bảo chỉ hiển thị dữ liệu của `jwt.sub`. Hỗ trợ filter theo trạng thái. Là hub trung tâm để sinh viên theo dõi hành trình từ đăng ký đến tham dự.

**Dữ liệu hiển thị:**

- Danh sách `RegistrationWithDetails`: tên workshop, thời gian, địa điểm, `registration_id`, `status` (badge màu: PENDING_PAYMENT=vàng, CONFIRMED=xanh, CANCELLED=đỏ, WAITLISTED=xám)
- Với PENDING_PAYMENT: countdown timer đến `payment_deadline`
- Với CONFIRMED: link "Xem vé QR"
- Filter tab: Tất cả / Đã xác nhận / Chờ thanh toán / Đã hủy
- Phân trang

---

#### SCR-W07 — Màn hình Chi tiết Đơn đăng ký

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Registration Detail Screen |
| **URL Path** | `/me/registrations/[registrationId]` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F04-005, FR-F04-006 |

**Mô tả chức năng:** Chi tiết một đơn đăng ký cụ thể. Ranh giới **List → Detail** rõ ràng với data scope mở rộng: bao gồm thông tin workshop đầy đủ, trạng thái vé, lịch sử giao dịch liên quan. Là nơi sinh viên thực hiện hủy đăng ký (nếu cần).

**Dữ liệu hiển thị:**

- `registration_id`, `status`, `registered_at`, `confirmed_at`, `cancelled_at`
- `WorkshopSummary` đính kèm: tên, thời gian, phòng, diễn giả
- `cancellation_reason` (nếu đã hủy)
- **Payment section** (nếu workshop có phí): `payment_id`, `amount`, `gateway`, `status`, `initiated_at`, `completed_at`
- **Ticket section** (nếu CONFIRMED): `ticket_id`, `status`, link "Xem QR Code"
- `payment_deadline` countdown (nếu PENDING_PAYMENT)

**Hành động chính:**

- Hủy đăng ký → DELETE `/api/v1/registrations/[registrationId]` → dialog xác nhận → redirect `/me/registrations`
- Hoàn tất thanh toán (nếu PENDING_PAYMENT) → `/payments/checkout/[registrationId]`

---

#### SCR-W08 — Màn hình Danh sách Vé điện tử

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Ticket List Screen |
| **URL Path** | `/me/tickets` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F06-002 |

**Mô tả chức năng:** Danh sách tất cả vé điện tử ACTIVE của sinh viên. Đây là màn hình tách biệt khỏi danh sách đăng ký vì có phạm vi dữ liệu khác (tập trung vào `qr_token` và thông tin check-in, không quan tâm đến lịch sử đăng ký). Sinh viên sử dụng màn hình này để chuẩn bị trước ngày sự kiện.

**Dữ liệu hiển thị:**

- Danh sách `TicketWithWorkshop`: tên workshop, thời gian, phòng (tên + tòa nhà), `ticket_id`, `status` (ACTIVE/VOID), `issued_at`
- Preview QR Code nhỏ (thumbnail)
- Sắp xếp theo ngày sự kiện (gần nhất lên đầu)
- Badge "Sắp diễn ra" / "Đã qua"

---

#### SCR-W09 — Màn hình Vé điện tử & QR Code

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Ticket QR Screen |
| **URL Path** | `/me/tickets/[ticketId]` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F06-002 |

**Mô tả chức năng:** Màn hình hiển thị vé điện tử đầy đủ với QR Code kích thước lớn để nhân sự quét. Ranh giới **List → Detail** với mục đích tương tác hoàn toàn khác: sinh viên cần giữ màn hình này và đưa ra cho nhân sự tại cổng sự kiện. Giao diện tối giản, QR Code chiếm diện tích lớn, hỗ trợ tăng độ sáng màn hình.

**Dữ liệu hiển thị:**

- QR Code render từ `qr_token` (kích thước lớn, full-width)
- Tên workshop, thời gian, địa điểm (tòa nhà + phòng)
- Tên sinh viên, mã sinh viên (`student_code`)
- `ticket_id` (dạng rút gọn để đối chiếu thủ công nếu cần)
- `status` badge: ACTIVE (xanh) / VOID (đỏ — vé đã bị hủy)
- `issued_at`: ngày cấp vé
- Cảnh báo nổi bật nếu `status = VOID`: "Vé này đã bị hủy, vui lòng liên hệ ban tổ chức"

---

#### SCR-W10 — Màn hình Lịch sử Giao dịch

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Payment History Screen |
| **URL Path** | `/me/payments` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F05-001 |

**Mô tả chức năng:** Lịch sử giao dịch thanh toán độc lập với lịch sử đăng ký. Phạm vi dữ liệu khác biệt: tập trung vào các chỉ số tài chính (`amount`, `gateway`, `gateway_txn_id`, `status`). Sinh viên cần màn hình này để kiểm tra biên lai hoặc tra cứu khi có tranh chấp giao dịch.

**Dữ liệu hiển thị:**

- Danh sách `Payment`: tên workshop liên quan, `amount`, `currency`, `gateway` (logo VNPay/MoMo/Stripe), `status` (badge), `initiated_at`, `completed_at`
- Filter theo `status`: Tất cả / Thành công / Thất bại / Đang xử lý
- Tổng tiền đã thanh toán thành công (summary)

---

#### SCR-W11 — Màn hình Chi tiết Giao dịch

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Payment Transaction Detail Screen |
| **URL Path** | `/me/payments/[paymentId]` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F05-001 |

**Mô tả chức năng:** Chi tiết một giao dịch cụ thể, dùng cho mục đích kiểm tra biên lai và tra cứu khi cần đối chiếu với ngân hàng hoặc ban tổ chức.

**Dữ liệu hiển thị:**

- `payment_id` (đầy đủ)
- `gateway_txn_id` (mã giao dịch từ cổng thanh toán)
- `amount`, `currency`
- `gateway` (tên cổng thanh toán)
- `status` với mô tả trạng thái bằng tiếng Việt
- `initiated_at`, `completed_at`, `timeout_at` (nếu có)
- Thông tin workshop: tên, thời gian
- Link đến đơn đăng ký liên quan

---

#### SCR-W12 — Màn hình Hồ sơ cá nhân

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Student Profile Screen |
| **URL Path** | `/me/profile` |
| **Người dùng** | STUDENT |
| **FR liên quan** | FR-F01-004 (GET /auth/me) |

**Mô tả chức năng:** Thông tin tài khoản của sinh viên. Không cho phép chỉnh sửa trực tiếp (thông tin nguồn từ CSV của trường). Cung cấp chức năng đăng xuất.

**Dữ liệu hiển thị:**

- `full_name`, `student_code`, `faculty`, `class_year`
- `email` (tài khoản UniHub), `email_edu` (email trường)
- `user_id`, `role = STUDENT`
- `status` tài khoản (ACTIVE / SUSPENDED)
- Nút "Đăng xuất" → POST `/api/v1/auth/logout` → về `/login`

---

### NHÓM 3 — Màn hình Ban tổ chức (ORGANIZER/Admin)

> Tất cả route `/admin/*` yêu cầu xác thực với `role = ORGANIZER`. Unauthorized → redirect `/login`.

---

#### SCR-W13 — Màn hình Admin Dashboard (Tổng quan)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Admin Dashboard Screen |
| **URL Path** | `/admin` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-006, FR-F10-001, FR-F10-002, FR-F10-003, FR-F10-005 |

**Mô tả chức năng:** Trang chủ Admin — tổng quan nhanh toàn hệ thống sau khi đăng nhập với role ORGANIZER. Tập hợp các chỉ số quan trọng nhất từ nhiều module để ban tổ chức nắm bắt tình hình ngay lập tức.

**Dữ liệu hiển thị:**

- **Workshop Overview:** số workshop đang PUBLISHED, số workshop tự động chuyển COMPLETED trong 24h qua, tổng chỗ còn lại (tổng hợp từ Redis), số đăng ký hôm nay
- **Quick Stats cards:** tổng đăng ký (CONFIRMED/PENDING), tổng doanh thu (tổng `payments.amount` status=SUCCESS)
- **Sắp diễn ra:** danh sách 5 workshop gần nhất (tên, thời gian, fill-rate %)
- **System Health banner:** trạng thái Circuit Breaker của các gateway (CLOSED=xanh, OPEN=đỏ, HALF_OPEN=vàng)
- **Cảnh báo:** số payment đang PENDING quá hạn, số CSV sync job đang RUNNING
- Links nhanh đến các phân hệ quản lý

---

#### SCR-W14 — Màn hình Quản lý Workshop (Admin List)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Workshop Management List Screen |
| **URL Path** | `/admin/workshops` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-006 |

**Mô tả chức năng:** Danh sách toàn bộ workshop ở **mọi trạng thái** (DRAFT, PUBLISHED, CANCELLED, COMPLETED). Khác biệt hoàn toàn với `/workshops` public: bao gồm DRAFT và CANCELLED, có thêm dữ liệu quản trị (`confirmed_count`, `locked_count`). Đây là điểm xuất phát cho mọi thao tác quản lý workshop.

**Dữ liệu hiển thị:**

- Danh sách `WorkshopAdminDetail`: tên, speaker, room, `starts_at`, `ends_at`, `status` (badge), `confirmed_count`, `locked_count`, `available_seats` (Redis), `created_by`, `created_at`
- Filter: theo `status`, theo ngày, theo diễn giả
- Cột quick-action: nút Publish (nếu DRAFT), nút Hủy (nếu PUBLISHED), nút Xem thống kê

**Hành động chính:**

- "Tạo Workshop mới" → `/admin/workshops/new`
- Click vào workshop → `/admin/workshops/[workshopId]`

---

#### SCR-W15 — Màn hình Tạo Workshop

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Workshop Create Form Screen |
| **URL Path** | `/admin/workshops/new` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001, FR-F02-002 |

**Mô tả chức năng:** Form tạo workshop mới ở trạng thái DRAFT. Ranh giới **Browse → Data Entry Transaction** rõ ràng. Bao gồm kiểm tra xung đột phòng real-time khi chọn room + time slot. Logic validate: `is_paid = TRUE` bắt buộc `price > 0`; `ends_at > starts_at`. Redis counter **chưa** được khởi tạo ở bước này (chỉ khi Publish — BR-011).

**Dữ liệu hiển thị / Input:**

- `title` (text, required, max 500 ký tự)
- `description` (rich text/textarea)
- `speaker_id` — dropdown tìm kiếm danh sách speakers từ GET `/api/v1/admin/speakers`
- `room_id` — dropdown tìm kiếm rooms từ GET `/api/v1/admin/rooms`, hiển thị capacity
- `starts_at`, `ends_at` — datetime picker, validate xung đột phòng real-time (inline warning khi chọn)
- `capacity` — số nguyên, max = room.capacity
- `is_paid` — toggle
- `price` — số thực, chỉ hiển thị khi `is_paid = TRUE`
- Xem trước thông tin workshop trước khi submit

**Validation hiển thị:**

- Cảnh báo xung đột phòng: "Phòng [tên] đã có workshop [tên] từ [giờ] - [giờ]"
- Lỗi `is_paid=TRUE` nhưng không có price

---

#### SCR-W16 — Màn hình Chi tiết Workshop (Admin)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Workshop Detail Admin Screen |
| **URL Path** | `/admin/workshops/[workshopId]` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-003, FR-F02-004, FR-F02-005, FR-F02-007, FR-F10-005 |

**Mô tả chức năng:** Hub quản lý trung tâm cho một workshop cụ thể. Đây là màn hình **role-split** so với SCR-W03 (cùng workshop nhưng data scope và actions hoàn toàn khác): bao gồm dữ liệu quản trị (`confirmed_count`, `locked_count`, `created_by`), các action nguy hiểm (Publish, Cancel, Emergency Update). Các action quan trọng dùng dialog xác nhận (UI state, không phải màn hình riêng).

**Dữ liệu hiển thị:**

- Toàn bộ `WorkshopAdminDetail`: thông tin đầy đủ + `confirmed_count`, `locked_count`, `available_seats`
- **Status timeline:** DRAFT → PUBLISHED → COMPLETED/CANCELLED (visual stepper)
- **Action panel** theo trạng thái:
  - Nếu DRAFT: nút "Publish", nút "Chỉnh sửa" (→ SCR-W17), nút "Xóa"
  - Nếu PUBLISHED: nút "Đổi phòng/giờ" (mở modal Emergency Update), nút "Hủy Workshop"
- **Navigation tabs:** Tổng quan | Tài liệu & AI (→ SCR-W19) | Thống kê (→ SCR-W18)
- AI Summary preview (nếu DONE): `summary_text` rút gọn
- Danh sách tài liệu đã upload (tên file, `upload_status`)
- **Realtime seat counter:** đọc từ Redis mỗi 30 giây

**Modal Emergency Update (UI state, không phải màn hình):**

- Form inline: chọn `room_id` mới (dropdown), `starts_at`/`ends_at` mới
- Kiểm tra xung đột phòng real-time trước khi submit
- Cảnh báo: "Thông báo sẽ được gửi cho [N] sinh viên đã đăng ký"

---

#### SCR-W17 — Màn hình Chỉnh sửa Workshop

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Workshop Edit Form Screen |
| **URL Path** | `/admin/workshops/[workshopId]/edit` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001, FR-F02-002 |

**Mô tả chức năng:** Form chỉnh sửa workshop đang ở trạng thái **DRAFT**. Ranh giới **View → Edit** rõ ràng với mục đích tương tác khác biệt. Route này không accessible nếu workshop đã PUBLISHED/CANCELLED (redirect về SCR-W16 với thông báo). Đối với workshop PUBLISHED, đổi phòng/giờ được xử lý qua Emergency Update modal trên SCR-W16.

**Dữ liệu hiển thị / Input:**

- Tương tự SCR-W15 nhưng form pre-filled với dữ liệu hiện tại
- Hiển thị `workshop_id` (readonly) để reference
- Lịch sử thay đổi (nếu có)

---

#### SCR-W18 — Màn hình Thống kê Workshop

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Workshop Statistics Screen |
| **URL Path** | `/admin/workshops/[workshopId]/stats` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-006, FR-F07-002 |

**Mô tả chức năng:** Phân tích tham dự và đăng ký cho một workshop. Phạm vi dữ liệu hoàn toàn khác SCR-W16 (analytics, không phải management). Query từ PostgreSQL View `v_workshop_checkin_stats`. Đây là màn hình sau sự kiện cho ban tổ chức đánh giá hiệu quả.

**Dữ liệu hiển thị:**

- `total_registered` (đã CONFIRMED), `total_checkedin`, `offline_checkins`, `checkin_rate_pct`
- Biểu đồ check-in theo thời gian (timeline check-in trong ngày sự kiện)
- Breakdown: Online check-in vs Offline sync (`source = ONLINE/OFFLINE_SYNC`)
- Danh sách sinh viên đã check-in: tên, mã sinh viên, thời điểm check-in, nguồn
- Danh sách sinh viên đã đăng ký nhưng **chưa check-in** (no-show)
- Export CSV button (danh sách tham dự)

---

#### SCR-W19 — Màn hình Quản lý Tài liệu & AI Summary

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Document & AI Pipeline Management Screen |
| **URL Path** | `/admin/workshops/[workshopId]/documents` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F03-001, FR-F03-002 |

**Mô tả chức năng:** Quản lý tài liệu PDF của workshop và theo dõi trạng thái AI Summary pipeline. Ranh giới tương tác **Workshop Detail → File Management** — người dùng chuyển sang bối cảnh làm việc với file và AI pipeline, không còn quan tâm đến thông tin cơ bản của workshop. Upload file kích hoạt tự động Pipe-and-Filter AI pipeline. Organizer poll trạng thái AI để biết khi nào tóm tắt sẵn sàng.

**Dữ liệu hiển thị:**

- Danh sách `WorkshopDocument`: `original_name`, `file_size_bytes`, `upload_status`, `uploaded_at`, link download
- **AI Summary Status panel** cho từng document:
  - `status`: PENDING (chờ) → PROCESSING (đang xử lý) → DONE (hoàn thành) / FAILED (lỗi)
  - `summary_text` preview (khi DONE)
  - `model_used` (vd: "claude-sonnet-4-6"), `generated_at`
  - `error_message` (khi FAILED)
- Progress indicator khi PROCESSING (auto-refresh mỗi 5s)

**Hành động chính:**

- Upload PDF (drag & drop + file picker) → POST `/api/v1/admin/workshops/[id]/documents` (multipart) → kích hoạt AI tự động
- Retry AI → POST `/api/v1/admin/documents/[id]/ai-retry` (chỉ khi FAILED)
- Xóa tài liệu → DELETE → cascade xóa AI Summary

---

#### SCR-W20 — Màn hình Quản lý Phòng

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Room Management Screen |
| **URL Path** | `/admin/rooms` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001, FR-F02-002 |

**Mô tả chức năng:** Danh sách và quản lý tất cả phòng. Organizer cần tham chiếu khi tạo/sửa workshop. Bao gồm sức chứa, tiện ích và sơ đồ phòng.

**Dữ liệu hiển thị:**

- Danh sách `Room`: `name`, `building`, `floor`, `capacity`, danh sách `facilities` (từ JSONB), `floor_plan_url` (preview thumbnail)
- Trạng thái "Đang sử dụng" / "Trống" (dựa trên workshop PUBLISHED hiện tại trong phòng)
- Nút "Thêm phòng mới" → mở form inline/modal hoặc `/admin/rooms/new`
- Nút "Sửa" cho từng phòng → `/admin/rooms/[roomId]/edit`

---

#### SCR-W21 — Màn hình Form Phòng (Tạo/Sửa)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Room Form Screen |
| **URL Path** | `/admin/rooms/new` &nbsp;/&nbsp; `/admin/rooms/[roomId]/edit` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001 |

**Mô tả chức năng:** Form tạo mới hoặc chỉnh sửa phòng. Hai URL cùng render một component form với trạng thái empty (create) hoặc pre-filled (edit).

**Dữ liệu hiển thị / Input:**

- `name` (text, required), `building` (text), `floor` (number), `capacity` (number > 0, required)
- `floor_plan_url` (URL input + upload sơ đồ phòng lên Object Storage)
- `facilities` (JSONB builder: checkboxes cho projector, AC, mic count, v.v.)

---

#### SCR-W22 — Màn hình Quản lý Diễn giả

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Speaker Management Screen |
| **URL Path** | `/admin/speakers` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001 |

**Mô tả chức năng:** Danh sách và quản lý diễn giả. Dữ liệu tham chiếu khi tạo workshop.

**Dữ liệu hiển thị:**

- Danh sách `Speaker`: avatar, `full_name`, `title` (chức danh), `bio` (rút gọn), số workshop đã/đang tham gia
- Nút "Thêm diễn giả" → `/admin/speakers/new`
- Nút "Sửa" → `/admin/speakers/[speakerId]/edit`

---

#### SCR-W23 — Màn hình Form Diễn giả (Tạo/Sửa)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Speaker Form Screen |
| **URL Path** | `/admin/speakers/new` &nbsp;/&nbsp; `/admin/speakers/[speakerId]/edit` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F02-001 |

**Mô tả chức năng:** Form tạo mới / chỉnh sửa diễn giả.

**Dữ liệu hiển thị / Input:**

- `full_name` (required), `title` (chức danh), `bio` (textarea), `avatar_url` (upload ảnh lên Object Storage)

---

#### SCR-W24 — Màn hình Quản lý Người dùng

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer User Management Screen |
| **URL Path** | `/admin/users` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F01-008 (FR-F10-004 qua liên kết) |

**Mô tả chức năng:** Danh sách tất cả tài khoản hệ thống. Organizer dùng để quản lý nhân sự và xử lý sự cố tài khoản.

**Dữ liệu hiển thị:**

- Danh sách `User`: `email`, `role` (badge), `status` (ACTIVE=xanh, SUSPENDED=đỏ, PENDING_VERIFICATION=vàng), `created_at`
- Filter theo `role`: Tất cả / STUDENT / ORGANIZER / CHECKIN_STAFF
- Với CHECKIN_STAFF: hiển thị số workshop được phân công

**Hành động chính:**

- Click → `/admin/users/[userId]`
- "Thêm tài khoản mới" (tạo Organizer/CheckinStaff account)

---

#### SCR-W25 — Màn hình Chi tiết & Quản lý Tài khoản

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer User Detail Management Screen |
| **URL Path** | `/admin/users/[userId]` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F01-008 |

**Mô tả chức năng:** Chi tiết một tài khoản và các hành động quản trị: kích hoạt/đình chỉ tài khoản, thu hồi token khẩn cấp. Ranh giới **List → Detail + Management Actions** — đây không phải chỉ là xem thông tin mà còn thực hiện các hành động có ảnh hưởng bảo mật.

**Dữ liệu hiển thị:**

- `user_id`, `email`, `role`, `status`, `created_at`
- Với STUDENT: `student_code`, `full_name`, `faculty`, `class_year`, `email_edu`
- Với CHECKIN_STAFF: danh sách workshop được phân công (`allowed_workshop_ids`)
- Token status: last login time (nếu có)

**Hành động chính:**

- Toggle ACTIVE/SUSPENDED → PATCH `/api/v1/admin/users/[id]/status`
- "Thu hồi token khẩn cấp" → POST `/api/v1/admin/users/[id]/revoke-token` (khi nhân sự mất điện thoại)
- "Phân công Workshop" (với CHECKIN_STAFF) → `/admin/users/[userId]/assign-workshops`

---

#### SCR-W26 — Màn hình Phân công Workshop cho Nhân sự

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Staff Workshop Assignment Screen |
| **URL Path** | `/admin/users/[userId]/assign-workshops` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F10-004 |

**Mô tả chức năng:** Màn hình quản lý phân công workshop cho một CHECKIN_STAFF cụ thể. Ranh giới tương tác rõ ràng: đây là một **business transaction** quan trọng (ảnh hưởng đến JWT scope của nhân sự) cần một ngữ cảnh riêng, không thể xử lý inline trong màn hình user detail. Hiển thị cảnh báo **Eventual Consistency**: thay đổi chỉ có hiệu lực sau khi nhân sự đăng xuất và đăng nhập lại (JWT cũ vẫn hợp lệ cho đến khi hết hạn).

**Dữ liệu hiển thị:**

- Thông tin nhân sự: `full_name`, `email`
- **Current assignments:** danh sách workshop đang được phân công (tên, thời gian, trạng thái)
- **Available workshops:** danh sách workshop PUBLISHED chưa được phân công (checkbox list)
- **Cảnh báo Eventual Consistency:** banner vàng — "Nhân sự cần đăng xuất và đăng nhập lại để nhận quyền mới. Thay đổi không áp dụng ngay lập tức cho session hiện tại."

---

#### SCR-W27 — Màn hình Đồng bộ Dữ liệu Sinh viên (Jobs List)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Student Sync Jobs Screen |
| **URL Path** | `/admin/student-sync` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F09-001 |

**Mô tả chức năng:** Danh sách lịch sử các lần import CSV sinh viên và kích hoạt job mới. Batch-Sequential architecture: job chạy bất đồng bộ, API trả 202 ngay, Organizer poll để theo dõi tiến độ.

**Dữ liệu hiển thị:**

- Danh sách `StudentSyncJob`: `source_file_name`, `triggered_at`, `status` (badge), `total_rows`, `processed_rows`, `error_rows`, `completed_at`
- Progress bar trực quan cho job đang RUNNING
- File S3 path selector để kích hoạt job mới

**Hành động chính:**

- "Kích hoạt Import mới" → chọn file CSV trong S3 → POST `/api/v1/admin/student-sync` → nhận `job_id` → auto-redirect `/admin/student-sync/[jobId]`
- Click vào job → `/admin/student-sync/[jobId]`

---

#### SCR-W28 — Màn hình Chi tiết Job & Danh sách Lỗi

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Sync Job Detail & Error Log Screen |
| **URL Path** | `/admin/student-sync/[jobId]` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F09-001, FR-F09-002 |

**Mô tả chức năng:** Chi tiết một lần import CSV: tiến độ xử lý và danh sách lỗi từng dòng để debug. Organizer poll màn hình này (hoặc dùng auto-refresh) để theo dõi job đang RUNNING. Data scope hoàn toàn khác danh sách jobs: bao gồm `student_sync_errors` chi tiết từng dòng lỗi.

**Dữ liệu hiển thị:**

- `StudentSyncJob` đầy đủ: tất cả counter + timestamps
- Progress bar phần trăm (`processed_rows / total_rows`)
- **Error log table** (`StudentSyncError`): `row_number`, `raw_data` (nội dung dòng lỗi), `error_reason` (DUPLICATE/INVALID_FORMAT/MISSING_FIELD), `error_detail`
- Link download error log file (`error_log_url` trên S3)
- Auto-refresh mỗi 3s khi status = RUNNING

---

#### SCR-W29 — Màn hình Lịch sử Thông báo (Audit Log)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Notification Audit Log Screen |
| **URL Path** | `/admin/notifications/logs` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F08-002 |

**Mô tả chức năng:** Audit trail đầy đủ mọi thông báo đã được gửi/cố gắng gửi. Organizer dùng để kiểm tra xem sinh viên có nhận thông báo không, debug khi thông báo thất bại.

**Dữ liệu hiển thị:**

- Danh sách `NotificationLog`: `type` (loại sự kiện), `channel` (APP/EMAIL/TELEGRAM), `status` (PENDING/SENT/FAILED), `user_id`, tên workshop liên quan, `sent_at`, `error_message` (khi FAILED)
- Filter: theo `workshop_id`, `status`, `channel`, khoảng thời gian
- Chi tiết payload (nội dung email/push đã gửi) khi click vào từng record

---

#### SCR-W30 — Màn hình Cấu hình Kênh Thông báo

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer Notification Channel Config Screen |
| **URL Path** | `/admin/notifications/channels` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F08-002 |

**Mô tả chức năng:** Bật/tắt và cấu hình các kênh thông báo (APP, EMAIL, TELEGRAM). Ranh giới tương tác khác SCR-W29: đây là **system configuration** không phải audit. Thiết kế externalized config cho phép thêm kênh mới mà không cần thay đổi code.

**Dữ liệu hiển thị:**

- Danh sách `NotificationChannelConfig`: `channel_type`, toggle `is_active`, `config_json` viewer (endpoint, API key pattern, template ID)
- Trạng thái real-time của từng kênh
- Form cập nhật config inline cho từng kênh

---

#### SCR-W31 — Màn hình Giám sát Hệ thống (System Health)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Organizer System Health Monitor Screen |
| **URL Path** | `/admin/system` |
| **Người dùng** | ORGANIZER |
| **FR liên quan** | FR-F10-001, FR-F10-002, FR-F10-003 |

**Mô tả chức năng:** Màn hình giám sát sức khỏe hệ thống tập trung. Mặc dù có 3 API endpoint riêng biệt cho Circuit Breaker, Payment Timeout Job, và Reconciliation Job, chúng hợp lý khi được trình bày trong một màn hình duy nhất vì: cùng actor, cùng mục đích (system observability), và thường được kiểm tra cùng nhau. Tách thành 3 màn hình riêng sẽ là over-fragmentation.

**Dữ liệu hiển thị:**

**Section 1 — Circuit Breaker:**

- Danh sách `CircuitBreakerStatus` cho tất cả gateway: `state` (CLOSED=xanh/OPEN=đỏ/HALF_OPEN=vàng), `failure_count`, `opened_at`, `last_attempt`
- Nút "Reset thủ công" (force CLOSED) → POST `/api/v1/admin/system/circuit-breaker/[gateway]/reset`
- Thresholds hiển thị: "CLOSED→OPEN khi ≥5 failures trong 60s; OPEN→HALF_OPEN sau 30s"

**Section 2 — Payment Timeout Job:**

- `pending_overdue_count` (số payment PENDING quá hạn hiện tại)
- `last_run_at`, `processed_last_24h`
- Tần suất chạy: "Mỗi 1 phút (Cron)"

**Section 3 — Reconciliation Job:**

- `last_run_at`, `drift_detected` (boolean)
- Nếu có drift: bảng `drift_details` (workshop_id, redis_available, postgres_available, delta)
- Tần suất chạy: "Mỗi 10 phút (Cron)"

**Auto-refresh:** mỗi 30 giây cho Circuit Breaker section.

---

## PHẦN II — MOBILE APP (Offline-First)

**Nền tảng:** React Native | **Actor duy nhất:** CHECKIN_STAFF | **Thiết kế:** Offline-First với SQLite local

> Mobile App được thiết kế **độc quyền cho nhân sự điểm danh**. Sinh viên và Ban tổ chức sử dụng Web Portal. Access Token có hạn 8 giờ (phủ toàn bộ ca làm việc offline). Refresh Token lưu trong Keychain/Secure Storage.

---

#### SCR-M01 — Màn hình Đăng nhập (Mobile)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Login Screen |
| **Stack Route** | `LoginScreen` (Root navigator) |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F01-001, FR-F01-002 |

**Mô tả chức năng:** Điểm vào duy nhất của Mobile App. Bắt buộc phải đăng nhập **khi có mạng** trước ca làm việc. Hệ thống sinh Access Token (8 giờ) + Refresh Token, lưu vào Keychain. JWT payload chứa `allowed_workshop_ids[]` — danh sách workshop được phân công. Sau đăng nhập thành công, chuyển sang `HomeScreen`.

**Dữ liệu hiển thị:**

- Form: email, mật khẩu, nút "Đăng nhập"
- Logo UniHub + version app
- Thông báo lỗi: sai credential, tài khoản bị đình chỉ, không có kết nối mạng
- Thông báo "Cần kết nối mạng để đăng nhập lần đầu"

---

#### SCR-M02 — Màn hình Danh sách Workshop Được Phân công (Home)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Assigned Workshop List Screen |
| **Stack Route** | `HomeScreen` (Tab navigator — Tab "Sự kiện") |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-001, FR-F10-004 |

**Mô tả chức năng:** Màn hình chủ của app sau đăng nhập. Hiển thị **chỉ những workshop nằm trong `jwt.allowed_workshop_ids`**. Nhân sự chọn workshop để vào dashboard check-in. Khi có mạng, hiển thị trạng thái đồng bộ (đã pre-load / chưa pre-load).

**Dữ liệu hiển thị:**

- Danh sách workshop được phân công: tên, địa điểm (phòng + tòa nhà), `starts_at`, `ends_at`
- Trạng thái đồng bộ của từng workshop: "Đã tải [N] vé" / "Chưa đồng bộ" / "Đồng bộ lần cuối: [thời gian]"
- Badge "Đang diễn ra" / "Sắp diễn ra" / "Đã kết thúc"
- Nút "Đồng bộ tất cả" (tải danh sách ticket về SQLite khi có mạng)
- Chỉ báo kết nối mạng (online/offline status)
- Tên nhân sự + thời hạn token còn lại

---

#### SCR-M03 — Màn hình Dashboard Check-in Workshop

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Workshop Checkin Dashboard Screen |
| **Stack Route** | `WorkshopDashboardScreen` |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-001, FR-F07-002, FR-F07-003 |

**Mô tả chức năng:** Dashboard trung tâm cho một workshop cụ thể khi ca làm việc bắt đầu. Hiển thị số liệu check-in real-time và là điểm khởi đầu quét QR. Đây là màn hình nhân sự giữ và nhìn liên tục trong suốt quá trình check-in tại cổng sự kiện.

**Dữ liệu hiển thị:**

- **Counter real-time:** `total_registered` / `total_checkedin` / `remaining` (đọc từ API nếu online, từ SQLite nếu offline)
- **Progress ring:** tỉ lệ check-in (%)
- **Status bar:** Online (xanh) / Offline (cam) — hiển thị số record đang chờ sync trong offline queue
- **Danh sách check-in gần nhất:** tên sinh viên, mã sinh viên, thời điểm, nguồn (ONLINE/OFFLINE)
- Thông tin workshop: tên, thời gian, phòng
- Nút lớn **"Quét QR"** (action chính)
- Nút **"Đồng bộ"** (khi có mạng và có records trong offline queue)

---

#### SCR-M04 — Màn hình Máy quét QR

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile QR Scanner Screen |
| **Stack Route** | `QRScannerScreen` |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-002, FR-F07-003 |

**Mô tả chức năng:** Màn hình camera chiếm toàn màn hình để quét QR Code. Đây là màn hình có sự kiện device-level (camera I/O) không thể là component của màn hình khác. Hệ thống tự nhận diện online/offline và xử lý theo luồng phù hợp:

- **Online:** Gọi POST `/api/v1/checkin/scan` → nhận kết quả từ server
- **Offline:** Tra cứu `qr_token` trong SQLite local → validate offline → ghi vào `offline_checkin_queue`

**Dữ liệu hiển thị:**

- Viewfinder camera với khung dẫn hướng QR
- Chỉ báo trạng thái kết nối (góc trên: "Online" / "Offline — Chế độ ngoại tuyến")
- Thông tin workshop đang check-in (tên, phòng — ở bottom)
- Đèn flash toggle button
- Nút "Nhập thủ công" (fallback khi camera lỗi — nhập qr_token bằng bàn phím)

Sau khi quét xong → chuyển ngay sang SCR-M05.

---

#### SCR-M05 — Màn hình Kết quả Quét QR

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Checkin Scan Result Screen |
| **Stack Route** | `CheckinResultScreen` |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-002, FR-F07-003 |

**Mô tả chức năng:** Màn hình kết quả sau mỗi lần quét QR. Đây là ranh giới **Scan Action → Result Review**: nhân sự cần nhìn thấy rõ kết quả, xác nhận thông tin sinh viên, và chủ động quay lại quét tiếp. Không phải UI state của màn hình scanner vì: có data scope riêng (student info), nhân sự cần review có chủ đích, có thể cần thao tác phụ (báo cáo conflict). Kết quả có 3 loại với visual design khác nhau rõ ràng.

**Dữ liệu hiển thị:**

**Trường hợp THÀNH CÔNG (nền xanh lá):**

- Icon check lớn, "Điểm danh thành công!"
- Tên sinh viên (lớn, rõ ràng), mã sinh viên
- Thời điểm check-in, nguồn (Online / Offline)
- Tên workshop

**Trường hợp ĐÃ CHECK-IN TRƯỚC ĐÓ (nền vàng):**

- Icon cảnh báo, "Sinh viên này đã điểm danh rồi!"
- Tên sinh viên, mã sinh viên
- Thời điểm check-in trước đó

**Trường hợp VÉ KHÔNG HỢP LỆ (nền đỏ):**

- Icon lỗi, mô tả lý do: "Vé đã bị hủy" / "Vé không thuộc sự kiện này" / "Mã QR không tồn tại"
- Tên sinh viên (nếu tìm được), mã QR rút gọn

**Hành động chính:** Nút lớn "Quét tiếp" → back về SCR-M04 (tự động sau 2-3 giây nếu thành công)

---

#### SCR-M06 — Màn hình Hàng đợi Offline

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Offline Queue Manager Screen |
| **Stack Route** | `OfflineQueueScreen` (Tab navigator — Tab "Hàng đợi") |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-003, FR-F07-004 |

**Mô tả chức năng:** Danh sách các bản ghi điểm danh đã thu thập khi offline, chưa được đồng bộ lên server. Nhân sự cần có khả năng xem và kiểm tra records trước khi sync để phát hiện vấn đề. Đây là màn hình quản lý dữ liệu trung gian (local SQLite `offline_checkin_queue`) — phạm vi dữ liệu và mục đích khác hoàn toàn so với dashboard check-in.

**Dữ liệu hiển thị:**

- Tổng số records đang chờ: `[N] bản ghi chưa đồng bộ`
- Danh sách records từ `offline_checkin_queue`: `qr_token` (rút gọn), tên sinh viên (từ SQLite cache), `checked_in_at` (thời điểm offline), `device_id`, `sync_status` (PENDING/SYNCED/CONFLICT)
- Thời điểm offline bắt đầu và kết thúc
- Kích thước dữ liệu local (SQLite storage usage)
- Records với `sync_status = CONFLICT` được highlight đỏ kèm `conflict_reason`

**Hành động chính:**

- Nút "Đồng bộ ngay" → trigger sync → chuyển sang SCR-M07

---

#### SCR-M07 — Màn hình Tiến độ & Báo cáo Đồng bộ

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Sync Progress & Report Screen |
| **Stack Route** | `SyncProgressScreen` |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F07-004, FR-F07-005 |

**Mô tả chức năng:** Màn hình theo dõi quá trình batch sync dữ liệu offline lên server. Đây là màn hình riêng biệt (không phải UI state) vì: quá trình sync có thể mất thời gian đáng kể (hàng trăm records), có kết quả chi tiết cần review (synced/skipped/conflicts), và nhân sự cần biết chính xác kết quả để đảm bảo không mất dữ liệu. Tự động xử lý Token Refresh (FR-F07-005) trong nền nếu gặp 401 mà không ngắt quá trình.

**Dữ liệu hiển thị:**

**Khi đang sync:**

- Progress bar + phần trăm
- Số records đã xử lý / tổng
- Tốc độ sync hiện tại (records/s)
- Log stream: "Đang gửi batch [N]..."

**Khi hoàn thành:**

- Tóm tắt: `synced` (thành công), `skipped` (đã tồn tại — idempotent), `conflicts` (vé bị void trước khi sync)
- Danh sách conflicts với `local_id` và `reason` để nhân sự báo cáo ban tổ chức
- Thời gian hoàn thành
- Nút "Xong" → back về SCR-M02 hoặc SCR-M03

---

#### SCR-M08 — Màn hình Hồ sơ & Cài đặt (Mobile)

| Thuộc tính | Giá trị |
|:---|:---|
| **Tên màn hình** | Mobile Profile & Settings Screen |
| **Stack Route** | `ProfileScreen` (Tab navigator — Tab "Hồ sơ") |
| **Người dùng** | CHECKIN_STAFF |
| **FR liên quan** | FR-F01-003, FR-F01-008 |

**Mô tả chức năng:** Thông tin tài khoản nhân sự và cài đặt ứng dụng. Cung cấp đăng xuất và thông tin kỹ thuật về token/session cho nhân sự khi cần hỗ trợ.

**Dữ liệu hiển thị:**

- Tên nhân sự, email, role
- **Token status:** "Token hết hạn lúc [thời gian]" (countdown từ `exp`)
- **Danh sách workshop được phân công** (từ `jwt.allowed_workshop_ids`): tên + thời gian
- **Offline storage:** số vé trong SQLite, dung lượng sử dụng, thời điểm pre-load cuối
- **Cài đặt:** bật/tắt thông báo âm thanh khi quét QR thành công/thất bại, độ sáng màn hình khi hiển thị kết quả
- App version, server URL (cho troubleshooting)

**Hành động chính:**

- "Đăng xuất" → POST `/api/v1/auth/logout` → xóa Keychain → về SCR-M01
- "Làm mới quyền hạn" → trigger token refresh (nếu nhân sự vừa được phân công workshop mới và cần cập nhật JWT)

---

## TỔNG HỢP & GHI CHÚ QUAN TRỌNG

### Bảng tổng hợp toàn bộ màn hình

| ID | Tên màn hình | URL / Route | Platform | Actor |
|:---|:---|:---|:---:|:---|
| W01 | Login | `/login` | Web | ALL |
| W02 | Workshop Listing (Public) | `/workshops` | Web | PUBLIC, STUDENT, ORG |
| W03 | Workshop Detail (Public) | `/workshops/[workshopId]` | Web | PUBLIC, STUDENT, ORG |
| W04 | Payment Checkout | `/payments/checkout/[registrationId]` | Web | STUDENT |
| W05 | Payment Result | `/payments/result` | Web | STUDENT |
| W06 | My Registrations | `/me/registrations` | Web | STUDENT |
| W07 | Registration Detail | `/me/registrations/[registrationId]` | Web | STUDENT |
| W08 | My Tickets | `/me/tickets` | Web | STUDENT |
| W09 | Ticket QR Code | `/me/tickets/[ticketId]` | Web | STUDENT |
| W10 | My Payments | `/me/payments` | Web | STUDENT |
| W11 | Payment Transaction Detail | `/me/payments/[paymentId]` | Web | STUDENT |
| W12 | My Profile | `/me/profile` | Web | STUDENT |
| W13 | Admin Dashboard | `/admin` | Web | ORGANIZER |
| W14 | Workshop List (Admin) | `/admin/workshops` | Web | ORGANIZER |
| W15 | Create Workshop | `/admin/workshops/new` | Web | ORGANIZER |
| W16 | Workshop Detail (Admin) | `/admin/workshops/[workshopId]` | Web | ORGANIZER |
| W17 | Edit Workshop | `/admin/workshops/[workshopId]/edit` | Web | ORGANIZER |
| W18 | Workshop Statistics | `/admin/workshops/[workshopId]/stats` | Web | ORGANIZER |
| W19 | Document & AI Management | `/admin/workshops/[workshopId]/documents` | Web | ORGANIZER |
| W20 | Room Management | `/admin/rooms` | Web | ORGANIZER |
| W21 | Room Form (Create/Edit) | `/admin/rooms/new` · `/admin/rooms/[id]/edit` | Web | ORGANIZER |
| W22 | Speaker Management | `/admin/speakers` | Web | ORGANIZER |
| W23 | Speaker Form (Create/Edit) | `/admin/speakers/new` · `/admin/speakers/[id]/edit` | Web | ORGANIZER |
| W24 | User Management | `/admin/users` | Web | ORGANIZER |
| W25 | User Detail & Management | `/admin/users/[userId]` | Web | ORGANIZER |
| W26 | Staff Workshop Assignment | `/admin/users/[userId]/assign-workshops` | Web | ORGANIZER |
| W27 | Student Sync Jobs | `/admin/student-sync` | Web | ORGANIZER |
| W28 | Sync Job Detail & Errors | `/admin/student-sync/[jobId]` | Web | ORGANIZER |
| W29 | Notification Audit Log | `/admin/notifications/logs` | Web | ORGANIZER |
| W30 | Notification Channel Config | `/admin/notifications/channels` | Web | ORGANIZER |
| W31 | System Health Monitor | `/admin/system` | Web | ORGANIZER |
| M01 | Login (Mobile) | `LoginScreen` | Mobile | CHECKIN_STAFF |
| M02 | Assigned Workshops (Home) | `HomeScreen` | Mobile | CHECKIN_STAFF |
| M03 | Workshop Check-in Dashboard | `WorkshopDashboardScreen` | Mobile | CHECKIN_STAFF |
| M04 | QR Scanner | `QRScannerScreen` | Mobile | CHECKIN_STAFF |
| M05 | Check-in Scan Result | `CheckinResultScreen` | Mobile | CHECKIN_STAFF |
| M06 | Offline Queue Manager | `OfflineQueueScreen` | Mobile | CHECKIN_STAFF |
| M07 | Sync Progress & Report | `SyncProgressScreen` | Mobile | CHECKIN_STAFF |
| M08 | Profile & Settings (Mobile) | `ProfileScreen` | Mobile | CHECKIN_STAFF |

### Các quyết định phân loại quan trọng (Screen vs. Modal vs. State)

Những yếu tố sau được xử lý là **modal/UI state** (KHÔNG phải màn hình riêng):

- **Emergency Update** (đổi phòng/giờ) trên SCR-W16: là modal blocking nhưng chỉ có 3 field và single-step → UI state của SCR-W16
- **Confirm Cancel Workshop / Confirm Publish** trên SCR-W16: dialog Yes/No → UI state
- **Registration cho workshop miễn phí**: không tạo màn hình riêng — là action button trên SCR-W03, kết quả hiển thị qua toast thành công + redirect
- **AI Summary detail popup** trên SCR-W19: xem `summary_text` đầy đủ → expandable panel hoặc drawer, không phải màn hình
- **Scan loading** trên SCR-M04: UI state (spinner trong 200-500ms)
- **Delete confirmation** trên SCR-W19 (xóa tài liệu): simple Yes/No dialog → UI state
