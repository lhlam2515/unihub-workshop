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
│  │  Redis Streams (qua BullMQ)                              ││
│  │  • stream:ai-summary   — AI PDF processing queue         ││
│  │  • stream:notifications — Batch notification dispatch    ││
│  │  • DLQ streams cho retry-exhausted jobs                  ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────--┐
│  5. Storage & State Layer                                     │
│  ┌──────────────────-┐  ┌─────────────────┐  ┌────────────-─┐ │
│  │  PostgreSQL       │  │  Redis          │  │  File System │ │
│  │  (Neon Serverless)│  │  (Upstash)      │  │  PDF upload  │ │
│  │  • ACID giao dịch │  │  • Cache (TTL)  │  │  CSV input   │ │
│  │  • Source of truth│  │  • Rate limit   │  └─────────────-┘ │
│  │  • Drizzle ORM    │  │  • Job queue    │                   │
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
| Messaging | Redis Streams (qua BullMQ) | Job queue cho AI summary + notification |
| Storage — Primary | PostgreSQL (Neon Serverless) | ACID, source of truth, upsert idempotent |
| Storage — Cache | Redis (Upstash) | Cache-aside, sliding window, queue |
| Storage — File | Local Docker volume | PDF upload, CSV input, error quarantine |

### 1.4 Hệ thống gồm những phần nào?

Hệ thống gồm **8 thành phần chính**:

1. **Web Portal (Next.js SPA):** Giao diện cho sinh viên (xem workshop, đăng ký, thanh toán, xem QR) và ban tổ chức (quản lý workshop, xem thống kê, upload PDF).
2. **Mobile App (Expo + SQLite):** Giao diện dành riêng cho nhân sự check-in. Hoạt động offline: quét QR → ghi local → sync khi có mạng.
3. **Backend API (NestJS Monolith):** Xử lý toàn bộ logic nghiệp vụ — đăng ký, thanh toán, xác thực, AI summary, CSV sync. Một process duy nhất với 9 module nội bộ.
4. **PostgreSQL:** Lưu trữ chính — sinh viên, staff, workshop, registration, payment, check-in, idempotency keys, audit logs. Single source of truth.
5. **Redis:** Ba vai trò — cache (workshop list, seats_available), rate limiting (sliding window counters), job queue (Redis Streams cho AI + notification).
6. **File Storage (Docker volume):** Lưu PDF workshop upload, CSV đầu vào từ hệ thống sinh viên, file lỗi quarantine.
7. **Hệ thống ngoài — Payment Gateway (Mock):** Xử lý thanh toán. Dùng mock server (Wiremock) để kiểm thử failure mode.
8. **Hệ thống ngoài — AI Provider (OpenAI API):** Tạo summary từ PDF. Abstract qua `AIProvider` interface để dễ swap.

### 1.5 Các thành phần giao tiếp với nhau như thế nào?

| Từ | Đến | Giao thức / Cơ chế | Hướng | Dữ liệu |
|----|-----|-------------------|-------|---------|
| Web Portal | Backend API | HTTPS (REST JSON) | Hai chiều | Workshop, registration, payment, auth |
| Mobile App | Backend API | HTTPS (REST JSON) | Hai chiều | Check-in sync, QR validation |
| Backend API | PostgreSQL | TCP (Drizzle ORM driver) | Hai chiều | All persistent data |
| Backend API | Redis | TCP (ioredis) | Hai chiều | Cache, rate limit counters, job queue |
| Backend API | AI Provider (OpenAI) | HTTPS (REST) | Một chiều ra | PDF content → summary text |
| Backend API | Payment Gateway | HTTPS (REST, Wiremock) | Hai chiều | Payment request + response |
| Backend API | Email Server (SMTP) | SMTP | Một chiều ra | Email notification |
| Backend API | File System | Filesystem I/O | Hai chiều | PDF read/write, CSV read |
| Legacy Student System | Backend API | CSV file polling | Một chiều vào | Student data (cron 2AM) |

**Nguyên tắc giao tiếp:**

