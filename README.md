# UniHub Workshop

Hệ thống quản lý toàn bộ vòng đời Workshop trường đại học: tạo sự kiện, đăng ký (miễn phí & có phí), thanh toán, điểm danh QR (online + offline), và đồng bộ dữ liệu sinh viên từ CSV.

**Stack:** NestJS 11 · Next.js 16 · Expo (React Native) · PostgreSQL (Neon) · Redis · BullMQ · Drizzle ORM

---

## Yêu cầu cài đặt

| Công cụ | Phiên bản | Ghi chú |
|---------|-----------|---------|
| Node.js | >= 18 | |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@9.0.0 --activate` |
| PostgreSQL | Neon Serverless | Free tier tại [console.neon.tech](https://console.neon.tech) |
| Redis | Bất kỳ (ioredis) | Free tier: [Upstash](https://upstash.com), hoặc local `redis://localhost:6379` |
| Cloudflare R2 | — | Free tier, dùng cho tính năng PDF upload (AI Summary) |
| DeepSeek API | — | Key tại [platform.deepseek.com](https://platform.deepseek.com) |

---

## Khởi chạy nhanh

### 1. Clone và cài đặt

```sh
git clone <repo-url>
cd unihub-workshop
pnpm install
```

### 2. Cấu hình biến môi trường

```sh
# Backend (bắt buộc)
cp apps/server/.env.example apps/server/.env

# Web frontend (tuỳ chọn — đã có giá trị mặc định)
cp apps/web/.env.example apps/web/.env
```

Mở `apps/server/.env` và điền các giá trị bắt buộc:

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `DATABASE_MIGRATION_URL` | ✅ | Thường giống `DATABASE_URL` — dùng riêng cho drizzle-kit |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_PRIVATE_KEY` | ✅ | RSA-2048 private key (base64-encoded) |
| `JWT_PUBLIC_KEY` | ✅ | RSA-2048 public key (base64-encoded) |
| `JWT_SECRET` | ✅ | Chuỗi ngẫu nhiên >= 32 ký tự |
| `JWT_REFRESH_SECRET` | ✅ | Chuỗi ngẫu nhiên >= 32 ký tự |
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `R2_*` | ✅ | Cloudflare R2 credentials (6 biến) |
| `FRONTEND_URL` | — | Mặc định `http://localhost:3000` |
| `PORT` | — | Mặc định `8000` |

**Tạo RSA key pair cho JWT:**

```sh
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# base64-encode và copy vào .env
base64 -w 0 private.pem   # → JWT_PRIVATE_KEY
base64 -w 0 public.pem    # → JWT_PUBLIC_KEY

# Tạo JWT_SECRET và JWT_REFRESH_SECRET
openssl rand -base64 32   # chạy 2 lần, mỗi lần cho một biến
```

> Xem `apps/server/.env.example` để biết mô tả đầy đủ tất cả biến môi trường.

### 3. Chạy migrations

```sh
cd apps/server
pnpm db:migrate
cd ../..
```

### 4. Seed dữ liệu mẫu

```sh
pnpm db:seed
```

Hoặc dùng script hỗ trợ (thực hiện cả migrate + seed):

```sh
bash data/setup.sh
```

### 5. Khởi chạy

```sh
# Chạy tất cả apps cùng lúc
pnpm dev

# Hoặc chạy riêng từng app
pnpm dev:server    # NestJS backend   → http://localhost:8000/api/v1
pnpm dev:web       # Next.js web      → http://localhost:3000
pnpm dev:mobile    # Expo mobile app  → QR code in terminal
```

---

## Tài khoản mặc định

Mật khẩu tất cả tài khoản: **`123456789`**

| Vai trò | Email | App | Quyền hạn |
|---------|-------|-----|-----------|
| BTC (Ban Tổ Chức) | `btc.admin@unihub.edu.vn` | Web | Tạo/sửa/hủy workshop, xem thống kê, quản lý hệ thống |
| Check-in Staff | `checkin1@unihub.edu.vn` | Mobile | Quét mã QR tại cửa phòng |
| Check-in Staff | `checkin2@unihub.edu.vn` | Mobile | Quét mã QR tại cửa phòng |
| Sinh viên | `sv23127001@student.edu.vn` | Web | Xem + đăng ký workshop |
| Sinh viên | `sv23127050@student.edu.vn` | Web | Xem + đăng ký workshop |

> Sinh viên có MSSV từ `23127001` đến `23127500`, email `sv{mssv}@student.edu.vn`.

---

## Kiểm tra tính năng

| Tính năng | Cách test |
|-----------|-----------|
| Đăng ký workshop | Đăng nhập sinh viên → Browse → Đăng ký workshop free |
| Thanh toán | Đăng ký workshop có phí → Checkout (mock gateway) |
| Nhận QR code | Sau đăng ký thành công → Xem ticket trong "Registrations" |
| Check-in online | App mobile → Đăng nhập checkin1 → Quét QR |
| Check-in offline | Tắt mạng app mobile → Quét QR → Bật lại mạng → Sync |
| AI Summary | Đăng nhập BTC → Workshop detail → Upload PDF |
| CSV Sync | BTC → System Health → Student Sync → Upload `data/students_2025-05-17.csv` |
| Rate limiting | Gửi nhiều request liên tiếp → Quan sát 429 response |
| Circuit breaker | Cấu hình gateway lỗi → Thử thanh toán → Quan sát trạng thái breaker |

---

## Cấu trúc thư mục

```
unihub-workshop/
├── apps/
│   ├── server/         # NestJS 11 — Modular Monolith
│   │   ├── src/
│   │   │   ├── core/           # Guards, filters, interceptors, JWT/RBAC
│   │   │   ├── infra/          # Database, Redis, Messaging, Storage
│   │   │   └── modules/        # iam · catalog · booking · checkin
│   │   │                       # background · notification · payment
│   │   │                       # ai-summary · csv-sync · rate-limit
│   │   └── scripts/seed.ts     # Seed script
│   ├── web/            # Next.js 16 App Router — Student + Organizer portal
│   └── mobile/         # Expo SDK 54 — Check-in Staff (Offline-First)
├── packages/
│   ├── eslint-config/  # Shared ESLint + eslint-plugin-boundaries
│   └── agent-config/   # Syncs .agents/ → .claude/ và .github/
├── data/
│   ├── README.md       # Hướng dẫn seed & tài khoản mặc định
│   ├── setup.sh        # Script tự động migrate + seed
│   └── students_*.csv  # File CSV mẫu cho tính năng Student Sync
└── docs/
    ├── srs.md          # 50 functional requirements, 40 business rules
    └── screens.md      # 39-screen UI specification
```

---

## Kiến trúc hệ thống

### Backend (`apps/server`)

NestJS Modular Monolith với kiến trúc phân lớp nghiêm ngặt và Railway Oriented Programming (`Result<T, AppError>`).

| Module | Domain |
|--------|--------|
| `iam` | Authentication (JWT RS256), RBAC, token blacklist |
| `catalog` | Workshop CRUD, rooms, speakers, publishing |
| `booking` | Registration, seat locking (Redis), idempotency key |
| `payment` | Payment flow, circuit breaker, webhook reconciliation |
| `checkin` | QR validation, online/offline check-in, batch sync |
| `notification` | Email/App/Telegram (BullMQ async, pluggable channel) |
| `ai-summary` | PDF upload → DeepSeek AI → workshop summary |
| `csv-sync` | Nightly CSV import, validation, duplicate handling |
| `rate-limit` | Token Bucket rate limiting per IP/user |
| `background` | Cron jobs, payment timeout, Redis reconciliation |

**Request lifecycle:** Guard (JWT+RBAC) → ZodValidationPipe → Controller → Service → `Result<T>` → ResponseInterceptor → GlobalExceptionFilter

### Web Portal (`apps/web`)

Next.js 16 App Router, Pragmatic Feature-Sliced Design.

**Route groups:** `(public)` — browse | `(auth)` — login | `(student)` — tickets & payments | `(admin)` — workshop management, system health

### Mobile App (`apps/mobile`)

Expo Router, offline-first. Dùng **duy nhất** cho nhân sự check-in.

**Offline flow:** Pre-load tickets → SQLite → Scan QR → Validate locally → Queue → Batch sync (`INSERT ON CONFLICT DO NOTHING`)

---

## Các cơ chế kỹ thuật chính

| Cơ chế | Vị trí | Mô tả |
|--------|--------|-------|
| **Rate Limiting** | `modules/rate-limit` | Token Bucket, 10 req/10s mặc định |
| **Circuit Breaker** | `modules/payment` | Redis-based: CLOSED → OPEN (5 lỗi) → HALF-OPEN (30s) |
| **Idempotency Key** | `modules/booking` | Redis SET NX + DB unique constraint (2 lớp) |
| **Seat Lock** | `modules/booking` | Redis DECRBY atomic, TTL 15 phút |
| **Offline Check-in** | `apps/mobile` | SQLite cache + sync queue |
| **Async Notification** | `modules/notification` | BullMQ, không block main request |

---

## Commands tham khảo

```sh
# Development
pnpm dev                # tất cả apps
pnpm dev:server         # chỉ backend (port 8000)
pnpm dev:web            # chỉ web (port 3000)

# Database
cd apps/server
pnpm db:migrate         # áp dụng migrations
pnpm db:generate        # tạo file migration từ schema
pnpm db:push            # push trực tiếp (prototyping)
pnpm db:seed            # xóa và seed lại toàn bộ dữ liệu

# Build & Quality
pnpm build              # build tất cả apps
pnpm lint               # lint check
pnpm check-types        # TypeScript type check
pnpm check              # lint + type check + build

# Tests (backend)
cd apps/server
pnpm test               # unit tests
pnpm test:cov           # coverage report
pnpm test:e2e           # end-to-end tests
```
