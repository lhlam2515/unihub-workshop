# UniHub Workshop — Screen Model

> **Phạm vi:** Suy luận đầy đủ tập màn hình (Web + Mobile) từ user-flow đã phân tích, gắn chặt với `requirements.md`, `schema.sql`, `mobile-schema.sql`, và `api-design.md`.
> **Phương pháp:** Interaction-boundary reasoning theo `use-case-to-screen-analyzer` handbook — không 1:1 use-case ↔ screen, không nhầm UI state với screen, không nhầm component với screen.
> **Stack convention:** Next.js App Router (web) + Expo Router (mobile, file-based).

---

## Section 1 — Executive Screen Summary

```
Total inferred screens:           31
  ├─ Web (Sinh viên):              7
  ├─ Web (BTC Admin):             17
  └─ Mobile (Check-in Staff):      7

Use cases / user-flows covered:   11 (Flow 1–11 từ user-flow analysis)

Screen count rationale:
  - Mỗi screen có purpose, data scope, và navigation entry độc lập.
  - Không tách screen cho UI state (loading / empty / error / toast / confirm dialog).
  - Không tách screen cho mỗi tab nội bộ trừ khi tab đó có URL riêng và data scope thực sự khác.
  - Workshop admin được tách 4 sub-route (/[id], /registrations, /stats, /summary)
    vì 4 data scope hoàn toàn khác nhau, có thể link trực tiếp, có "Back" boundary rõ.
  - Scan + Result trên mobile gộp chung 1 screen — result là overlay state, không phải screen.
  - Payment chia 2 screen: /pay (initiate) vs /payment-result (poll status) vì /payment-result
    là return URL từ gateway, có entry point độc lập, hoàn toàn khác data scope.

Key assumptions (xem chi tiết trong Ambiguity Log):
  - Forgot-password / change-password flow: không có trong requirements → bỏ qua.
  - Self-registration cho sinh viên: không có (CSV import là source of truth, ADR-12).
  - Web cho check-in staff: không có (mobile-only, theo mobile-schema và JWT allowedWorkshopIds).
  - Web cho student là responsive web (PWA-compatible), không có app native riêng.
  - Sinh viên không có trang profile/settings riêng — quản lý cá nhân tối thiểu, đủ /me/registrations.
  - Một login screen riêng cho Admin (/admin/login) tách khỏi student (/login) — RBAC enforcement
    rõ ràng hơn ở route level và post-login redirect cleaner.
  - "Tab" trong workshop detail (admin) = sub-route, không phải client-side tab — hỗ trợ deep link.
```

---

## Section 2 — Screen Inventory

### A. Web — Sinh viên (Next.js App Router)

| ID | Route | File path | Purpose |
|---|---|---|---|
| SCR-W01 | `/login` | `app/(public)/login/page.tsx` | Đăng nhập sinh viên (accountType=student) |
| SCR-W02 | `/workshops` | `app/(public)/workshops/page.tsx` | Danh sách workshop công khai có filter |
| SCR-W03 | `/workshops/[id]` | `app/(public)/workshops/[id]/page.tsx` | Chi tiết workshop + AI summary + nút đăng ký |
| SCR-W04 | `/me/registrations` | `app/(student)/me/registrations/page.tsx` | Danh sách đăng ký của tôi |
| SCR-W05 | `/me/registrations/[id]` | `app/(student)/me/registrations/[id]/page.tsx` | Chi tiết đăng ký + QR code |
| SCR-W06 | `/me/registrations/[id]/pay` | `app/(student)/me/registrations/[id]/pay/page.tsx` | Khởi tạo thanh toán (paid workshop) |
| SCR-W07 | `/payment-result` | `app/(public)/payment-result/page.tsx` | Trang return từ gateway, poll trạng thái |

### B. Web — BTC Admin (Next.js App Router, prefix `/admin`)

| ID | Route | File path | Purpose |
|---|---|---|---|
| SCR-A01 | `/admin/login` | `app/(admin)/admin/login/page.tsx` | Đăng nhập BTC (accountType=staff) |
| SCR-A02 | `/admin` | `app/(admin)/admin/page.tsx` | Dashboard tổng quan (stats overview) |
| SCR-A03 | `/admin/workshops` | `app/(admin)/admin/workshops/page.tsx` | Danh sách workshop (mọi status) |
| SCR-A04 | `/admin/workshops/new` | `app/(admin)/admin/workshops/new/page.tsx` | Tạo workshop mới |
| SCR-A05 | `/admin/workshops/[id]` | `app/(admin)/admin/workshops/[id]/page.tsx` | Edit workshop info + cancel/publish actions |
| SCR-A06 | `/admin/workshops/[id]/registrations` | `app/(admin)/admin/workshops/[id]/registrations/page.tsx` | Danh sách sinh viên đã đăng ký workshop |
| SCR-A07 | `/admin/workshops/[id]/stats` | `app/(admin)/admin/workshops/[id]/stats/page.tsx` | Thống kê workshop (fill rate, check-in rate, doanh thu) |
| SCR-A08 | `/admin/workshops/[id]/summary` | `app/(admin)/admin/workshops/[id]/summary/page.tsx` | Quản lý AI Summary (upload PDF, retry, override) |
| SCR-A09 | `/admin/speakers` | `app/(admin)/admin/speakers/page.tsx` | Danh sách diễn giả |
| SCR-A10 | `/admin/speakers/new` | `app/(admin)/admin/speakers/new/page.tsx` | Tạo diễn giả mới |
| SCR-A11 | `/admin/speakers/[id]` | `app/(admin)/admin/speakers/[id]/page.tsx` | Edit diễn giả |
| SCR-A12 | `/admin/rooms` | `app/(admin)/admin/rooms/page.tsx` | Danh sách phòng |
| SCR-A13 | `/admin/rooms/[id]` | `app/(admin)/admin/rooms/[id]/page.tsx` | Edit phòng + lịch sử workshop dùng phòng |
| SCR-A14 | `/admin/imports` | `app/(admin)/admin/imports/page.tsx` | Lịch sử CSV import + manual trigger |
| SCR-A15 | `/admin/imports/[id]` | `app/(admin)/admin/imports/[id]/page.tsx` | Chi tiết import run + download error CSV |
| SCR-A16 | `/admin/notifications` | `app/(admin)/admin/notifications/page.tsx` | Cấu hình kênh + audit log notification |
| SCR-A17 | `/admin/system` | `app/(admin)/admin/system/page.tsx` | Operations: Circuit Breaker monitor + Payment Reconciliation trigger |

### C. Mobile — Check-in Staff (Expo Router)

| ID | Route | File path | Purpose |
|---|---|---|---|
| SCR-M01 | `/login` | `app/(auth)/login.tsx` | Đăng nhập staff |
| SCR-M02 | `/` | `app/(app)/index.tsx` | Danh sách workshop được phân công (allowedWorkshopIds) |
| SCR-M03 | `/workshops/[id]` | `app/(app)/workshops/[id]/index.tsx` | Workshop dashboard: cache status + scan/history actions |
| SCR-M04 | `/workshops/[id]/scan` | `app/(app)/workshops/[id]/scan.tsx` | QR scanner (online + offline modes) |
| SCR-M05 | `/workshops/[id]/history` | `app/(app)/workshops/[id]/history.tsx` | Lịch sử check-in cục bộ của workshop |
| SCR-M06 | `/sync` | `app/(app)/sync.tsx` | Sync queue toàn cục (mọi workshop) |
| SCR-M07 | `/settings` | `app/(app)/settings.tsx` | Profile + logout + app info |

---

### Justification — Interaction Boundary cho từng screen

> Mỗi screen được khẳng định bằng **interaction boundary** — nơi user goal, data scope, hoặc navigation entry thực sự đổi. Đoạn dưới đây trả lời câu hỏi: tại sao IS a screen, KHÔNG phải state hay component.

**SCR-W01 `/login`** — *List → Auth → Detail* boundary; route entry độc lập (anonymous truy cập trực tiếp); data scope (credentials) khác với mọi screen authenticated; đăng nhập là một use case hoàn chỉnh. Không phải modal vì có URL riêng và có thể được link trực tiếp khi token hết hạn.

**SCR-W02 `/workshops`** — Browse boundary; data scope = collection của workshops (cache key Redis riêng theo query hash, ADR-13); là endpoint chịu tải lớn nhất trong spike; deep-link được. Filter bar / sort selector là **components** trong screen này, không phải sub-screen.

**SCR-W03 `/workshops/[id]`** — *List → Detail* boundary kinh điển; data scope hẹp lại 1 workshop kèm AI summary, sơ đồ phòng, bio diễn giả; cache key Redis riêng (`workshop:{id}`). AI summary là **section** trong screen này (data đến cùng response 2.2), không phải screen riêng.

**SCR-W04 `/me/registrations`** — Browse boundary nhưng **scope đổi từ public → personal** (RBAC method-level: WHERE student_id = JWT.sub); data scope hoàn toàn khác /workshops; có thể link trực tiếp từ email thông báo.

**SCR-W05 `/me/registrations/[id]`** — *List → Detail* + sở hữu QR (asset trọng yếu cho check-in); cần authorize ownership; QR là dữ liệu read-only độc lập, không thuộc /workshops/[id]. Đây cũng là deep-link đích cho email xác nhận.

**SCR-W06 `/me/registrations/[id]/pay`** — *Browse → Transaction* boundary (Principle 3 - Context Switch điển hình); data scope mới = chọn gateway + xác nhận amount; có business rule riêng (CB OPEN check, idempotency key sinh ở đây). Không gộp vào /workshops/[id] vì paid flow yêu cầu registration đã tạo trước (nextStep từ POST /registrations) — registration_id phải có trong path.

**SCR-W07 `/payment-result`** — Là **return URL** từ payment gateway (xem `returnUrl` trong POST /payments body); entry độc lập từ external; data scope = trạng thái 1 payment, polling endpoint. Bắt buộc tách khỏi /pay vì gateway redirect không thể trả về cùng path đã POST. KHÔNG phải UI state của /pay vì user có thể tab quay lại sau (web tab/email link).

**SCR-A01 `/admin/login`** — Tách khỏi /login (SCR-W01) vì: (1) post-login redirect khác (/admin vs /workshops), (2) accountType=staff fixed, (3) RBAC route prefix `/admin` enforce ngay từ middleware, (4) admin có thể thêm 2FA sau (Stage 5). Đây là 2 screen khác nhau, không phải 1 screen với conditional render — Principle 3 (URL riêng = screen riêng).

**SCR-A02 `/admin`** — Dashboard boundary (tổng quan); data scope = aggregate stats từ `/admin/stats/overview`; không trùng /admin/workshops (list các workshop) cũng không trùng /admin/stats (drill-down report).

