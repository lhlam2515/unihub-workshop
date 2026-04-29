# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Lint, Test

```sh
pnpm dev           # all apps in parallel
pnpm dev:server    # NestJS backend
pnpm dev:web       # Next.js web (port 3000)
pnpm dev:mobile    # Expo mobile
pnpm build         # all apps
pnpm lint          # all apps
pnpm format        # prettier all
pnpm check-types   # all apps
```

**Single-app filters:** `pnpm dev --filter=server`, `pnpm lint --filter=web`

**Server-specific:**

```sh
cd apps/server
pnpm test              # jest unit tests
pnpm test:watch        # jest watch mode
pnpm test:e2e          # e2e tests (separate config)
pnpm db:generate       # drizzle-kit generate migrations
pnpm db:migrate        # drizzle-kit migrate
pnpm db:push           # drizzle-kit push (prototyping)
```

**Web-specific:** `cd apps/web && pnpm dev` (Next.js dev), `pnpm lint:fix`, `pnpm format`

**Mobile-specific:** `cd apps/mobile && pnpm dev` (Expo), `pnpm android`, `pnpm ios`

Package manager is `pnpm@9.0.0`. Node >= 18.

## Repository Architecture

```
unihub-workshop/
├── apps/
│   ├── server/     # NestJS 11 backend (Modular Monolith)
│   ├── web/        # Next.js 16 App Router (Pragmatic FSD)
│   └── mobile/     # Expo Router + React Native (Offline-First)
├── packages/
│   └── eslint-config/   # Shared ESLint config (CJS, eslint-plugin-boundaries)
├── docs/
│   ├── srs.md           # Full system spec: 50 FRs, 40 BRs, traceability matrix
│   └── screens.md       # 39-screen UI spec (31 web, 8 mobile)
└── .agents/rules/       # Agent rules (symlinked into .claude/rules/)
```

This is a **university workshop management system** handling the full lifecycle: workshop creation, student registration, payment processing, QR ticket check-in (online + offline), and student data sync.

## Backend: Modular Monolith (apps/server)

The server follows **strict layered architecture** + **Result pattern (Railway Oriented Programming)**.

**Directories by architectural role:**

- `src/core/` — Framework config: guards, filters, interceptors, JWT/RBAC
- `src/database/` — Drizzle ORM schemas, migrations, inferred types (single source of truth)
- `src/shared/` — Cross-cutting: `Result<T>` type, Redis helpers, error types, response builder
- `src/modules/` — Bounded contexts:

| Module | Domain |
|--------|--------|
| `iam` | Auth, JWT tokens, RBAC, token blacklist |
| `catalog` | Workshop CRUD, rooms, speakers, publishing |
| `booking` | Registration, seat locking (Redis), idempotency |
| `checkin` | QR validation, online/offline check-in, sync |
| `background` | Cron jobs, payment timeout, reconciliation, circuit breaker |

**5-stage request lifecycle:** Guard/Auth → ZodValidationPipe → Service (returns `Result<T, AppError>`) → ResponseInterceptor (maps Result to HTTP) → GlobalExceptionFilter

**Key rules:**

- Services NEVER throw exceptions — always return `Result.ok()` or `Result.fail()`
- Controllers stay thin: extract params, call service, return Result
- Repositories wrap Drizzle calls in `tryCatch(..., err => systemErrors.internal(...))`
- Cross-module communication: only Service → Service (not Service → Repository of another module)
- Response DTOs (`from()` factory) always strip internal DB fields before returning to client
- IDOR prevention: `STUDENT` queries force `WHERE student_id = jwt.sub`

**Tech stack:** Neon Serverless (PostgreSQL), Drizzle ORM, Redis (ioredis), BullMQ, Zod v4, nestjs-zod, bcrypt, passport-jwt, Winston logger

## Frontend Web: Pragmatic FSD (apps/web)

Next.js 16 App Router with Tailwind CSS v4, shadcn/ui, React 19.

**Layer structure (top-down):**

