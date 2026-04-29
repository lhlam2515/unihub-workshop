# UniHub Workshop

Hệ thống quản lý toàn bộ vòng đời Workshop trường đại học — tạo sự kiện, đăng ký, thanh toán, điểm danh ngoại tuyến, và đồng bộ dữ liệu sinh viên.

## Prerequisites

- **Node.js** >= 18
- **pnpm** 9.x (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- **PostgreSQL** (Neon Serverless used in production)
- **Redis** (for seat counters, rate limiting, token blacklist, circuit breaker)

## Getting Started

```sh
# Clone and install
git clone <repo-url>
cd unihub-workshop
pnpm install

# Set up environment
cp .env.local .env
# Edit .env with your DATABASE_URL and REDIS_URL
```

### Environment Variables

Each app may need its own `.env`. Key variables:

| Variable | App | Description |
|----------|-----|-------------|
| `DATABASE_URL` | server | Neon PostgreSQL connection string |
| `REDIS_URL` | server | Redis connection string (ioredis compatible) |
| `NEXT_PUBLIC_API_URL` | web | Base URL for the NestJS API (default: `http://localhost:3001/api/v1`) |
| `PORT` | server | Server listen port (default: 3000) |

## Development

```sh
# Run all apps in parallel
pnpm dev

# Run specific apps
pnpm dev:server    # NestJS backend (port 3000)
pnpm dev:web       # Next.js web (port 3000)
pnpm dev:mobile    # Expo mobile

# With turborepo filters
pnpm dev --filter=server
pnpm dev --filter=web
```

### Database (Server)

```sh
cd apps/server

# Generate migration files from schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Push schema directly (prototyping only)
pnpm db:push
```

### Other Tasks

```sh
pnpm build         # build all apps
pnpm lint          # lint all apps
pnpm format        # prettier all apps
pnpm check-types   # type-check all apps
```

### Testing (Server)

```sh
cd apps/server
pnpm test              # unit tests
pnpm test:watch        # watch mode
pnpm test:cov          # coverage report
pnpm test:e2e          # end-to-end tests

# Run a single test
pnpm test -- --testPathPattern=auth -t "should return 401"
```

## Project Structure

```
unihub-workshop/
├── apps/
│   ├── server/         # NestJS 11 backend (Modular Monolith)
│   ├── web/            # Next.js 16 web portal (Student + Organizer)
│   └── mobile/         # Expo mobile app (Check-in Staff, Offline-First)
├── packages/
│   └── eslint-config/  # shared ESLint + eslint-plugin-boundaries
├── docs/
│   ├── srs.md          # system spec: 50 functional requirements, 40 business rules
│   └── screens.md      # 39-screen UI specification
├── .agents/            # single source of truth for AI agent configuration
│   ├── rules/          # coding rules (naming, architecture, JSDoc, context7)
│   ├── skills/         # agent skills (19 total)
│   └── commands/       # slash command definitions (opsx)
├── .claude/            # Claude Code — symlinks → .agents/
│   ├── settings.json   # MCP servers + permissions (committed)
│   └── settings.local.json  # personal env vars (gitignored)
├── .github/
│   ├── skills/         # GitHub Copilot — symlinks → .agents/skills/
│   └── prompts/        # Copilot prompt templates
├── CLAUDE.md           # root agent guidance
└── apps/*/CLAUDE.md    # per-app agent guidance
```

> **Symlink convention:** `.agents/` is the canonical location for all rules, skills, and commands. `.claude/` and `.github/skills/` contain only symlinks pointing back to `.agents/`. Edit files in `.agents/` — the symlinks ensure all AI tools see the same content.

## Architecture

### Backend: `apps/server`

NestJS Modular Monolith with strict layered architecture and Railway Oriented Programming (`Result<T, AppError>` pattern).

| Module | Domain |
|--------|--------|
| `iam` | Authentication, JWT, RBAC, token blacklist |
| `catalog` | Workshop CRUD, rooms, speakers, publishing |
| `booking` | Registration, seat locking (Redis), payment, circuit breaker |
| `checkin` | QR validation, online/offline check-in, batch sync |
| `background` | Cron jobs, payment timeout, reconciliation, notifications |

**Request lifecycle:** Guard (JWT/RBAC/Scope) → ZodValidationPipe → Controller → Service (returns `Result`) → ResponseInterceptor → GlobalExceptionFilter

**Tech:** NestJS, Drizzle ORM, PostgreSQL (Neon), Redis (ioredis), BullMQ, Zod v4, Winston

### Web Portal: `apps/web`

Next.js 16 App Router with Pragmatic Feature-Sliced Design. Serves Students and Organizers.

**Route groups:** `(public)` — browse workshops | `(auth)` — login | `(student)` — registrations, tickets, payments | `(admin)` — workshop management, user admin, sync, system health

**Data flow:** Page → Feature Service → API Client (token injection + 401 retry) → NestJS

**Tech:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, pino

### Mobile App: `apps/mobile`

Expo Router app for Check-in Staff. Must work offline at workshop venues.

**Offline-first flow:** Pre-load active tickets to SQLite while online → scan QR → validate locally (JWT exp + SQLite lookup) → queue to local DB → batch sync with `INSERT ON CONFLICT DO NOTHING` when back online

**Tech:** Expo SDK 54, React Native 0.81, NativeWind, Drizzle ORM + expo-sqlite, expo-secure-store

## AI Agent Tooling

This repository is configured for AI-assisted development with Claude Code and GitHub Copilot.

### Agent Guidance (CLAUDE.md)

- `CLAUDE.md` — root-level: build commands, architecture overview, key design decisions
- `apps/server/CLAUDE.md` — NestJS specifics: modules, Result pattern, error factories, Redis keys
- `apps/web/CLAUDE.md` — Next.js 16 specifics: FSD layers, auth flow (muted refresh), Server Action patterns
- `apps/mobile/CLAUDE.md` — Expo specifics: offline-first flow, SQLite schema, hybrid token storage

### MCP Servers (Project-Scoped)

| Server | Purpose |
|--------|---------|
| **Context7** | Real-time library documentation (React, Next.js, NestJS, Drizzle, etc.) |
| **Chrome DevTools** | Browser automation, performance audits, UI testing |
| **Next DevTools** | Next.js 16 runtime diagnostics, route inspection, upgrade tooling |

API keys (e.g., `CONTEXT7_SECRET_KEY`) are stored in `.claude/settings.local.json` (gitignored).

### Agent Rules (`.agents/rules/`)

| Rule File | Scope |
|-----------|-------|
| `naming-convention.md` | Full-stack naming: kebab-case, PascalCase, CQS, DTO suffixes |
| `layered-architecture.md` | NestJS Modular Monolith: layer boundaries, ESLint enforcement |
| `api-implementation.md` | Request lifecycle, Zod DTOs, Result pattern, anti-patterns |
| `api-service-layer.md` | Frontend service layer: API client → Feature Service → Server Action |
| `fsd-architecture.md` | Frontend Feature-Sliced Design: entities, features, widgets, pages |
| `documentation.md` | JSDoc conventions: intent over implementation, contract format |
| `context7.md` | Context7 MCP usage guidelines |

## Coding Conventions

All code follows strict naming rules (see `.agents/rules/naming-convention.md` for full reference):

- **Directories/files:** `kebab-case` (except React components)
- **Backend files:** `[resource].[layer].ts` (e.g., `catalog.service.ts`)
- **React components:** `PascalCase` matching filename (e.g., `QuestionCard.tsx`)
- **NestJS classes:** `PascalCase` with role suffix (`WorkshopsAdminController`, `CatalogService`)
- **Functions:** `camelCase` with CQS prefix (`get`, `find`, `list` for queries; `create`, `update`, `cancel` for commands)
- **Backend:** Services never throw — always return `Result.ok()` or `Result.fail()`

Additional agent rules covering API implementation, layered architecture, FSD, and JSDoc conventions live in `.agents/rules/`.

## Documentation

- [Software Requirements Specification](docs/srs.md) — full system spec: 50 functional requirements, 40 business rules, traceability matrix
- [Screen Specification](docs/screens.md) — 39-screen UI breakdown (31 Web + 8 Mobile)
- [Agent Rules](.agents/rules/) — canonical coding rules for AI agents (naming, architecture, JSDoc, API patterns)
- [Root CLAUDE.md](CLAUDE.md) — agent guidance: commands, architecture, design decisions
- [Server CLAUDE.md](apps/server/CLAUDE.md) — NestJS specifics
- [Web CLAUDE.md](apps/web/CLAUDE.md) — Next.js 16 specifics
- [Mobile CLAUDE.md](apps/mobile/CLAUDE.md) — Expo offline-first specifics