**SCR-A03 `/admin/workshops`** — Admin browse boundary; khác SCR-W02 vì data scope mở rộng (status IN DRAFT, OPEN, CLOSED, CANCELLED — public chỉ thấy 'OPEN'); thao tác bulk khác (publish/cancel buttons).

**SCR-A04 `/admin/workshops/new`** — *List → Create* boundary; form với data scope rỗng (initial state); không trùng /admin/workshops/[id] vì semantic POST khác PATCH (HTTP method hint), không có version để optimistic-lock, không có "cancel/publish" action. Các BA đôi khi gộp với edit (single-form) — ở đây tách vì xét theo interaction purpose: tạo mới và sửa là hai goal khác.

**SCR-A05 `/admin/workshops/[id]`** — Edit form với OL (If-Match header). Hub của workshop admin — link đến 3 sub-route. Không trùng SCR-A04 vì có version, có actions (publish, cancel) chỉ áp dụng cho existing workshop.

**SCR-A06 `/admin/workshops/[id]/registrations`** — Sub-screen của workshop, nhưng data scope **hoàn toàn khác** (registrations table, không phải workshops table); có thể export CSV; có thể là entry direct từ email/notification "X người đã đăng ký workshop của bạn"; có deep-link riêng.

**SCR-A07 `/admin/workshops/[id]/stats`** — Aggregate metrics (fill rate, check-in rate, revenue); data scope khác /registrations (counts, không phải records); endpoint khác (`/admin/workshops/{id}/stats` vs `/admin/workshops/{id}/registrations`); có thể cache 5 phút (`api-design.md` §10).

**SCR-A08 `/admin/workshops/[id]/summary`** — Workflow độc lập: upload PDF → queue → poll status → override. Data scope = `summary_*` fields; có 5 trạng thái (none/QUEUED/PROCESSING/done/failed); là async workflow blocking với multi-step nature. Không phải state của /admin/workshops/[id] vì có upload action + retry action + override action — 3 use case riêng.

**SCR-A09–A11 `/admin/speakers/*`** — Master data CRUD. List vs Create vs Edit theo Principle 3 (mỗi URL = mỗi screen). Có thể merge new + [id] thành single form-screen với mode prop, nhưng tách rõ hơn cho SRS traceability.

**SCR-A12–A13 `/admin/rooms/*`** — Tương tự speakers. Note: list không tách /new vì rooms ít hơn (mỗi room phải có floor_plan upload — UX phức tạp hơn, để ở edit screen). /admin/rooms/[id] hỗ trợ cả create (id='new') và edit. *Đây là exception duy nhất khỏi pattern speakers — flag trong Ambiguity Log.*

**SCR-A14 `/admin/imports`** — Cron history list + trigger button. Trigger là action (modal), không phải screen.

**SCR-A15 `/admin/imports/[id]`** — Chi tiết import run + download error CSV. Data scope khác /admin/imports (1 row vs collection); có action download là response stream — không tạo screen mới.

**SCR-A16 `/admin/notifications`** — Gộp 2 use case của module Notification Channels (`api-design.md` §11): config channels + xem failed logs. Hai phần này có data scope khác nhau nhưng cùng workflow (debug notification system), tab nội bộ là hợp lý — KHÔNG tách thành 2 screen vì over-fragmentation. Tab = component trong screen này.

**SCR-A17 `/admin/system`** — Operations dashboard: gộp Circuit Breaker monitor + Payment Reconciliation trigger. Cả hai cùng "operational concerns" cho BTC trong sự kiện. Tách screen riêng cho mỗi tool sẽ over-fragment vì BTC ít khi vào — gộp thành 1 ops screen với 2 panel.

**SCR-M01 `/login` (mobile)** — Auth screen; entry duy nhất vào app khi chưa có session.

**SCR-M02 `/` (mobile home)** — Workshop selection list; data scope = `JWT.allowedWorkshopIds`; là entry point sau login; mỗi workshop hiển thị cache status (synced / stale / never).

**SCR-M03 `/workshops/[id]` (mobile)** — Workshop "lobby" trước scan. Data scope = cache_metadata + checkin_queue counts; có actions: "Pre-load now", "Open Scanner", "View History". KHÔNG gộp với scan vì scanner cần camera permission + full screen viewfinder — interaction context hoàn toàn khác.

**SCR-M04 `/workshops/[id]/scan` (mobile)** — Camera + QR detection + result overlay. Result feedback (✅/⚠️/❌) là **UI state overlay** trên screen này, không phải screen riêng — user có thể dismiss và scan tiếp ngay. Online/offline switch là banner state, cùng screen.

**SCR-M05 `/workshops/[id]/history` (mobile)** — Local check-in history cho 1 workshop; data từ `checkin_queue` filtered by workshop_id; có thể tap row → re-sync individual.

**SCR-M06 `/sync` (mobile)** — Global sync queue cho mọi workshop; data scope = checkin_queue + sync_log; actions: "Sync now", "Retry failed". Khác SCR-M05 (per-workshop) vì scope toàn cục, có sync_log audit.

**SCR-M07 `/settings` (mobile)** — Logout + app info + device_id display + last sync time global. Profile gọn nhẹ vì single-user app.

---

## Section 3 — Screen Specifications (chi tiết)

> Mỗi screen liệt kê: read-only data, inputs, primary actions (kèm API endpoint), secondary actions, business rules, validation rules, navigation, UI states, components.

### A. WEB — SINH VIÊN

---

#### SCR-W01 — `/login` (Sinh viên)

**Purpose:** Sinh viên đăng nhập bằng MSSV + password.

**Read-only:** Logo trường, link "Quên mật khẩu" (placeholder Stage 5).

**Inputs:**

- `studentId` — text, format MSSV (regex `^\d{8}$`), required
- `password` — password, min 8 chars, required

**Primary actions:**

- `[Đăng nhập]` → `POST /api/v1/auth/login` body `{accountType:"student", studentId, password}` → set `accessToken` (memory) + cookie `refresh_token` HttpOnly → navigate `/workshops`

**Secondary actions:**

- `[Đăng nhập với tài khoản BTC]` → navigate `/admin/login`

**Business rules:**

- BR-W01.1 Student không tồn tại trong `students` table → 401 generic message (không leak existence)
- BR-W01.2 Account disabled → 403 với message thân thiện

**Validation rules:**

- VR-W01.1 MSSV phải đúng 8 chữ số
- VR-W01.2 Hiển thị inline error sau blur

**Navigation IN:** `/`, `/workshops` (khi yêu cầu auth), `/admin/login` (toggle)
**Navigation OUT:** Success → `/workshops`. Cancel → `/`

**Components:**

- `<LoginForm />` (form layout)
- `<TextField />` (MSSV + password, từ shadcn/ui)
- `<Button variant="primary" />`
- `<ErrorBanner />` (inline 4xx error)

**Related UI states:**

- Loading: button spinner; form disabled
- Error: inline banner cho 401/403/429
- Rate limit (429): banner với `Retry-After`

**API endpoints:** `POST /api/v1/auth/login`

---

#### SCR-W02 — `/workshops` (Danh sách workshop)

**Purpose:** Sinh viên duyệt và lọc danh sách workshop trong tuần lễ.

**Read-only:** Mỗi card workshop hiển thị:

- `title`, `startsAt`, `endsAt`, `room.name`, `room.building`
- `speaker.fullName`, `speaker.avatarUrl`
- `seatsAvailable / seatsTotal`
- `price` (0 = "Miễn phí")
- `isRegistered` flag (nếu đã login)

**Inputs (filter components):**

- `day` — date picker (lọc trong khoảng tuần lễ)
- `topic` — select multi (Stage 5 nếu có tagging)
- `hasSeats` — toggle "Chỉ hiển thị còn chỗ"
- `sort` — select (`startsAt`, `-startsAt`, `seatsAvailable`)
- `search` — text (debounced 300ms)

**Primary actions:**

- Click card → navigate `/workshops/[id]`
- `[Đăng ký]` button trên card (shortcut, nếu `isRegistered=false && seatsAvailable>0`) → mở `<RegisterConfirmDialog />` (UI state) → POST tới registration

**Secondary actions:**

- Pagination "Tải thêm" (cursor-based)

**Business rules:**

- BR-W02.1 `seatsAvailable` đến từ Redis cache TTL 10s — chấp nhận trễ tối đa 10s (ADR-13)
- BR-W02.2 Card workshop hết chỗ vẫn hiển thị nhưng disabled nút đăng ký
- BR-W02.3 Workshop đã `cancelled` ẩn khỏi list mặc định (status filter mặc định `open`)

**Validation rules:**

- VR-W02.1 `day` phải nằm trong tuần lễ sự kiện
- VR-W02.2 Filter combination không hợp lệ → empty state thay vì error

**Navigation IN:** `/login` (post-login), `/`, header logo
**Navigation OUT:** Card click → `/workshops/[id]`. Header "Của tôi" → `/me/registrations`

**Components:**

- `<WorkshopCard />` (re-usable cho list view)
- `<FilterBar />` (composite: DatePicker + Select + Toggle + SearchInput)
- `<Pagination cursor />`
- `<EmptyState />` (component, UI state)
- `<SkeletonCard />` (loading state)

**Related UI states:**

- Initial load skeleton
- Empty (no match)
- Network error (retry button)
- Stale cache banner (nếu detect cache > 10s và Redis down)

**API endpoints:**

- `GET /api/v1/workshops?status=open&day=&hasSeats=&cursor=&limit=20&sort=` (T1 RL: 60/60s)
- (Optional, periodic) `GET /api/v1/workshops/{id}/availability` cho card đang hiển thị (Stage 5 polling)

---

#### SCR-W03 — `/workshops/[id]` (Chi tiết workshop)

**Purpose:** Sinh viên xem đầy đủ thông tin workshop và quyết định đăng ký.

**Read-only:**

- Title, full description
- `speaker`: avatar, fullName, title, bio (full)
- `room`: name, building, floor, `floorPlanUrl` (hiển thị ảnh sơ đồ), facilities
- `startsAt`, `endsAt`, duration
- `seatsTotal`, `seatsAvailable` (poll TTL 10s)
- `price` + `currency`
- `summary`: `status` + `text` (nếu `status='DONE'`); placeholder "Đang xử lý" nếu QUEUED/PROCESSING; ẩn nếu `none`/`failed`
- `isRegistered`: nếu true → hiển thị link "Xem QR của tôi" thay vì nút đăng ký
- `myRegistrationId` (nếu có)

**Inputs:** Không có form input — chỉ action button.

**Primary actions:**

- `[Đăng ký]` (chỉ hiện khi `seatsAvailable > 0 && !isRegistered && status='OPEN'`)
  - Sinh `Idempotency-Key = crypto.randomUUID()` ở client
  - `POST /api/v1/registrations` header `Idempotency-Key`, body `{workshopId}`
  - Nếu `nextStep.action === null` (free workshop) → toast success → redirect `/me/registrations/{id}`
  - Nếu `nextStep.action === 'create_payment'` (paid) → redirect `/me/registrations/{id}/pay`