- `src/app/` — Route groups: `(public)`, `(auth)`, `(student)`, `(admin)`. Pages fetch data, pass to widgets.
- `src/widgets/` — Dumb orchestrators composing entities + features. Never fetch data directly.
- `src/features/` — One user workflow per folder: `api/` (service + server action), `components/`, `lib/` (schemas). Features cannot import other features.
- `src/components/` — Shared entity cards, badges, shadcn/ui primitives. Stateless, no API calls.
- `src/lib/api/client/` — Centralized HTTP client with token injection, 401 interceptor, structured `ApiError`

**Data flow:** Page → Widget → Feature Service → api client → NestJS backend
**Error flow:** ApiError → Feature Service wraps in `Result<T>` → Server Action checks result, calls `handleError()`, revalidates cache on success

## Mobile App: Offline-First (apps/mobile)

Expo Router with React Native, NativeWind (Tailwind v3), SQLite local storage.

Used **exclusively by Check-in Staff** for QR scanning at workshop venues. Must work with unreliable WiFi.

- `src/database/` — Drizzle ORM + expo-sqlite for offline ticket cache and check-in queue
- `src/features/` — Same FSD pattern as web
- `src/lib/api/client/` — Shared HTTP client with Keychain-based token storage, auto-refresh on 401
- Offline check-in flow: scan QR → validate locally against SQLite cache → queue to `offline_checkin_queue` → batch sync when online with `INSERT ON CONFLICT DO NOTHING`

## Shared Packages

- `@repo/eslint-config` — CJS-based shared config with `eslint-plugin-boundaries` enforcing layer import rules for both frontend and backend

## Naming Conventions

All code follows strict naming rules (documented in `.agents/rules/naming-convention.md`):

- **Directories/files:** `kebab-case` (except React components)
- **Backend files:** `[resource].[layer].ts` (e.g., `catalog.service.ts`)
- **React components:** `PascalCase` matching filename (e.g., `QuestionCard.tsx`)
- **NestJS classes:** `PascalCase` with role suffix (`WorkshopsAdminController`, `CatalogService`, `RegistrationsRepository`)
- **Frontend widgets:** `[Domain][Context]Widget` (never use verbs)
- **DTOs:** `[Action][Resource]Dto` (request), `[Resource]ResponseDto` (response)
- **Zod schemas:** `[Action][Resource]Schema`
- **Functions:** `camelCase`, CQS prefix (`get`, `find`, `list` for queries; `create`, `update`, `cancel` for commands)
- **Booleans:** `is`, `has`, `should`, `can` prefix
- **Constants:** `UPPER_SNAKE_CASE`

## Key Design Decisions

1. **Hybrid storage:** Redis is source of truth for real-time seat counters (`seat:available:{wid}`); PostgreSQL for persistent data. Reconciliation job runs every 10 min.
2. **Result pattern everywhere:** Backend services return `Result<T, AppError>`; frontend services wrap API calls in `Result<T>`. No throwing across layers.
3. **Dual-token auth:** Access token (Web: 15min, Mobile: 8hr) + Refresh token (7 days). Web uses HttpOnly cookie; Mobile uses Keychain.
4. **Idempotency:** Payment operations use Redis `SET NX` (Layer 1) + DB unique constraint (Layer 2).
5. **Circuit Breaker:** Payment gateway calls protected with Redis-based circuit breaker (CLOSED → OPEN after 5 failures, HALF-OPEN after 30s).
6. **Offline-first mobile:** Check-in staff pre-load active tickets to SQLite; offline scans validated locally; batch sync with idempotent `ON CONFLICT DO NOTHING`.
7. **Notification via Message Queue:** All notifications (email, push, Telegram) dispatched async via BullMQ, never blocking the main request flow.

## SQL & Database

- Use Drizzle ORM (not raw SQL or Prisma)
- Database: Neon Serverless PostgreSQL
- Schema files: `apps/server/src/database/schema/`
- Migrations: `apps/server/src/database/migrations/`
- Mobile local DB: expo-sqlite + Drizzle, schema at `apps/mobile/src/database/schema/`