- Giao tiếp đồng bộ (HTTP REST) cho các luồng cần kết quả tức thời: xem workshop, đăng ký, thanh toán, xác thực
- Giao tiếp bất đồng bộ (Redis Streams) cho các tác vụ không real-time: AI summary, batch notification
- Giao tiếp một chiều (file polling) cho tích hợp với legacy system — không có API để gọi ngược

### 1.6 Khi một thành phần gặp sự cố?

| Thành phần sự cố | Tác động | Cách hệ thống phản ứng |
|-----------------|----------|----------------------|
| **Payment Gateway** | Thanh toán không thực hiện được | Circuit Breaker mở sau 5 lỗi (ADR-07). Tính năng không liên quan (xem workshop, check-in, AI summary) vẫn hoạt động. Workshop miễn phí không bị ảnh hưởng. |
| **Redis** | Cache miss, rate limiting tắt, job queue bị treo | Cache miss → đọc từ DB (correctness vẫn đúng, chỉ chậm hơn). Rate limiting tắt → OL ở DB vẫn bảo vệ seat contention. Job queue treo → AI summary không xử lý, workshop vẫn hoạt động. |
| **AI Provider (OpenAI)** | AI summary không tạo được | `summary_status = 'failed'`. Workshop và registration hoàn toàn không bị ảnh hưởng — summary là enrichment, không phải critical path. |
| **PostgreSQL** | Toàn bộ hệ thống ngừng hoạt động | Single-node, không có replica. Nếu DB down, toàn bộ API không thể xử lý request. Đây là SPOF được chấp nhận (theo ràng buộc — không Kubernetes, không cloud managed services). |
| **Email Server (SMTP)** | Notification không gửi được | Notification là best-effort (ADR-09). Business flow không phụ thuộc vào kết quả gửi. Lỗi được log vào `notification_logs` để BTC truy vấn và retry thủ công. |
| **Mạng mobile (tòa nhà)** | Mobile app mất kết nối | Offline check-in với SQLite local (ADR-11). Staff quét QR → ghi local → sync batch khi có mạng. Dữ liệu không mất. |

---

## 2. C4 Diagram

### 2.1 Level 1 — System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                         UniHub Workshop                         │
│                     (Hệ thống đăng ký & check-in)               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  [Sinh viên] ───(HTTPS)──→ Xem lịch, đăng ký,           │    │
│  │                              thanh toán, xem QR         │    │
│  │                                                         │    │
│  │  [Ban tổ chức] ───(HTTPS)──→ Quản lý workshop,          │    │
│  │                              xem thống kê, upload PDF   │    │
│  │                                                         │    │
│  │  [Nhân sự check-in] ─(HTTPS)→ Quét QR, ghi nhận         │    │
│  │                              check-in (offline-capable) │    │
│  │                                                         │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │                                                         │    │
│  │  ═══(HTTPS)═══→ [Payment Gateway] (Mock)                │    │
│  │  ═══(HTTPS)═══→ [AI Provider] (OpenAI)                  │    │
│  │  ═══(SMTP)════→ [Email Server]                          │    │
│  │  ←──(CSV)───── [Legacy Student System] (file export)    │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Ba nhóm người dùng (Actors):**

| Actor | Vai trò | Tương tác với hệ thống |
|-------|---------|----------------------|
| **Sinh viên** | ~12.000 người, đăng ký workshop | Xem danh sách/chi tiết workshop, đăng ký (free/có phí), thanh toán, nhận mã QR, check-in khi tham dự |
| **Ban tổ chức (BTC)** | Quản trị viên nội bộ | Tạo/sửa/hủy workshop, upload PDF cho AI summary, xem thống kê đăng ký, quản lý staff check-in |
| **Nhân sự check-in** | Staff tại cửa phòng | Quét mã QR của sinh viên bằng mobile app, xem lịch sử check-in của chính mình |

**Bốn hệ thống ngoài (External Systems):**