- `[Xem QR]` (nếu đã đăng ký) → navigate `/me/registrations/{myRegistrationId}`

**Secondary actions:**

- `[Quay lại]` → `/workshops`
- Share link (copy URL, không phải screen)

**Business rules:**

- BR-W03.1 Pre-check `seatsAvailable` ở client để fail-fast UX, nhưng server vẫn là source of truth (race với cache TTL 10s)
- BR-W03.2 Idempotency-Key sinh **trước** khi mở dialog confirm — re-click không sinh key mới
- BR-W03.3 Nếu workshop bị `cancelled` ngay khi đang xem → poll detect → banner "Workshop đã bị hủy"
- BR-W03.4 Workshop `status='DRAFT'` không truy cập được public → 404

**Validation rules:**

- VR-W03.1 Thời gian bắt đầu workshop chưa qua mới cho đăng ký
- VR-W03.2 Sinh viên không thuộc CSV → 422 `registration.student_not_in_csv` (ADR-12 known 24h gap) → banner thân thiện

**Navigation IN:** `/workshops` (card click), email/notification link
**Navigation OUT:**

- `[Đăng ký]` free → `/me/registrations/{id}`
- `[Đăng ký]` paid → `/me/registrations/{id}/pay`
- `[Xem QR]` → `/me/registrations/{myRegistrationId}`
- `[Quay lại]` → `/workshops`

**Components:**

- `<WorkshopHero />` (title, schedule)
- `<SpeakerCard />` (avatar + bio)
- `<RoomMap />` (image của floor_plan_url + facilities)
- `<SeatsBadge />` (real-time, có polling hook)
- `<AISummaryPanel />` (handle 5 trạng thái summary)
- `<RegisterConfirmDialog />` (modal — UI state, không screen)
- `<ErrorBanner />` (cho 422/503/429)

**Related UI states:**

- CB OPEN (nếu paid) → button disabled + banner "Cổng thanh toán tạm thời gặp sự cố, vui lòng thử lại sau"
- 429 rate limit → cooldown countdown
- Empty seats → button "Hết chỗ" disabled
- Summary processing → skeleton trong AISummaryPanel
- Workshop cancelled → toàn screen bị mờ + overlay "Workshop đã hủy"

**API endpoints:**

- `GET /api/v1/workshops/{id}` (initial, cache 10s)
- `GET /api/v1/workshops/{id}/availability` (polling 10s khi user idle ở screen — chỉ trong 5 phút trước `startsAt`)
- `POST /api/v1/registrations` (header `Idempotency-Key`, body `{workshopId}`)

---

#### SCR-W04 — `/me/registrations` (Danh sách đăng ký của tôi)

**Purpose:** Sinh viên xem lại các workshop đã đăng ký và truy cập QR.

**Read-only:** Mỗi item:

- Workshop title, `startsAt`, `endsAt`, `room.name`
- `status` (`pending` / `confirmed` / `paid` / `cancelled`) — badge màu
- Workshop status (active / cancelled)
- Có QR hay không (true nếu status ∈ {confirmed, paid})

**Inputs (filter):**

- `status` filter (chips: All / Sắp tới / Đã hủy / Chờ thanh toán)
- `upcoming` toggle

**Primary actions:**

- Click item → navigate `/me/registrations/{id}`
- `[Hủy đăng ký]` (chỉ status=`pending`/`confirmed`/`paid` và workshop chưa diễn ra) → `<CancelConfirmDialog />` → `DELETE /api/v1/registrations/{id}` → refetch list

**Secondary actions:**

- `[Hoàn tất thanh toán]` (chỉ status=`pending`) → navigate `/me/registrations/{id}/pay`

**Business rules:**

- BR-W04.1 Method-level RBAC: chỉ trả `WHERE student_id = JWT.sub` (server-enforced)
- BR-W04.2 Cancel paid registration → server enqueue refund job (BullMQ) — UI hiển thị "Đang xử lý hoàn tiền"
- BR-W04.3 Status `pending` quá 30 phút → polling detect → server tự cancel (timeout job), UI auto refetch

**Validation rules:**

- VR-W04.1 Cancel chỉ khi `now < workshop.startsAt - N hours` (N từ specs/registration-paid.md)

**Navigation IN:** Header menu "Của tôi", post-registration redirect, email link
**Navigation OUT:** Item click → detail; "Hoàn tất thanh toán" → /pay

**Components:**

- `<RegistrationCard />` (status badge + actions)
- `<StatusFilterChips />`
- `<CancelConfirmDialog />` (modal, UI state)
- `<EmptyState />` (chưa đăng ký workshop nào → CTA "Khám phá workshop" → /workshops)

**Related UI states:**

- Loading skeleton
- Empty (no registrations)
- Refund pending (sau cancel paid)

**API endpoints:**

- `GET /api/v1/registrations?status=&upcoming=` (T2 RL)
- `DELETE /api/v1/registrations/{id}` (T2 RL)

---

#### SCR-W05 — `/me/registrations/[id]` (Chi tiết đăng ký + QR)

**Purpose:** Sinh viên hiển thị mã QR cho check-in.

**Read-only:**

- Workshop title, schedule, room, speaker (snapshot tại thời điểm đăng ký, hoặc luôn fresh từ workshop hiện tại — flag trong ambiguity)
- `status` badge
- `qrCode` (chỉ khi status ∈ {confirmed, paid}) — render thành QR image SVG
- `registeredAt`, `payment` info nếu có
- "Hướng dẫn check-in": "Hiển thị mã QR cho nhân sự tại cửa phòng"

**Inputs:** Không có.

**Primary actions:**

- `[Hủy đăng ký]` (nếu eligible, giống SCR-W04)
- `[Hoàn tất thanh toán]` (nếu pending) → /pay
- `[Tải QR về máy]` (download SVG/PNG, không phải API call)

**Secondary actions:**

- `[Quay lại]` → `/me/registrations`
- Share calendar (.ics download)

**Business rules:**

- BR-W05.1 Method-level RBAC: 404 nếu không sở hữu (anti-enumeration; **không** 403)
- BR-W05.2 QR là `qr_code` từ `registrations.qr_code` (UUID v4) — không base64-encoded student_id
- BR-W05.3 Workshop bị cancel → ẩn QR + banner "Workshop đã bị hủy"

**Validation rules:** N/A

**Navigation IN:** `/me/registrations` item click, post-registration redirect, email link
**Navigation OUT:** Cancel → confirm dialog; Back → list; Pay → /pay

**Components:**

- `<QRCodeDisplay />` (large, high-contrast)
- `<RegistrationStatusBadge />`
- `<WorkshopMiniCard />`
- `<PaymentReceiptCard />` (nếu paid, từ `payment.receiptId`)
- `<AddToCalendarButton />` (.ics generation)

**Related UI states:**

- Loading
- 404 (không sở hữu hoặc không tồn tại)
- Workshop cancelled overlay

**API endpoints:**

- `GET /api/v1/registrations/{id}` (kèm payment info nếu có)
- `GET /api/v1/payments/{paymentId}` (nếu paid, để hiển thị receipt) — có thể server lồng vào registration response để giảm round-trip

---

#### SCR-W06 — `/me/registrations/[id]/pay` (Khởi tạo thanh toán)

**Purpose:** Chọn cổng thanh toán và khởi tạo giao dịch cho registration đang `pending`.

**Read-only:**

- Workshop title, schedule
- Amount + currency
- "Đăng ký sẽ tự hủy sau X phút nếu không thanh toán" (countdown từ `registeredAt + 30 phút`)
- Trạng thái Circuit Breaker hiện tại (nếu OPEN → cảnh báo, disable button)

**Inputs:**

- `gateway` — radio group (`VNPAY`, `STRIPE`, `MOMO`, `MOCK`) — `MOCK` chỉ trong dev/seed

**Primary actions:**

- `[Thanh toán]`
  - Sinh `Idempotency-Key = crypto.randomUUID()` (lưu vào sessionStorage cùng key `registrationId`)
  - `POST /api/v1/payments` header `Idempotency-Key`, body `{registrationId, gateway, returnUrl: window.location.origin + '/payment-result'}`
  - Server response:
    - 200 succeeded (sync MOCK) → redirect `/payment-result?paymentId=...&status=succeeded`
    - 302/redirect URL từ gateway → external redirect (browser tự follow)
    - 504 PAYMENT_TIMEOUT → giữ key trong sessionStorage, navigate `/payment-result?paymentId=...&status=unresolved&idempotencyKey=...`
    - 503 PAYMENT_GATEWAY_OPEN → banner + button disabled

**Secondary actions:**

- `[Hủy đăng ký]` → DELETE registration

**Business rules:**

- BR-W06.1 **Idempotency-Key sinh ở client trước request đầu tiên** (ADR-08, ADR-15) — KHÔNG sinh lại khi retry
- BR-W06.2 Nếu sessionStorage đã có key cho registrationId này → reuse nguyên key (browser refresh trong khi đang chờ gateway)
- BR-W06.3 Idempotency-Key TTL 24h (server-side); client phải clear sau khi `succeeded` confirm
- BR-W06.4 CB OPEN → page hiển thị, nhưng `[Thanh toán]` disabled + banner — listing workshop khác vẫn hoạt động (graceful degradation, đúng với requirement)
- BR-W06.5 Registration phải ở status `pending` mới vào được; nếu đã `paid`/`cancelled` → redirect tương ứng

**Validation rules:**

- VR-W06.1 `gateway` phải được chọn trước khi click "Thanh toán"
- VR-W06.2 Server check Method-level: registrationId thuộc về JWT.sub

**Navigation IN:** Post-registration redirect (paid), `/me/registrations/{id}` → "Hoàn tất thanh toán", `/me/registrations` → "Hoàn tất thanh toán"
**Navigation OUT:**

- Success sync → `/payment-result`
- Gateway redirect → external (gateway page) → quay lại `/payment-result`
- Cancel → `/me/registrations`

**Components:**

- `<PaymentSummary />` (workshop + amount + countdown)
- `<GatewaySelector />` (radio group)
- `<CircuitBreakerWarning />` (banner conditional)
- `<PayButton />` (disabled state when CB OPEN hoặc validation fail)
- `<CountdownTimer />` (auto-cancel countdown)

**Related UI states:**

- CB OPEN: button disabled + warning
- Loading: button spinner sau khi POST (chờ redirect / sync response)
- 504 timeout: redirect tự động đến result với pending state
- 402 declined: banner inline + cho phép retry
- Registration đã `paid` (race với refresh) → redirect /me/registrations/{id}
- Registration đã `cancelled` → redirect với banner

**API endpoints:**

