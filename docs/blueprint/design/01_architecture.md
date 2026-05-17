# UniHub Workshop — Architecture Design

## 1. Kiến trúc tổng thể

### 1.1 Architectural Style

Hệ thống áp dụng **hai tầng scope kiến trúc** (theo phân loại Architectural Scoping trong Classical Architectural Styles):

| Scope | Phong cách | Phạm vi |
|-------|-----------|---------|
| **Macro-architecture** | Client-Server | Toàn bộ hệ thống |
| **Internal architecture** | Layered Architecture + Multi-style per module | Trong backend API |

**Macro — Client-Server:** Web Portal (Next.js SPA) và Mobile App (Expo) là client. Backend API (NestJS) là server trung tâm. Server chịu trách nhiệm xác thực, phân quyền, và toàn bộ logic nghiệp vụ — phù hợp với yêu cầu kiểm soát tập trung dữ liệu và bảo mật (3 nhóm người dùng với quyền hạn khác nhau).

**Internal — Modular Monolith + Layered Architecture:** Backend API là một process duy nhất (Modular Monolith), bên trong tổ chức theo Layered Architecture (Presentation → Business Logic → Data Access). Các module nội bộ áp dụng các phong cách chuyên biệt cho từng bài toán — lựa chọn này dựa trên 5 yếu tố từ Architectural Style Selection Framework: Function (đa dạng: CRUD, event-driven, batch), Performance (12.000 SV trong 10 phút), Team (2 thành viên, 2 tuần), Operations (Docker Compose, không Kubernetes), Evolution (ranh giới module được thiết kế để dễ tách thành Microservices sau này).

> **Tham chiếu:** ADR-01 (Modular Monolith), ADR-02 (Database), ADR-03 (Optimistic Locking)

### 1.2 Module Boundaries & Architectural Styles

Mỗi module backend áp dụng architectural style phù hợp với đặc thù bài toán:

| Module | Architectural Style | Lý do chọn | ADR |
|--------|-------------------|------------|-----|
| `booking` — Đăng ký & chỗ ngồi | Layered + OO (Optimistic Locking) | ACID transaction, row-level version check, retry ceiling | ADR-03 |
| `catalog` — Workshop CRUD | Layered (truyền thống) | Read-heavy, cache-aside, TTL ngắn | ADR-13 |
| `payment` — Thanh toán | Event-Driven + Circuit Breaker | Fault isolation, fail-fast khi gateway down, graceful degradation | ADR-07, ADR-08 |
| `notification` — Thông báo | Event-Driven + Strategy Pattern | Fire-and-forget, per-channel timeout, dễ thêm kênh mới (OCP) | ADR-09 |
| `checkin` — Kiểm duyệt | Client-Server + Offline-First (Outbox) | SQLite local → sync khi có mạng, server-wins conflict resolution | ADR-11 |
| `ai-summary` — Tóm tắt AI | Pipe-and-Filter | PDF → parse → truncate → AI summarize → store; mỗi stage độc lập | ADR-14 |
| `csv-sync` — Đồng bộ CSV | Batch-Sequential | Xử lý lô đêm, streaming parse 500 rows/batch, error quarantine | ADR-12 |
| `iam` — Xác thực & phân quyền | Layered + OO | JWT verify + RBAC middleware + query-level filter (3 lớp enforcement) | ADR-04, ADR-05 |
| `rate-limit` — Giới hạn lưu lượng | Sliding Window Counter (Redis) | Chống burst-at-boundary, 3 tier độc lập (IP, User, User×Workshop) | ADR-06 |

### 1.3 Năm lớp kiến trúc

Hệ thống được tổ chức thành 5 lớp (layer) xuyên suốt từ client đến storage:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Client Layer                                            │
│  ┌─────────────────────┐  ┌───────────────────────────────┐ │
│  │  Web Portal         │  │  Mobile App (Check-in)        │ │
│  │  Next.js 16 SPA     │  │  Expo + React Native + SQLite │ │
│  │  (SV + BTC)         │  │  (Check-in Staff)             │ │
│  └─────────┬───────────┘  └──────────────-┬───────────────┘ │
└────────────┼──────────────────────────────┼─────────────────┘
             │ HTTPS (REST)                 │ HTTPS (REST)