| Hệ thống | Tương tác | Phương thức | Hướng | Ghi chú |
|----------|-----------|-------------|-------|---------|
| **Payment Gateway** | Xử lý thanh toán online | HTTPS REST API | Backend → Gateway (request) + ← (response) | Mock server (Wiremock) để test failure mode. Nằm ngoài phạm vi (không có tài khoản production). |
| **AI Provider (OpenAI)** | Tạo tóm tắt nội dung PDF | HTTPS REST API | Backend → Provider | Abstract qua `AIProvider` interface. Có thể swap sang Claude/Anthropic. |
| **Legacy Student System** | Cung cấp dữ liệu sinh viên | CSV file export (hàng đêm) | Legacy → Backend (one-way) | Không có API. Backup duy nhất qua file CSV. Pipeline chạy cron 2AM. |
| **Email Server (SMTP)** | Gửi email xác nhận | SMTP | Backend → Email Server | Dùng SMTP service (mock hoặc Mailpit cho dev). |

**Mô tả các luồng tương tác chính:**

1. **Sinh viên → UniHub Workshop:** Xem danh sách workshop, đăng ký (qua HTTPS). Sau đăng ký, hệ thống gửi email xác nhận qua Email Server.
2. **Sinh viên → Payment Gateway (qua UniHub):** Khi đăng ký workshop có phí, UniHub gọi Payment Gateway để xử lý thanh toán.
3. **UniHub → AI Provider:** Khi BTC upload PDF, UniHub gửi nội dung PDF sang AI Provider để tạo summary.
4. **Legacy System → UniHub:** Hàng đêm, UniHub polling file CSV từ Legacy System để cập nhật dữ liệu sinh viên.

### 2.2 Level 2 — Container

Container ở đây là **đơn vị triển khai độc lập** — mỗi container có thể chạy riêng, có công nghệ và giao thức giao tiếp riêng.