- `GET /api/v1/registrations/{id}` (load summary)
- `GET /api/v1/admin/system/circuit-breaker` — *KHÔNG, đây là admin-only*. Thay vào đó, server returns 503 PAYMENT_GATEWAY_OPEN khi POST → client biết qua error code, không cần endpoint riêng cho student.
- `POST /api/v1/payments` (header `Idempotency-Key`)
- `DELETE /api/v1/registrations/{id}` (cancel option)

---

#### SCR-W07 — `/payment-result` (Kết quả thanh toán)

**Purpose:** Polling trạng thái payment sau khi user quay từ gateway.

**Query params:** `?paymentId=<uuid>` (bắt buộc); optional `?status=` hint từ server.

**Read-only:**

- Spinner + "Đang xác nhận thanh toán..." khi `status=initiated`
- Workshop summary (title, room, schedule)
- Final state UI:
  - **Succeeded**: ✅ + receiptId + nút "Xem QR" → `/me/registrations/{id}`
  - **Failed**: ❌ + reason + nút "Thử lại" → quay về `/me/registrations/{id}/pay`
  - **Unresolved (504)**: ⏳ + "Chúng tôi đang kiểm tra với cổng thanh toán. Bạn sẽ nhận thông báo trong vòng 5 phút." + nút "Kiểm tra lại"

**Inputs:** Không có.

**Primary actions:**

- `[Xem QR]` (nếu succeeded) → `/me/registrations/{registrationId}`
- `[Thử lại]` (nếu failed) → `/me/registrations/{registrationId}/pay` — **dùng lại idempotency key cũ** từ sessionStorage nếu là cùng registration (server detect `unresolved` → forward gateway, `completed-failed` → trả lại response cũ)
- `[Kiểm tra lại]` (nếu unresolved) → `GET /api/v1/payments/{id}` polling tay

**Secondary actions:**

- `[Quay về danh sách]` → `/me/registrations`

**Business rules:**

- BR-W07.1 Polling interval 2s, max 30s. Sau 30s nếu vẫn `initiated` → degrade thành "unresolved" UI + dừng poll
- BR-W07.2 Nếu sau 5 phút mà vẫn `unresolved` → reconciliation job (background) sẽ resolve; user nhận notification
- BR-W07.3 Idempotency key trong sessionStorage chỉ clear sau khi `succeeded` confirm
- BR-W07.4 RBAC: payment thuộc registration thuộc JWT.sub (404 nếu không)

**Validation rules:**

- VR-W07.1 `paymentId` query param bắt buộc; thiếu → redirect `/me/registrations`

**Navigation IN:** Gateway redirect (returnUrl), POST /payments sync response, manual deep-link
**Navigation OUT:**

- Success → `/me/registrations/{regId}`
- Retry → `/me/registrations/{regId}/pay`
- Quit → `/me/registrations`

**Components:**

- `<PaymentStatusIcon />` (spinner / check / X / hourglass)
- `<PaymentSummary />`
- `<PollingHook />` (logic, không UI)
- `<ActionFooter />` (CTA buttons theo state)

**Related UI states:**

- Initiated (polling)
- Succeeded
- Failed (declined, network error)
- Unresolved (504 timeout)
- Timeout polling (>30s) → upgrade thành unresolved UI

**API endpoints:**

- `GET /api/v1/payments/{id}` (polling 2s, max 15 lần)

---

### B. WEB — BTC ADMIN

---

#### SCR-A01 — `/admin/login` (BTC Login)

**Purpose:** Đăng nhập BTC bằng email + password.

**Inputs:** `email` (email format), `password`.

**Primary actions:**

- `[Đăng nhập]` → `POST /api/v1/auth/login` body `{accountType:"staff", email, password}` → check `role` trong response:
  - `role=btc` → `/admin`
  - `role=checkin_staff` → reject với message "Vui lòng dùng mobile app" (web không phục vụ checkin_staff)

**Business rules:**

- BR-A01.1 Web admin **chỉ chấp nhận role=btc** — `checkin_staff` đăng nhập web → 403 với hướng dẫn dùng mobile
- BR-A01.2 Refresh token transport = HttpOnly cookie (web)
- BR-A01.3 (Stage 5) MFA enforcement cho btc

**Components:** Tương tự SCR-W01 nhưng `email` thay vì `studentId`. Sử dụng cùng `<LoginForm variant="staff" />`.

**API endpoints:** `POST /api/v1/auth/login`

---

#### SCR-A02 — `/admin` (Dashboard tổng quan)

**Purpose:** BTC vào nhanh thấy tình trạng tổng quan sự kiện.

**Read-only:**

- Tổng số workshops (theo status: draft/open/closed/cancelled)
- Tổng đăng ký toàn sự kiện
- Fill rate trung bình
- Top 5 workshop có fill rate cao nhất + low nhất
- Check-in rate aggregate
- Doanh thu paid workshops
- Quick links: imports gần nhất status, CB state hiện tại

**Inputs (filter):**

- `from`, `to` date range (default: hôm nay)

**Primary actions:**

- Click workshop card → `/admin/workshops/{id}`
- Click "Import logs" → `/admin/imports`
- Click CB indicator (nếu OPEN) → `/admin/system`

**Business rules:**

- BR-A02.1 Stats heavy-cached 5 phút (`api-design.md` §10) — không real-time, có note "Cập nhật lúc HH:MM"

**Components:**

- `<MetricTile />` (KPI cards)
- `<TopWorkshopsTable />`
- `<StatusBreakdownChart />` (pie / bar)
- `<DateRangePicker />`
- `<CBStatusIndicator />` (small badge top-right)

**API endpoints:**

- `GET /api/v1/admin/stats/overview`
- `GET /api/v1/admin/system/circuit-breaker` (cho indicator)

---

#### SCR-A03 — `/admin/workshops` (Workshops list)

**Purpose:** BTC duyệt và quản lý toàn bộ workshop.

**Read-only:** Bảng với columns: title, speaker, room, startsAt, status, seats progress (used/total), price, lastUpdatedAt.

**Inputs (filter):**

- `status` (multi-select: draft, open, closed, cancelled — default: all)
- `day` (date filter)
- `search` (title)
- Sort: startsAt, status, fill rate

**Primary actions:**

- `[+ Tạo workshop]` → `/admin/workshops/new`
- Row click → `/admin/workshops/{id}`
- Bulk action `[Publish selected]` → batch POST publish

**Business rules:**

- BR-A03.1 Hiển thị mọi status (khác SCR-W02 chỉ open)
- BR-A03.2 Action `Publish` chỉ visible cho rows status=draft
- BR-A03.3 Action `Cancel` chỉ visible cho rows status=open/closed

**Components:**

- `<WorkshopAdminTable />` (sortable columns, row checkbox)
- `<StatusFilter />` (multi-select chips)
- `<BulkActionBar />` (xuất hiện khi có row selected)
- `<CreateWorkshopButton />`

**API endpoints:**

- `GET /api/v1/admin/workshops?status=&day=&search=&cursor=&limit=`
- `POST /api/v1/admin/workshops/{id}/publish` (bulk → loop)
- `POST /api/v1/admin/workshops/{id}/cancel` (bulk → loop)

---

#### SCR-A04 — `/admin/workshops/new` (Create Workshop)

**Purpose:** Tạo workshop mới (mặc định status=`draft`).

**Inputs:**

- `title` — text required, max 200
- `description` — rich text or markdown
- `speakerId` — autocomplete select từ `/admin/speakers` (optional ở draft)
- `roomId` — select từ `/admin/rooms` (optional ở draft, required nếu publish luôn)
- `startsAt`, `endsAt` — datetime picker (ends > starts)
- `seatsTotal` — number (>0)
- `price` — number (>=0; 0 = free)
- `status` — radio: `draft` (default) | `open` (publish luôn)

**Primary actions:**

- `[Lưu draft]` → `POST /api/v1/admin/workshops` body với `status=draft` → success → redirect `/admin/workshops/{id}`
- `[Lưu & publish]` → `POST /api/v1/admin/workshops` body với `status=open` → server validate room/speaker non-null + room không xung đột

**Business rules:**

- BR-A04.1 Conflict detection cho phòng (custom check server-side, không phải DB CHECK)
- BR-A04.2 Validation `endsAt > startsAt` (DB CHECK + client)
- BR-A04.3 `seatsAvailable = seatsTotal` auto khởi tạo

**Components:**

- `<WorkshopForm mode="create" />`
- `<SpeakerAutocomplete />`
- `<RoomSelectWithConflictCheck />` (kiểm tra real-time khi user chọn dates)
- `<PriceInput currency="VND" />`
- `<DateTimeRangePicker />`

**API endpoints:**

- `POST /api/v1/admin/workshops`
- `GET /api/v1/admin/speakers` (cho autocomplete)
- `GET /api/v1/admin/rooms` (cho select)

---

#### SCR-A05 — `/admin/workshops/[id]` (Workshop detail/edit)

**Purpose:** Edit workshop info; entry hub đến 3 sub-screen.

**Read-only:** Header chứa current status badge, version hiện tại, lastUpdatedAt, nút sub-route navigation.

**Inputs:** Tương tự SCR-A04 (form fields editable).

**Primary actions:**

- `[Lưu thay đổi]` → `PATCH /api/v1/admin/workshops/{id}` header `If-Match: "{version}"`
- `[Publish]` (nếu draft) → `POST /api/v1/admin/workshops/{id}/publish`
- `[Hủy workshop]` (nếu open/closed) → `<CancelDialog />` modal với input `reason` + `notifyRegistered=true` → `POST /api/v1/admin/workshops/{id}/cancel`

**Sub-route navigation (visible tabs nhưng là deep-link sub-screens):**

- "Đăng ký" → `/admin/workshops/{id}/registrations` (SCR-A06)
- "Thống kê" → `/admin/workshops/{id}/stats` (SCR-A07)
- "AI Summary" → `/admin/workshops/{id}/summary` (SCR-A08)

**Business rules:**

- BR-A05.1 Optimistic Locking: GET trả ETag = version; PATCH gửi If-Match. 412 → reload + show diff dialog
- BR-A05.2 Đổi `roomId` hoặc `startsAt`/`endsAt` → server enqueue notification "workshop changed" cho mọi active registration
- BR-A05.3 Đổi `seatsTotal` < (seatsTotal - seatsAvailable) → 422 (không thể giảm dưới số đã đăng ký)
- BR-A05.4 Cancel → server batch update registrations status=cancelled + enqueue refunds + notify

**Validation rules:**

- VR-A05.1 412 Precondition Failed → "Đã có người sửa workshop này. Reload?" dialog với diff view
- VR-A05.2 Reason cancel required (min 10 chars)

**Components:**

- `<WorkshopForm mode="edit" version={version} />`
- `<TabNav />` (links đến sub-routes — KHÔNG client-side state)
- `<PublishButton />` (conditional)
- `<CancelDialog />` (modal — UI state)
- `<ConflictResolutionDialog />` (412 modal)
- `<VersionBadge />`

**API endpoints:**