┌────────────┼──────────────────────────────┼──────────────────┐
│  2. Gateway & Edge Layer                                     │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  API Gateway / Reverse Proxy                             ││
│  │  • TLS termination                                       ││
│  │  • Rate Limiting (Sliding Window - ADR-06)               ││
│  │  • CDN cho tài nguyên tĩnh (Next.js static assets)       ││
│  └──────────────────────┬───────────────────────────────────┘│
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│  3. Application Layer (NestJS 11 Modular Monolith)           │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Presentation Layer (Controllers + Guards + Pipes)       ││
│  │  • JWT Guard (ADR-04) • RBAC Guard (ADR-05)              ││
│  │  • ZodValidationPipe (input validation)                  ││
│  │  • ResponseInterceptor (Result → HTTP status mapping)    ││
│  ├──────────────────────────────────────────────────────────┤│
│  │  Business Logic Layer (Services + Mechanics)             ││
│  │  • booking/  • catalog/  • payment/  • notification/     ││
│  │  • checkin/  • ai-summary/  • csv-sync/  • iam/          ││
│  │  • rate-limit/  • background/ (cron + workers)           ││
│  ├──────────────────────────────────────────────────────────┤│
│  │  Data Access Layer (Repositories — Drizzle ORM)          ││
│  │  • tryCatch wrapper → Result<T>                          ││
│  │  • Query-level filter (row-level security)               ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│  4. Asynchronous Messaging Layer                             │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  BullMQ (qua BullMQ)                                     ││
│  │  • Queue: ai-summary   — AI PDF processing queue         ││
│  │  • Queue: notification — Batch notification dispatch     ││
│  │  • DLQ queues cho retry-exhausted jobs                   ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────--┐
│  5. Storage & State Layer                                     │
│  ┌──────────────────-┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  PostgreSQL       │  │  Redis          │  │ Object Store │ │
│  │  (Neon Serverless)│  │  (Upstash)      │  │ Cloudflare   │ │
│  │  • ACID giao dịch │  │  • Cache (TTL)  │  │ R2 (S3-compat│ │
│  │  • Source of truth│  │  • Rate limit   │  │ PDF / CSV)   │ │
│  │  • Drizzle ORM    │  │  • Job queue    │  └──────────────┘ │
│  └──────────────────-┘  └─────────────────┘                   │
└──────────────────────────────────────────────────────────────-┘
```

**Công nghệ cụ thể từng lớp:**

| Layer | Công nghệ | Vai trò |
|-------|-----------|---------|
| Client — Web | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui | Giao diện sinh viên và admin |
| Client — Mobile | Expo SDK, React Native, SQLite (expo-sqlite + Drizzle ORM), NativeWind | Check-in offline-first |
| Gateway | Node.js HTTP proxy hoặc Nginx; CDN cho Next.js static assets | TLS termination, rate limiting, serve tĩnh |
| Application | NestJS 11, Drizzle ORM, Zod v4, ioredis, BullMQ | Business logic, API endpoints, async workers |
| Messaging | BullMQ (qua BullMQ) | Job queue cho AI summary + notification |
| Storage — Primary | PostgreSQL (Neon Serverless) | ACID, source of truth, upsert idempotent |
| Storage — Cache | Redis (Upstash) | Cache-aside, sliding window, queue |
| Storage — File | Cloudflare R2 (Object Storage, S3-compat) | PDF upload, CSV input, error quarantine |

### 1.4 Hệ thống gồm những phần nào?

Hệ thống gồm **8 thành phần chính**:

1. **Web Portal (Next.js SPA):** Giao diện cho sinh viên (xem workshop, đăng ký, thanh toán, xem QR) và ban tổ chức (quản lý workshop, xem thống kê, upload PDF).
2. **Mobile App (Expo + SQLite):** Giao diện dành riêng cho nhân sự check-in. Hoạt động offline: quét QR → ghi local → sync khi có mạng.
3. **Backend API (NestJS Monolith):** Xử lý toàn bộ logic nghiệp vụ — đăng ký, thanh toán, xác thực, AI summary, CSV sync. Một process duy nhất với 9 module nội bộ.
4. **PostgreSQL:** Lưu trữ chính — sinh viên, staff, workshop, registration, payment, check-in, idempotency keys, audit logs. Single source of truth.
5. **Redis:** Ba vai trò — cache (workshop list, seats_available), rate limiting (sliding window counters), job queue (BullMQ cho AI + notification).
6. **Object Storage (Cloudflare R2):** Lưu PDF workshop upload (key `workshops/{id}/{uuid}.pdf`), CSV đầu vào từ hệ thống sinh viên (prefix `students_`), file lỗi quarantine. Truy cập qua S3-compatible API (`PutObject`/`GetObject`).
7. **Hệ thống ngoài — Payment Gateway (Mock):** Xử lý thanh toán. Dùng mock server (Wiremock) để kiểm thử failure mode.
8. **Hệ thống ngoài — AI Provider (DeepSeek):** Tạo summary từ PDF. Dùng Anthropic SDK với `baseURL: https://api.deepseek.com/anthropic`, model `deepseek-v4-flash`. Abstract qua `AIProvider` interface để dễ swap.

### 1.5 Các thành phần giao tiếp với nhau như thế nào?