```
┌──────────────────────────────────────────────────────────────────┐
│                     UniHub Workshop                              │
│                                                                  │
│  ┌──────────────────────┐    ┌─────────────────────────────┐     │
│  │  [Web Portal]        │    │  [Mobile App]               │     │
│  │  Next.js 16 SPA      │    │  Expo + React Native        │     │
│  │  React 19, Tailwind  │    │  SQLite (local cache)       │     │
│  │  shadcn/ui           │    │  NativeWind                 │     │
│  └────────┬─────────────┘    └────────────-─┬──────────────┘     │
│           │ HTTPS (REST)                    │ HTTPS (REST)       │
│           │ /api/v1/*                       │ /api/v1/*          │
│           ▼                                 ▼                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              [Backend API]                               │    │
│  │  NestJS 11 — Modular Monolith (9 modules)                │    │
│  │  Express HTTP server, Drizzle ORM, ioredis, BullMQ       │    │
│  │  Zod v4, bcrypt, passport-jwt, Winston                   │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────────────┐ │    │
│  │  │  Modules: booking, catalog, payment, notification,  │ │    │
│  │  │  checkin, ai-summary, csv-sync, iam, rate-limit,    │ │    │
│  │  │  background (cron + workers)                        │ │    │
│  │  └─────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│           │                    │                    │            │
│           │ TCP (Drizzle)      │ TCP (ioredis)      │ Filesystem │
│           ▼                    ▼                    ▼            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐      │
│  │ [PostgreSQL] │   │   [Redis]    │   │ [File Storage]   │      │
│  │ Neon         │   │ Valkey/Redis │   │ Docker volume    │      │
│  │ Serverless   │   │ Cache+Queue  │   │ /uploads (PDF)   │      │
│  │ 16+          │   │ Rate Limit   │   │ /input (CSV)     │      │
│  └──────────────┘   └──────────────┘   │ /errors (CSV)    │      │
│                                        └──────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

**Chi tiết từng container:**

#### Container 1: Web Portal

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Vai trò | Cung cấp giao diện web cho sinh viên (xem lịch, đăng ký, thanh toán, xem QR) và ban tổ chức (quản lý workshop, thống kê, upload PDF) |
| Giao tiếp với Backend | HTTPS REST — gọi `/api/v1/*` qua HTTP client với JWT access token |
| Giao tiếp với CDN | Next.js static assets được phục vụ qua CDN |
| Giao tiếp với người dùng | Browser rendering HTML/CSS/JS, form submission, polling cho AI summary status |
| Số lượng instance | 1 (Docker container) |
| Phụ thuộc | Backend API (mất API → web không hoạt động) |

#### Container 2: Mobile App

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | Expo SDK, React Native, TypeScript, SQLite (expo-sqlite + Drizzle ORM), NativeWind (Tailwind CSS v3) |
| Vai trò | Ứng dụng dành riêng cho nhân sự check-in. Quét mã QR, ghi nhận check-in offline, tự đồng bộ khi có mạng |
| Giao tiếp với Backend | HTTPS REST — sync batch 50 records/request, JWT access token (8 giờ cho mobile) |
| Offline capability | SQLite local — `local_checkins` table với `pending`/`synced`/`rejected`/`duplicate` status. Hoạt động không cần mạng |
| Conflict resolution | Server-wins, first-check-in-wins (`ON CONFLICT (registration_id) DO NOTHING`) |
| Số lượng instance | Nhiều (mỗi staff một device) |
| Phụ thuộc | Backend API (chỉ khi sync; offline hoàn toàn độc lập) |

#### Container 3: Backend API

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | NestJS 11, TypeScript, Express HTTP, Drizzle ORM, ioredis, BullMQ, Zod v4, bcrypt, passport-jwt, Winston |
| Vai trò | Xử lý toàn bộ logic nghiệp vụ. Modular Monolith với 9 module nội bộ (booking, catalog, payment, notification, checkin, ai-summary, csv-sync, iam, rate-limit, background) |
| Giao tiếp với client | HTTPS REST (JSON) |
| Giao tiếp với PostgreSQL | TCP — Drizzle ORM connection pool (singleton, max 20 connections) |
| Giao tiếp với Redis | TCP — ioredis client, 3 logical databases (DB0: cache LRU, DB1: streams noeviction, DB2: rate limit volatile-ttl) |
| Giao tiếp với File System | Local filesystem — đọc/ghi PDF, CSV |
| Giao tiếp với external | HTTPS — Payment Gateway, AI Provider; SMTP — Email Server |
| Không giao tiếp với | Không gọi ngược Legacy System (one-way CSV only) |
| Vòng đời request | Guard (JWT + RBAC) → Validation (Zod) → Controller → Service (Result<T>) → ResponseInterceptor → GlobalExceptionFilter |
| Số lượng instance | 1 (Modular Monolith, single process) |
| Phụ thuộc | PostgreSQL (cứng), Redis (mềm — degrade có kiểm soát) |

#### Container 4: PostgreSQL

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | PostgreSQL 16+ (Neon Serverless) |
| Vai trò | Primary database — single source of truth. Lưu: students, staff, workshops, registrations, payments, checkins, idempotency_keys, import_logs, notification_logs |
| Schema | 9 tables, optimized với partial indexes + composite UNIQUE constraints (xem ADR-02) |
| ACID | Row-level locking cho Optimistic Locking (ADR-03), `ON CONFLICT` cho idempotent upsert (ADR-08, ADR-12) |
| Connection pool | Max 20 connections, server-side pooling qua Neon |
| Số lượng instance | 1 (single-node — SPOF được chấp nhận) |

#### Container 5: Redis

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | Upstash/Redis 7+ |
| Vai trò | Ba nhiệm vụ độc lập trên 3 logical databases |
| DB0 — Cache | Cache-Aside, TTL 10s (seats_available), TTL 60s (workshop list). `maxmemory-policy: allkeys-lru` |
| DB1 — Job Queue | Redis Streams cho AI summary + notification workers. `maxmemory-policy: noeviction` |
| DB2 — Rate Limiting | Sliding Window Sorted Set. `maxmemory-policy: volatile-ttl` |
| Số lượng instance | 1 (single-node — degrade có kiểm soát khi mất Redis) |

#### Container 6: File Storage

| Thuộc tính | Giá trị |
|-----------|---------|
| Công nghệ | Docker volume (local filesystem) |
| Vai trò | Lưu trữ file tĩnh: PDF workshop, CSV đầu vào, file lỗi quarantine |
| Thư mục | `/uploads/workshops/{id}.pdf`, `/input/students_YYYY-MM-DD.csv`, `/errors/YYYY-MM-DD.csv` |
| Backup | Nằm trong Docker volume — không có replication (chấp nhận được cho đồ án) |
| Số lượng instance | 1 (Docker volume gắn vào backend container) |