- `GET /api/v1/admin/workshops/{id}` (kèm ETag)
- `PATCH /api/v1/admin/workshops/{id}` (If-Match)
- `POST /api/v1/admin/workshops/{id}/publish`
- `POST /api/v1/admin/workshops/{id}/cancel`

---

#### SCR-A06 — `/admin/workshops/[id]/registrations` (Workshop registrations)

**Purpose:** BTC xem ai đã đăng ký workshop, export CSV.

**Read-only:** Bảng: studentCode, fullName, email, status, registeredAt, paymentStatus (nếu paid workshop), checkedInAt (nếu có).

**Inputs (filter):**

- `status` filter (paid, confirmed, pending, cancelled)
- `checkedIn` toggle
- `search` (theo MSSV / tên)

**Primary actions:**

- `[Export CSV]` → `GET /api/v1/admin/stats/export?type=registrations&workshop_id={id}` → download
- Row hover hiển thị quick action: gửi email (Stage 5)

**Business rules:**

- BR-A06.1 Status `pending` quá 30 phút sẽ tự cancel — show indicator
- BR-A06.2 Hiển thị checkin time nếu sinh viên đã quét QR

**Components:**

- `<RegistrationsTable />` (sortable, paginated)
- `<ExportCSVButton />`
- `<StatusBadge />`

**API endpoints:**

- `GET /api/v1/admin/workshops/{id}/registrations?status=&include=student&cursor=&limit=`
- `GET /api/v1/admin/stats/export?type=registrations&workshop_id={id}`

---

#### SCR-A07 — `/admin/workshops/[id]/stats` (Workshop stats)

**Purpose:** Dashboard metrics cho 1 workshop.

**Read-only:**

- Total registrations + by status
- Check-in count + rate (%)
- No-show rate
- Revenue (nếu paid) + currency
- Timeline: registration over time chart
- Time-to-fill metric

**Components:**

- `<KPICard />` × 4
- `<RegistrationTimelineChart />` (recharts)
- `<CheckinFunnelChart />`

**API endpoints:**

- `GET /api/v1/admin/workshops/{id}/stats`

---

#### SCR-A08 — `/admin/workshops/[id]/summary` (AI Summary management)

**Purpose:** Upload PDF, theo dõi xử lý, override thủ công.

**Read-only:**

- `summaryStatus`: badge (none / queued / processing / done / failed)
- `pdfUrl`: link xem PDF gốc nếu có
- `summaryText`: nội dung AI generated (chỉ khi `done`)
- `updatedAt`
- `errorDetail` (nếu failed)

**Inputs:**

- `[Upload PDF]` → file picker (extension .pdf, size ≤ 10MB)
- `[Edit summary]` → textarea rich text editor

**Primary actions:**

- `[Upload]` → `POST /api/v1/admin/workshops/{id}/summary` (multipart) → status='QUEUED' → polling
- `[Retry]` (nếu status=failed) → `POST /api/v1/admin/workshops/{id}/summary/retry`
- `[Lưu override]` (sau khi edit text) → `PUT /api/v1/admin/workshops/{id}/summary` body `{text}` → status='DONE'

**Business rules:**

- BR-A08.1 Polling status interval 3s khi `queued`/`processing`, dừng khi `done`/`failed`
- BR-A08.2 Re-upload PDF → reset status về queued, summary text bị xóa (cảnh báo confirm)
- BR-A08.3 Override thủ công ưu tiên hơn AI — sau khi save, status=done không thay đổi nữa

**Components:**

- `<PDFUploader />` (drag-drop, validation)
- `<SummaryStatusBadge />`
- `<RichTextEditor />` (cho override)
- `<PollingIndicator />`

**API endpoints:**

- `POST /api/v1/admin/workshops/{id}/summary` (multipart)
- `GET /api/v1/admin/workshops/{id}/summary` (polling)
- `POST /api/v1/admin/workshops/{id}/summary/retry`
- `PUT /api/v1/admin/workshops/{id}/summary`

---

#### SCR-A09 — `/admin/speakers` (Speakers list)

**Purpose:** Quản lý master data diễn giả.

**Read-only:** Table: avatar, fullName, title, count of upcoming workshops.

**Primary actions:**

- `[+ Tạo diễn giả]` → `/admin/speakers/new`
- Row click → `/admin/speakers/{id}`
- Inline `[Delete]` (soft delete, chặn nếu đang ref bởi workshop chưa kết thúc)

**Components:**

- `<SpeakersTable />`
- `<DeleteConfirmDialog />` (UI state)

**API endpoints:**

- `GET /api/v1/admin/speakers`
- `DELETE /api/v1/admin/speakers/{id}`

---

#### SCR-A10 — `/admin/speakers/new` & SCR-A11 `/admin/speakers/[id]` (Speaker form)

**Purpose:** Tạo / edit diễn giả.

**Inputs:** `fullName`, `title`, `bio` (textarea), `avatarUrl` (upload).

**Primary actions:**

- `[Lưu]` → `POST /api/v1/admin/speakers` (new) hoặc `PATCH /api/v1/admin/speakers/{id}` (edit)

**Components:**

- `<SpeakerForm mode="create|edit" />`
- `<AvatarUploader />` (preview + crop)

**API endpoints:**

- `POST /api/v1/admin/speakers`
- `PATCH /api/v1/admin/speakers/{id}`

---

#### SCR-A12 — `/admin/rooms` (Rooms list)

**Purpose:** Quản lý phòng tổ chức.

**Read-only:** Table: name, building, floor, capacity, có sơ đồ chưa, count of upcoming workshops.

**Primary actions:**

- `[+ Tạo phòng]` (modal nhỏ → `<CreateRoomDialog />` → `POST /admin/rooms`)
- Row click → `/admin/rooms/{id}`

**Components:** `<RoomsTable />`, `<CreateRoomDialog />` (modal vì form ngắn, chỉ name/building/floor/capacity).

**API endpoints:** `GET /admin/rooms`, `POST /admin/rooms`.

---

#### SCR-A13 — `/admin/rooms/[id]` (Room detail/edit)

**Purpose:** Edit phòng + xem lịch sử workshop dùng phòng.

**Read-only:** Lịch sử workshop đã/sẽ tổ chức tại phòng (timeline).

**Inputs:** Tương tự create + `floorPlanUrl` (image upload).

**Primary actions:**

- `[Lưu]` → `PATCH /api/v1/admin/rooms/{id}`
- `[Upload sơ đồ]` → upload endpoint → set `floorPlanUrl`

**Components:**

- `<RoomForm />`
- `<FloorPlanUploader />` (drag-drop, image preview)
- `<RoomScheduleCalendar />` (read-only lịch sử)

**API endpoints:**

- `GET /api/v1/admin/rooms/{id}` (kèm workshops đã book)
- `PATCH /api/v1/admin/rooms/{id}`

---

#### SCR-A14 — `/admin/imports` (Import history)

**Purpose:** Lịch sử CSV import (cron đêm + manual) + manual trigger.

**Read-only:** Table: runAt, triggeredBy (cron/manual), status, totalRows, successCount, failedCount, durationMs.

**Inputs:** N/A.

**Primary actions:**

- `[Trigger import]` (manual) → `<TriggerImportDialog />` (file upload optional) → `POST /api/v1/admin/imports/trigger`
- Row click → `/admin/imports/{id}`

**Business rules:**

- BR-A14.1 Concurrency guard: nếu có row status=in_progress → button disabled + tooltip
- BR-A14.2 Mỗi đêm có 1 row tự động (cron)

**Components:**

- `<ImportsTable />`
- `<StatusBadge />`
- `<TriggerImportDialog />` (modal, UI state)

**API endpoints:**

- `GET /api/v1/admin/imports?cursor=&limit=`
- `POST /api/v1/admin/imports/trigger`

---

#### SCR-A15 — `/admin/imports/[id]` (Import detail)

**Purpose:** Chi tiết 1 import run + download error CSV.

**Read-only:** All fields từ `import_logs` + summary breakdown (% success, error categories).

**Primary actions:**

- `[Tải file lỗi]` → `GET /api/v1/admin/imports/{id}/errors` (stream CSV)

**Components:**

- `<ImportSummary />`
- `<ErrorBreakdownChart />`
- `<DownloadErrorCSVButton />`

**API endpoints:**

- `GET /api/v1/admin/imports/{id}`
- `GET /api/v1/admin/imports/{id}/errors`

---

#### SCR-A16 — `/admin/notifications` (Notification channels + logs)

**Purpose:** Cấu hình kênh thông báo (Strategy Pattern, ADR-09) và xem audit log.

**Tabs (cùng screen, chuyển đổi nội bộ — KHÔNG sub-route vì 2 view có cùng business goal: debug & config notification system):**

1. **Channels:** list `notification_channel_configs` (email, in_app, telegram). Toggle is_active, edit configJson.
2. **Logs:** filter failed/timeout, replay action.

**Read-only:**

- Channels: channelType, isActive, configJson preview, lastUpdatedAt
- Logs: userId, eventType, channel, status, errorMsg, createdAt

**Inputs:**

- Toggle isActive per channel
- Edit configJson (modal với JSON editor)
- Logs filter: status, channel, dateRange

**Primary actions:**

- `[Save channel config]` → `PATCH /api/v1/admin/notification-channels/{id}`
- `[Replay failed]` (per log row) — Stage 5 if implemented

**Components:**

- `<TabsContainer />` (client-side tabs, không phải sub-route — exception)
- `<ChannelConfigCard />`
- `<JSONEditor />` (modal)
- `<NotificationLogsTable />`

**API endpoints:**

- `GET /api/v1/admin/notification-channels`
- `PATCH /api/v1/admin/notification-channels/{id}`
- `GET /api/v1/admin/notifications/logs?status=failed&channel=&from=&to=`

---

#### SCR-A17 — `/admin/system` (Operations: CB + Reconciliation)

**Purpose:** Operational tools cho BTC trong sự kiện — monitor Circuit Breaker và trigger payment reconciliation.

**Tabs:**

1. **Circuit Breaker:** trạng thái CB của mỗi gateway (CLOSED/HALF_OPEN/OPEN), failureCount, autoCloseAt, manual reset button.
2. **Payment Reconciliation:** số lượng payment status=`unresolved` chờ reconcile, last reconcile run, manual trigger button.

**Read-only:**

- CB: per gateway: state, failureCount, openedAt, autoCloseAt
- Reconcile: count unresolved, last run timestamp + result

**Inputs:** N/A (chỉ button actions).

**Primary actions:**

- `[Reset CB cho {gateway}]` → confirm dialog → `POST /api/v1/admin/system/circuit-breaker/{gateway}/reset`
- `[Trigger reconciliation]` → `POST /api/v1/admin/payments/reconcile` (concurrency guard: 409 nếu đang chạy)

**Business rules:**