| Từ | Đến | Giao thức / Cơ chế | Hướng | Dữ liệu |
|----|-----|-------------------|-------|---------|
| Web Portal | Backend API | HTTPS (REST JSON) | Hai chiều | Workshop, registration, payment, auth |
| Mobile App | Backend API | HTTPS (REST JSON) | Hai chiều | Check-in sync, QR validation |
| Backend API | PostgreSQL | TCP (Drizzle ORM driver) | Hai chiều | All persistent data |
| Backend API | Redis | TCP (ioredis) | Hai chiều | Cache, rate limit counters, job queue |
| Backend API | AI Provider (DeepSeek) | HTTPS (REST, Anthropic SDK) | Một chiều ra | PDF content → summary text |
| Backend API | Payment Gateway | HTTPS (REST, Wiremock) | Hai chiều | Payment request + response |
| Backend API | Email Server (SMTP) | SMTP | Một chiều ra | Email notification |
| Backend API | Object Storage (R2) | HTTPS (S3-compatible API) | Hai chiều | PDF PutObject/GetObject, CSV GetObject |
| Legacy Student System | Backend API | CSV file polling | Một chiều vào | Student data (cron 2AM) |

**Nguyên tắc giao tiếp:**

- Giao tiếp đồng bộ (HTTP REST) cho các luồng cần kết quả tức thời: xem workshop, đăng ký, thanh toán, xác thực
- Giao tiếp bất đồng bộ (BullMQ) cho các tác vụ không real-time: AI summary, batch notification
- Giao tiếp một chiều (file polling) cho tích hợp với legacy system — không có API để gọi ngược

### 1.6 Khi một thành phần gặp sự cố?

| Thành phần sự cố | Tác động | Cách hệ thống phản ứng |
|-----------------|----------|----------------------|
| **Payment Gateway** | Thanh toán không thực hiện được | Circuit Breaker mở sau 5 lỗi (ADR-07). Tính năng không liên quan (xem workshop, check-in, AI summary) vẫn hoạt động. Workshop miễn phí không bị ảnh hưởng. |
| **Redis** | Cache miss, rate limiting tắt, job queue bị treo | Cache miss → đọc từ DB (correctness vẫn đúng, chỉ chậm hơn). Rate limiting tắt → OL ở DB vẫn bảo vệ seat contention. Job queue treo → AI summary không xử lý, workshop vẫn hoạt động. |
| **AI Provider (DeepSeek)** | AI summary không tạo được | `summary_status = 'FAILED'`. Workshop và registration hoàn toàn không bị ảnh hưởng — summary là enrichment, không phải critical path. |
| **PostgreSQL** | Toàn bộ hệ thống ngừng hoạt động | Single-node, không có replica. Nếu DB down, toàn bộ API không thể xử lý request. Đây là SPOF được chấp nhận (theo ràng buộc — không Kubernetes, không cloud managed services). |
| **Email Server (SMTP)** | Notification không gửi được | Notification là best-effort (ADR-09). Business flow không phụ thuộc vào kết quả gửi. Lỗi được log vào `notification_logs` để BTC truy vấn và retry thủ công. |
| **Mạng mobile (tòa nhà)** | Mobile app mất kết nối | Offline check-in với SQLite local (ADR-11). Staff quét QR → ghi local → sync batch khi có mạng. Dữ liệu không mất. |

---

## 2. C4 Diagram

Xem chi tiết trong `docs/blueprint/diagrams/`:

| Level | File | Nội dung |
|-------|------|---------|
| **Level 1 — System Context** | [`diagrams/c4-context.md`](./diagrams/c4-context.md) | Actors (3 nhóm người dùng), hệ thống ngoài (5), luồng tương tác chính |
| **Level 2 — Container** | [`diagrams/c4-container.md`](./diagrams/c4-container.md) | 6 container với công nghệ, vai trò, giao thức giao tiếp chi tiết |

---

### 3. High-Level Architecture Diagram

Sơ đồ kiến trúc tổng quan thể hiện **luồng dữ liệu và sự phụ thuộc** giữa tất cả thành phần, tập trung vào ba điểm tích hợp ngoài (Legacy Student System, Payment Gateway, AI Provider) và luồng check-in offline (Mobile App ↔ SQLite → sync). Sơ đồ hoạt động ở mức data-flow, không phải deployment.

Xem chi tiết tại: [`diagrams/high-level-architecture.md`](./diagrams/high-level-architecture.md)

**Bốn luồng chính được thể hiện:**

| Luồng | Điểm tích hợp đặc biệt |
| ----- | ---------------------- |
| Đăng ký + Thanh toán có phí | Payment Gateway — bảo vệ bởi Circuit Breaker (Redis), idempotency key forwarded |
| Check-in offline (Mobile) | SQLite local → batch sync → server-wins conflict resolution |
| CSV nightly import | Legacy System one-way drop → Object Storage → Batch pipeline idempotent |
| AI Summary (PDF) | Object Storage → BullMQ → DeepSeek — hoàn toàn async, không block workshop |