- BR-A17.1 CB state là in-memory — process restart sẽ reset
- BR-A17.2 Reconcile dùng PG advisory lock — 1 instance tại 1 thời điểm
- BR-A17.3 Reset CB là last resort — chỉ dùng sau khi BTC đã verify gateway bình thường

**Components:**

- `<TabsContainer />` (CB | Reconcile)
- `<CBStateCard />` (per gateway, color-coded)
- `<ResetCBButton />` + `<ConfirmDialog />`
- `<UnresolvedPaymentsCount />`
- `<TriggerReconcileButton />`
- `<ReconcileHistory />` (last 10 runs)

**API endpoints:**

- `GET /api/v1/admin/system/circuit-breaker`
- `POST /api/v1/admin/system/circuit-breaker/{gateway}/reset`
- `POST /api/v1/admin/payments/reconcile`
- (Optional, Stage 5) `GET /api/v1/admin/payments?status=unresolved&from=&to=` — để show count và list

---

### C. MOBILE — CHECK-IN STAFF

---

#### SCR-M01 — `(auth)/login.tsx` (Mobile login)

**Purpose:** Staff đăng nhập + nhận `allowedWorkshopIds`.

**Inputs:** `email`, `password`.

**Primary actions:**

- `[Login]` → `POST /api/v1/auth/login` body `{accountType:"staff", email, password}` →
  - Verify `role === 'CHECKIN_STAFF'` (nếu role=btc → reject với "Vui lòng dùng web admin")
  - Save `accessToken` to memory + `refreshToken` to Expo SecureStore
  - INSERT/REPLACE `app_session` row (singleton): user_id, email, role, allowedWorkshopIds, access/refresh exp
  - Initialize `device_config` if not exists (sinh device_id UUID v4)
  - Navigate `/` (workshop list)

**Business rules:**

- BR-M01.1 Mobile **chỉ nhận role=checkin_staff** — btc đăng nhập mobile → 403 redirect
- BR-M01.2 Refresh token transport = JSON body (mobile)
- BR-M01.3 device_id sinh 1 lần khi install, persist qua mọi login/logout (chỉ mất khi uninstall)

**Validation rules:**

- VR-M01.1 Email format
- VR-M01.2 Network error → cache last login attempt, hint "Cần mạng để đăng nhập"

**Components:**

- `<LoginScreen />` (Expo)
- `<TextInput />` (email + password)
- `<Button variant="primary" />`
- `<NetworkStatusBanner />` (nếu offline)

**API endpoints:** `POST /api/v1/auth/login`

**Local DB writes:**

- `INSERT OR REPLACE INTO app_session (...)` (singleton row)
- `INSERT INTO device_config (...) ON CONFLICT DO NOTHING` (lần đầu)

---

#### SCR-M02 — `(app)/index.tsx` (Workshops list)

**Purpose:** Staff thấy các workshop được phân công và chọn để check-in.

**Read-only:**

- Mỗi workshop: title, startsAt, room.name
- Cache status: cached / partial / not loaded (từ `cache_metadata.is_fully_loaded`)
- Pending sync count cho workshop đó (từ `checkin_queue WHERE workshop_id=? AND sync_status IN ('PENDING','FAILED')`)
- Network status banner (online/offline)

**Inputs:** N/A (filter Stage 5 nếu nhiều workshop).

**Primary actions:**

- Tap workshop → navigate `/workshops/[id]`

**Secondary actions:**

- `[Sync all]` (header right) → tab `/sync`
- `[Settings]` (header right) → `/settings`

**Business rules:**

- BR-M02.1 Chỉ list workshop có `id ∈ JWT.allowedWorkshopIds` (cache trong app_session.allowedWorkshopIds)
- BR-M02.2 Hiển thị offline indicator nếu `NetInfo.isConnected === false`

**Components:**

- `<WorkshopRowCard />` (mobile-optimized)
- `<CacheStatusBadge />` (synced / stale / offline)
- `<PendingSyncBadge />`
- `<NetworkStatusBanner />`
- `<HeaderActions />` (sync + settings icons)

**API endpoints:**

- `GET /api/v1/workshops?ids=...` — fetch tên/lịch theo allowedWorkshopIds (chỉ khi online)

**Local DB queries:**

- `SELECT * FROM cache_metadata WHERE workshop_id IN (...)`
- `SELECT workshop_id, COUNT(*) FROM checkin_queue WHERE sync_status IN ('PENDING','FAILED') GROUP BY workshop_id`

---

#### SCR-M03 — `(app)/workshops/[id]/index.tsx` (Workshop dashboard)

**Purpose:** "Lobby" trước khi vào scanner — staff thấy cache status, scan count, và actions.

**Read-only:**

- Workshop info: title, startsAt, room
- Cache status: `is_fully_loaded` (1 = ready offline, 0 = chưa đầy đủ)
- Cache progress: `registration_count / server_total`
- Scanned count today: từ `checkin_queue WHERE workshop_id=? AND date(checked_in_at) = today`
- Last sync timestamp (từ `sync_log MAX(completed_at) WHERE workshop_id=?`)
- Network status

**Inputs:** N/A.

**Primary actions:**

- `[Pre-load registrations]` (visible nếu `is_fully_loaded=0` hoặc cache stale) → fetch all pages từ `/checkin/workshops/{id}/registrations` → INSERT/UPDATE vào `cached_registrations` → SET `cache_metadata.is_fully_loaded=1`
- `[Mở Scanner]` (chỉ enable nếu `is_fully_loaded=1` HOẶC online) → navigate `/workshops/[id]/scan`
- `[Lịch sử]` → navigate `/workshops/[id]/history`

**Secondary actions:**

- `[Sync ngay]` (nếu có pending) → trigger sync cho workshop này

**Business rules:**

- BR-M03.1 Scanner chỉ khả dụng offline nếu `is_fully_loaded=1` — nếu chưa load mà offline → button disabled với tooltip "Cần mạng để pre-load trước"
- BR-M03.2 Pre-load progress: hiển thị "Đang tải 250/500..." trong button khi đang fetch
- BR-M03.3 Cache stale (>30 phút từ `last_fetched_at`) → banner gợi ý refresh, nhưng vẫn cho dùng

**Validation rules:**

- VR-M03.1 Workshop_id ∈ allowedWorkshopIds (offline check trước, nếu pass thì navigate)

**Components:**

- `<WorkshopHeader />`
- `<CacheStatusCard />` (with progress bar)
- `<PreLoadButton />` (shows progress)
- `<ActionGrid />` (Scanner | History | Sync)
- `<NetworkStatusBanner />`
- `<LastSyncTimestamp />`

**API endpoints:**

- `GET /api/v1/checkin/workshops/{id}/registrations?cursor=&limit=200` (pagination, có header X-Total-Count)

**Local DB writes:**

- `INSERT OR REPLACE INTO cached_registrations (...)` per page
- `INSERT OR REPLACE INTO cache_metadata (workshop_id, last_fetched_at, registration_count, server_total, is_fully_loaded, cache_status)`

---

#### SCR-M04 — `(app)/workshops/[id]/scan.tsx` (QR Scanner)

**Purpose:** Quét QR và check-in (online → POST trực tiếp; offline → enqueue).

**Read-only:**

- Camera viewfinder full screen
- Top banner: workshop title, network status (online/offline indicator)
- Scan count counter (today's scans for this workshop)
- Pending sync count (nếu có)

**Inputs:**

- QR code (camera input — không phải text field)

**Primary actions (state machine):**

```
State: IDLE
  → Camera detects QR
State: VALIDATING
  → IF online:
       POST /api/v1/checkins {qrCode, workshopId, checkedInAt, clientLocalId}
       → 201 → State SUCCESS_NEW
       → 200 duplicate → State SUCCESS_DUPLICATE
       → 404 → State ERROR_INVALID
       → 403 → State ERROR_WRONG_WORKSHOP
       → network error → fall through to OFFLINE path
     ELSE (offline):
       Lookup local: SELECT * FROM cached_registrations WHERE qr_code = :code
       → IF not found → State ERROR_INVALID
       → IF found:
           INSERT INTO checkin_queue (..., sync_status='PENDING')
           ON CONFLICT (qr_code, workshop_id) DO NOTHING
           rowsAffected=0 → State SUCCESS_DUPLICATE_LOCAL
           rowsAffected=1 → State SUCCESS_QUEUED
State: SUCCESS_*  (overlay hiện 1.5s, hiển thị student name)
  → Auto return to IDLE
State: ERROR_*  (overlay hiện cho đến khi tap dismiss)
  → Tap → return to IDLE
```

**Secondary actions:**

- `[Tắt scanner]` → back to `/workshops/[id]`
- `[Sync ngay]` (nếu có pending) → trigger sync without leaving screen

**Business rules:**

- BR-M04.1 `clientLocalId = uuid()` sinh ngay khi detect QR — local idempotency key
- BR-M04.2 Cùng QR không thể quét 2 lần trên cùng device (UNIQUE INDEX trên `(qr_code, workshop_id)` của `checkin_queue`)
- BR-M04.3 Khi network resume sau scan offline → auto-trigger sync sau 5s
- BR-M04.4 Camera permission denied → fallback screen "Cấp quyền camera" với button → app settings

**Validation rules:**

- VR-M04.1 Online: server kiểm tra `workshop_id ∈ JWT.allowedWorkshopIds`
- VR-M04.2 Offline: app verify `cached_registrations.workshop_id = current_workshop_id` trước khi insert queue
- VR-M04.3 Registration status NOT IN ('PAID','CONFIRMED') → reject với error overlay

**Components:**

- `<CameraView />` (Expo Camera + barcode scanner)
- `<ScanOverlay />` (viewfinder frame)
- `<ResultBanner state="success_new|success_duplicate|error_invalid|error_wrong_workshop" />`
- `<NetworkStatusPill />`
- `<ScanCounter />`
- `<PermissionGate />` (component check camera perm)

**Related UI states:**

- IDLE / VALIDATING / SUCCESS_NEW / SUCCESS_DUPLICATE / SUCCESS_QUEUED / SUCCESS_DUPLICATE_LOCAL / ERROR_INVALID / ERROR_WRONG_WORKSHOP / ERROR_NOT_PAID / NO_PERMISSION

**API endpoints:**

- `POST /api/v1/checkins` (online path; tự nhiên idempotent qua DB UNIQUE)
- `POST /api/v1/checkins/sync` (background sync trigger, không trực tiếp từ screen này)

**Local DB writes:**

- `INSERT INTO checkin_queue (...) ON CONFLICT (qr_code, workshop_id) DO NOTHING`

---

#### SCR-M05 — `(app)/workshops/[id]/history.tsx` (Per-workshop history)

**Purpose:** Xem lịch sử check-in của workshop trên device này.

**Read-only:** List rows: studentCode, studentName, checkedInAt, sync_status (PENDING/SYNCING/SYNCED/CONFLICT/FAILED), error_detail.

**Inputs (filter):**

- `sync_status` chips
- `dateRange` (default: today)

**Primary actions:**

- Tap row → expand detail (modal): full info + actions
- `[Re-sync row]` (nếu FAILED) → mark next_retry_at=now → trigger sync

**Business rules:**

- BR-M05.1 Hiển thị server-side first-checkin time nếu CONFLICT (ai check-in trước, từ response duplicate)

**Components:**

- `<HistoryList />`
- `<SyncStatusChip />`
- `<RowDetailSheet />` (bottom sheet, không phải screen — UI state)
- `<RetryButton />`

**API endpoints:**

- `POST /api/v1/checkins/sync` (per individual retry)

**Local DB queries:**

- `SELECT * FROM checkin_queue WHERE workshop_id = ? ORDER BY checked_in_at DESC`

---

#### SCR-M06 — `(app)/sync.tsx` (Global sync queue)

**Purpose:** View global sync state và trigger sync thủ công.

**Read-only:**

- Total pending across all workshops
- Total failed
- Last successful sync timestamp (global)
- Network status
- List of pending items grouped by workshop
- Recent sync_log entries (last 10)

**Primary actions:**

- `[Sync all now]` → batch POST `/api/v1/checkins/sync` (50 items per batch, loop until empty)
- `[Retry all failed]` → reset next_retry_at, trigger sync

**Business rules:**

- BR-M06.1 Sync requires online — disable button + banner if offline
- BR-M06.2 Mỗi batch tối đa 50 items
- BR-M06.3 Exponential backoff trên FAILED: 60s, 120s, 240s, ..., max 1h (tự động bởi worker theo `next_retry_at`)
- BR-M06.4 SYNCING crash recovery: rows có `sync_status='SYNCING' AND syncing_at < now-5min` → reset PENDING (chạy ở app start)

**Validation rules:**

- VR-M06.1 Trước khi POST sync, check JWT exp > now; nếu hết hạn → refresh token trước

**Components:**

- `<SyncSummaryCard />` (counts)
- `<SyncQueueList />` (per workshop group)
- `<SyncNowButton />`
- `<SyncLogTimeline />` (last 10 runs)
- `<NetworkStatusBanner />`

**API endpoints:**

- `POST /api/v1/checkins/sync` (batch up to 50 items)

**Local DB writes per item:**

- `UPDATE checkin_queue SET sync_status='SYNCING', syncing_at=now()` (claim)
- After response per item:
  - `ok` → `sync_status='SYNCED', synced_at=now()`
  - `duplicate` → `sync_status='CONFLICT', error_detail='...'`
  - `rejected` → `sync_status='REJECTED' (FAILED in our enum), error_detail=reason`
- `INSERT INTO sync_log (workshop_id, started_at, completed_at, status, total_records, synced_count, conflict_count, failed_count)`

---

#### SCR-M07 — `(app)/settings.tsx` (Settings)

**Purpose:** Profile info, logout, app info.

**Read-only:**

- User: fullName, email, role
- App version (from `device_config.app_version`)
- device_id (debug, ít hiển thị — có thể hide-by-default)
- Allowed workshops count
- Last global sync timestamp

**Inputs:** N/A.

**Primary actions:**

- `[Logout]` → `<ConfirmDialog>"Bạn có {pending} check-in chưa sync. Sync trước khi logout?"</ConfirmDialog>` → nếu user confirm:
  - Trigger final sync
  - `POST /api/v1/auth/logout` (revoke refresh token)
  - `DELETE FROM app_session WHERE id=1`
  - Clear SecureStore tokens
  - Mark `device_tokens` is_active=false (nếu có push notification, mobile staff hiện tại không có)
  - Navigate `/login`

**Business rules:**

- BR-M07.1 Cảnh báo logout nếu pending sync > 0 — không block logout, chỉ cảnh báo
- BR-M07.2 Logout không xóa `device_config` (giữ device_id qua mọi login)
- BR-M07.3 Logout không xóa `cached_registrations` (giữ cache để login lại nhanh; cleared bởi cache_status='INVALID' check)

**Components:**

- `<UserProfileCard />`
- `<AppInfoSection />`
- `<LogoutButton />` + `<LogoutConfirmDialog />`

**API endpoints:**

- `POST /api/v1/auth/logout`

**Local DB writes:**

- `DELETE FROM app_session WHERE id=1`

---

## Section 4 — Mapping Matrix (User Flow Steps → Screens)

> Bảng này verify mỗi bước trong user-flow analysis được phục vụ bởi đúng 1 screen (hoặc UI state của screen tồn tại). Các bước thuộc backend xử lý không có UI mapping.

| Flow | Step | Actor | Boundary? | Classification | Screen / State / Component |
|---|---|---|---|---|---|
| 1 | Vào trang danh sách | Sinh viên | Yes | Screen | SCR-W02 `/workshops` |
| 1 | Hệ thống hiển thị workshop list | System | — | Component | `<WorkshopCard />` |
| 1 | Filter/search | Sinh viên | No | Component | `<FilterBar />` (state of W02) |
| 1 | Chọn workshop → xem chi tiết | Sinh viên | Yes | Screen | SCR-W03 `/workshops/[id]` |
| 2 | Bấm "Đăng ký" | Sinh viên | No | UI State | `<RegisterConfirmDialog />` (state of W03) |
| 2 | Server xử lý OL + idempotency | System | — | Backend | (no UI) |
| 2 | Sinh QR + thông báo | System | No | UI State | toast trên W03 → redirect W05 |
| 2 | Sinh viên nhận QR | Sinh viên | Yes | Screen | SCR-W05 `/me/registrations/[id]` |
| 3 | Bấm "Đăng ký" (paid) | Sinh viên | No | UI State | dialog state of W03 |
| 3 | Server CB check, idempotency | System | — | Backend | — |
| 3 | Redirect đến trang thanh toán | System | Yes | Screen | SCR-W06 `/me/registrations/[id]/pay` |
| 3 | Chọn gateway, click Pay | Sinh viên | No | Component | `<GatewaySelector />` |
| 3 | Gateway redirect / sync result | System | Yes | Screen | SCR-W07 `/payment-result` |
| 3 | Hiển thị kết quả (success/failed/timeout) | System | No | UI State | states of W07 |
| 4 | Vào "Đăng ký của tôi" | Sinh viên | Yes | Screen | SCR-W04 `/me/registrations` |
| 4 | Chọn workshop → xem QR | Sinh viên | Yes | Screen | SCR-W05 |
| 5 | BTC đăng nhập | BTC | Yes | Screen | SCR-A01 `/admin/login` |
| 5 | Vào dashboard | BTC | Yes | Screen | SCR-A02 `/admin` |
| 5 | Vào danh sách workshop | BTC | Yes | Screen | SCR-A03 `/admin/workshops` |
| 5 | Click "Tạo workshop" | BTC | Yes | Screen | SCR-A04 `/admin/workshops/new` |
| 5 | Form tạo workshop | BTC | No | Component | `<WorkshopForm />` |
| 5 | Validation server-side | System | — | Backend | — |
| 5 | INSERT workshop | System | — | Backend | — |
| 6 | Chọn workshop cần sửa | BTC | Yes | Screen | SCR-A05 `/admin/workshops/[id]` |
| 6 | Đổi phòng/giờ → save | BTC | No | Component | `<WorkshopForm />` |
| 6 | Server PATCH với OL | System | — | Backend | — |
| 6 | Trigger thông báo cho sinh viên | System | — | Backend | — |
| 6 | Hủy workshop | BTC | No | UI State | `<CancelDialog />` (state of A05) |
| 7 | Vào tab AI Summary | BTC | Yes | Screen | SCR-A08 `/admin/workshops/[id]/summary` |
| 7 | Upload file PDF | BTC | No | Component | `<PDFUploader />` |
| 7 | Server đẩy job vào Streams | System | — | Backend | — |
| 7 | Worker xử lý + lưu summary | System | — | Backend | — |
| 7 | Trang chi tiết hiển thị summary | Sinh viên | No | UI State | `<AISummaryPanel />` (state of W03) |
| 8 | Cron đêm chạy | System | — | Backend | — |
| 8 | Xem báo cáo import | BTC | Yes | Screen | SCR-A14 `/admin/imports` |
| 8 | Xem chi tiết một lần import | BTC | Yes | Screen | SCR-A15 `/admin/imports/[id]` |
| 8 | Tải file lỗi | BTC | No | Action | `[Download]` (no new screen) |
| 9 | Dashboard tổng quan | BTC | Yes | Screen | SCR-A02 |
| 9 | Drill-down workshop | BTC | Yes | Screen | SCR-A06 hoặc SCR-A07 |
| 10 | Mở mobile app, đăng nhập | Staff | Yes | Screen | SCR-M01 `(auth)/login.tsx` |
| 10 | Chọn workshop | Staff | Yes | Screen | SCR-M02 `(app)/index.tsx` + SCR-M03 |
| 10 | Quét QR online | Staff | Yes | Screen | SCR-M04 `(app)/workshops/[id]/scan.tsx` |
| 10 | Server INSERT checkins | System | — | Backend | — |
| 10 | Hiển thị kết quả | System | No | UI State | `<ResultBanner />` (state of M04) |
| 11 | App phát hiện mất mạng | System | No | UI State | `<NetworkStatusBanner />` (state of M04) |
| 11 | Quét QR offline | Staff | No | UI State | offline mode of M04 |
| 11 | App validate locally + queue | System | — | Local DB | INSERT checkin_queue |
| 11 | Kết nối phục hồi | System | No | UI State | banner state |
| 11 | Outbox sync | System | — | Backend | POST /checkins/sync |
| 11 | Banner "Đã đồng bộ X bản ghi" | Staff | Yes | Screen (visit) | SCR-M06 `(app)/sync.tsx` |

✅ Mọi bước user-flow có UI đều mapped. Không có flow step lạc nào.

---

## Section 5 — Ambiguity Log

```
[AMB-001] Authentication scope cho student web — SSO trường?
  → Source: schema.sql students.password_hash NULL nếu auth qua SSO trường (Stage 5).
            Hiện tại password-based.
  → Assumption: Stage 1-4 dùng password-based auth (1 login screen).
  → Impact if wrong: Cần thêm SCR-W01b cho SSO redirect flow + landing page.

[AMB-002] Forgot/reset password flow
  → Source: requirements.md không đề cập.
  → Assumption: Không có; hiển thị link "Liên hệ ban tổ chức" trên SCR-W01.
  → Impact if wrong: Thêm SCR-W08 `/forgot-password`, SCR-W09 `/reset-password/[token]`.

[AMB-003] Self-registration cho sinh viên
  → Source: ADR-12 nêu rõ CSV import là source of truth.
  → Assumption: Không có self-signup. Sinh viên không có trong CSV → 422 generic message.
  → Impact if wrong: Cần SCR-W10 `/signup` với verification flow.

[AMB-004] Profile/account settings cho sinh viên
  → Source: requirements.md không yêu cầu.
  → Assumption: Bỏ qua. Email/tên không edit được (đồng bộ từ CSV).
  → Impact if wrong: Thêm SCR-W11 `/me/profile`.

[AMB-005] Mobile cho student (PWA hay native)?
  → Source: requirements.md "Sinh viên: web app / mobile". mobile-schema.sql lock CHECKIN_STAFF.
  → Assumption: Sinh viên dùng responsive web (PWA-compatible). Không có Expo app riêng.
  → Impact if wrong: Cần parallel screen list cho student mobile (~5 screens).

[AMB-006] Web cho check-in staff
  → Source: API có endpoint /checkin/* nhưng mobile-schema chỉ CHECKIN_STAFF.
  → Assumption: Check-in chỉ qua mobile. Web admin không có /admin/checkin.
  → Impact if wrong: Thêm SCR-A18 `/admin/checkin/[workshopId]` cho fallback web.

[AMB-007] Admin login tách khỏi student login
  → Source: api-design.md POST /auth/login chung cho cả 2.
  → Assumption: Tách 2 screen (W01 student, A01 admin) cho RBAC clarity và post-login UX.
  → Impact if wrong: Gộp thành 1 screen `/login` với role detection auto-redirect post-login.

[AMB-008] Workshop snapshot vs live data trong /me/registrations/[id]
  → Source: Không clarified — sinh viên xem registration đã đăng ký 3 ngày trước,
    workshop detail có thay đổi.
  → Assumption: Hiển thị live (workshop hiện tại) — nếu BTC đổi giờ/phòng,
    sinh viên thấy thông tin mới (đúng với notification "workshop changed").
  → Impact if wrong: Cần snapshot tại registeredAt → thêm registration_snapshot table.

[AMB-009] /admin/notifications gộp 2 view (channels + logs) hay tách?
  → Assumption: Gộp 1 screen với client-side tabs (không sub-route) vì cùng business
    domain "manage notification system".
  → Impact if wrong: Tách thành SCR-A16a `/admin/notifications/channels`,
    SCR-A16b `/admin/notifications/logs`.

[AMB-010] /admin/system gộp CB + Reconciliation hay tách?
  → Assumption: Gộp 1 screen với client-side tabs vì cùng "operations during incident".
  → Impact if wrong: Tách thành SCR-A17a `/admin/system/circuit-breaker`,
    SCR-A17b `/admin/system/payment-reconciliation`.

[AMB-011] /admin/rooms — có /admin/rooms/new tách không?
  → Assumption: Không tách — `<CreateRoomDialog />` modal vì form ngắn (4 fields).
    Edit (có floor plan upload phức tạp hơn) → screen riêng /admin/rooms/[id].
    Đây là exception so với speakers (tách full).
  → Impact if wrong: Thêm SCR-A12b `/admin/rooms/new` cho consistency.

[AMB-012] Payment redirect-flow vs sync-flow
  → Source: api-design.md POST /payments có returnUrl nhưng response chỉ document sync.
  → Assumption: Cả 2 mode đều support — sync (MOCK) + redirect (real gateways).
    /payment-result handle cả 2 entry: sync redirect và external return.
  → Impact if wrong: Nếu chỉ redirect → /payment-result luôn chỉ poll, không có sync mode.

[AMB-013] Cancel registration policy — bao nhiêu giờ trước workshop?
  → Source: registration-paid.md (chưa thấy trong context).
  → Assumption: Cho phép cancel đến trước startsAt 2 giờ.
  → Impact if wrong: Cần update validation rule VR-W04.1 và VR-W05.

[AMB-014] Email/calendar invite — UI hay backend only?
  → Source: requirements.md "thông báo qua app và email".
  → Assumption: Email được gửi backend (Strategy InAppChannel + EmailChannel).
    Frontend không có "preview email" hay "manage subscription" screen.
  → Impact if wrong: Thêm SCR-W12 `/me/notifications` cho subscription preferences.

[AMB-015] 404 / Error pages
  → Assumption: Next.js `not-found.tsx` và `error.tsx` ở route group level (technical).
    Không liệt kê thành screen riêng vì không có business goal.
  → Impact if wrong: Liệt kê trong inventory cho hoàn chỉnh.
```

---

## Section 6 — Validation Findings

### Possible missing screens (cần xác nhận với stakeholder)

```
- /forgot-password + /reset-password (AMB-002): Stage 5, hiện chấp nhận thiếu.
- /me/profile (AMB-004): Hiện không cần — email/tên đồng bộ từ CSV.
- /me/notifications (AMB-014): Subscription management cho push/email — Stage 5.
- /admin/checkin/[workshopId] (AMB-006): Web fallback nếu mobile lỗi — không bắt buộc.
- /admin/payments?status=unresolved (extension của SCR-A17): list view cho unresolved
  payments — hiện gộp count vào A17 panel; nếu BTC cần drill-down → tách thành sub-screen.
- /admin/notifications/preview (Stage 5): preview template trước khi gửi — không trong scope.
```

### Possible redundant screens / merge candidates

```
- SCR-A09 (speakers list) + SCR-A11 (speaker edit): có thể gộp inline editing trong list,
  nhưng tách rõ hơn cho audit và URL deep-link. KHÔNG MERGE.
- SCR-A12 (rooms list) + SCR-A13 (room edit): tương tự, nhưng /new là modal trên list — đã merge.
- SCR-W01 + SCR-A01: candidate to merge thành 1 `/login` với conditional render.
  Đã chọn TÁCH (xem AMB-007 rationale). Nếu stakeholder muốn UX đơn giản hơn → merge OK.
```

### Over-fragmentation risk

```
- SCR-A06/A07/A08 (workshop sub-routes): 3 sub-route có thể seem over-fragmented nếu
  BTC chỉ thường vào tab A07 (stats). Mitigation: tab nav rõ ràng + remember last tab.
  Vẫn KEEP separate vì 3 data scope hoàn toàn khác — đúng theo Principle 3.

- SCR-W04 + SCR-W05: list + detail là pattern chuẩn, KHÔNG over-fragmented.

- SCR-M03 vs SCR-M04: lobby vs scanner. Nguy cơ over-fragment nếu user chỉ vào để scan.
  Mitigation: M02 → M03 → tap "Scanner" → M04 chỉ 2 taps. Vẫn KEEP separate vì camera
  permission + full-screen viewfinder thay đổi context hoàn toàn.
```

### Under-specification risk

```
- SCR-W07 `/payment-result`: business rule cho "unresolved" sau 5 phút chưa rõ
  — reconciliation có gọi notification không, hay chỉ silent update? Cần xác nhận với
  payment-reconciliation.md spec (Stage 5).

- SCR-A08 AI Summary screen: chưa rõ behavior khi BTC re-upload PDF lúc summary đang
  process — abort job cũ hay queue mới? Cần ADR-10 spec rõ.

- SCR-M04 Scanner: behavior khi camera permission bị revoke giữa session
  (user vào Settings turn off) — cần fallback graceful, hiện chỉ document
  "permission denied → fallback screen" mà không spec UI cụ thể.

- SCR-M06 Sync screen: progress bar cho batch lớn (>50 items) — UI chưa cụ thể.

- SCR-A17 Operations: nếu BTC reset CB và gateway vẫn lỗi → CB OPEN lại ngay.
  UI không có loop detection để cảnh báo BTC. Stage 5.
```

### Cross-cutting checks (tất cả screen)

```
✓ Mỗi screen có ít nhất 1 use case mapping (Section 4 verify).
✓ Không có screen mồ côi không phục vụ flow nào.
✓ RBAC enforcement điểm 2 và 3 đã spec rõ ở mỗi screen tương ứng (route prefix +
  method-level WHERE clause + JWT claim check).
✓ Optimistic Locking visible cho user qua 412 error — UI dialog spec ở SCR-A05.
✓ Idempotency Key client generation spec rõ ở SCR-W03 và SCR-W06.
✓ Offline-first invariants (is_fully_loaded check, exponential backoff) spec rõ ở M03/M04/M06.
✓ Cache TTL 10s ↔ Cache-Control max-age=10s đã consistent (SCR-W02, W03 components dùng
  poll interval khớp).
```

---

## Phụ lục — Cấu trúc thư mục đề xuất (cheat sheet)

### Web — `apps/web/` (Next.js)

```
app/
├── (public)/
│   ├── login/page.tsx                       # SCR-W01
│   ├── workshops/
│   │   ├── page.tsx                         # SCR-W02
│   │   └── [id]/page.tsx                    # SCR-W03
│   └── payment-result/page.tsx              # SCR-W07
├── (student)/
│   └── me/
│       └── registrations/
│           ├── page.tsx                     # SCR-W04
│           └── [id]/
│               ├── page.tsx                 # SCR-W05
│               └── pay/page.tsx             # SCR-W06
├── (admin)/
│   └── admin/
│       ├── login/page.tsx                   # SCR-A01
│       ├── page.tsx                         # SCR-A02
│       ├── workshops/
│       │   ├── page.tsx                     # SCR-A03
│       │   ├── new/page.tsx                 # SCR-A04
│       │   └── [id]/
│       │       ├── page.tsx                 # SCR-A05
│       │       ├── registrations/page.tsx   # SCR-A06
│       │       ├── stats/page.tsx           # SCR-A07
│       │       └── summary/page.tsx         # SCR-A08
│       ├── speakers/
│       │   ├── page.tsx                     # SCR-A09
│       │   ├── new/page.tsx                 # SCR-A10
│       │   └── [id]/page.tsx                # SCR-A11
│       ├── rooms/
│       │   ├── page.tsx                     # SCR-A12
│       │   └── [id]/page.tsx                # SCR-A13
│       ├── imports/
│       │   ├── page.tsx                     # SCR-A14
│       │   └── [id]/page.tsx                # SCR-A15
│       ├── notifications/page.tsx           # SCR-A16
│       └── system/page.tsx                  # SCR-A17
├── layout.tsx
└── not-found.tsx
```

### Mobile — `apps/mobile/` (Expo Router)

```
app/
├── _layout.tsx                              # Root layout (auth gate, NetInfo provider)
├── (auth)/
│   ├── _layout.tsx
│   └── login.tsx                            # SCR-M01
└── (app)/
    ├── _layout.tsx                          # Bottom tabs (Home | Sync | Settings)
    ├── index.tsx                            # SCR-M02 (Workshops list)
    ├── workshops/
    │   └── [id]/
    │       ├── _layout.tsx                  # Stack within workshop
    │       ├── index.tsx                    # SCR-M03 (Dashboard)
    │       ├── scan.tsx                     # SCR-M04 (Scanner)
    │       └── history.tsx                  # SCR-M05 (History)
    ├── sync.tsx                             # SCR-M06
    └── settings.tsx                         # SCR-M07
```
