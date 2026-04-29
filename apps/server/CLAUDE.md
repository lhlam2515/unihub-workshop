# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in the NestJS server app.

## Run, Test, Build

```sh
pnpm dev           # nest start --watch
pnpm build         # nest build && tsc-alias
pnpm start         # nest start (production)
pnpm start:debug   # nest start --debug --watch
pnpm test          # jest unit tests (src/**/*.spec.ts)
pnpm test:watch    # jest --watch
pnpm test:cov      # jest --coverage
pnpm test:e2e      # e2e tests (./test/jest-e2e.json)
pnpm lint          # eslint --fix src,apps,libs,test
pnpm format        # prettier --write src/**/*.ts
```

Single test: `pnpm test -- --testPathPattern=seach -t "fails when"`

## Database

```sh
pnpm db:generate   # drizzle-kit generate (create migration files)
pnpm db:migrate    # drizzle-kit migrate (apply migrations)
pnpm db:push       # drizzle-kit push (prototyping, skip migrations)
```

Database is Neon Serverless PostgreSQL. Schema files at `src/database/schema/`. Migrations at `src/database/migrations/`.

## Architecture

### Directory Map

```
src/
├── main.ts                    # bootstrap: helmet, CORS, cookie-parser, morgan → Winston
├── app.module.ts              # root module: DatabaseModule, global pipe/interceptor/filter
├── database/                  # Drizzle ORM — single source of truth
│   ├── schema/                # table definitions (identity, event-core, transaction, async, enums, relations)
│   ├── types/                 # inferred types from schemas (z.infer)
│   └── migrations/            # drizzle-kit generated
├── core/                      # framework: guards, filters, interceptors, config
│   ├── guards/                # JwtAuthGuard, RolesGuard, WorkshopScopeGuard, HmacSignatureGuard
│   ├── interceptors/          # ResponseInterceptor — maps Result<T> → ApiResponse envelope
│   ├── exceptions/            # GlobalExceptionFilter — catches all, returns sanitized JSON
│   └── config/                # CORS, Winston logger config
├── shared/                    # cross-cutting: Result<T>, error factories, Redis, decorators
│   ├── response/              # result.ts (Result, OkResult, FailResult, tryCatch, chainAsync)
│   │                          # errors.ts (factory functions: authErrors, seatErrors, paymentErrors, etc.)
│   │                          # types.ts (ErrorCode union, AppError, ApiResponse shape)
│   │                          # builder.ts (buildSuccessResponse, buildPaginatedResponse)
│   ├── redis/                 # RedisModule, RedisService
│   ├── decorators/            # @CurrentUser(), @Public(), @Roles(), @IdempotencyKey()
│   └── queues/                # BullMQ queue definitions
└── modules/                   # bounded contexts (modular monolith)
    ├── iam/                   # auth, JWT, token blacklist, user management, staff assignment
    ├── catalog/               # workshop CRUD, rooms, speakers, publishing
    ├── booking/               # registration, seat locking, payment, circuit breaker, rate limiting
    ├── checkin/               # QR validation, online/offline check-in, sync
    └── background/            # cron jobs (payment timeout, reconciliation), notification workers
```

Each module follows strict layering: `controllers/`, `services/`, `repositories/`, `dto/`. The `booking` module also has `mechanics/` for complex Redis/infra operations (CircuitBreakerMechanic, RateLimiterMechanic, IdempotencyMechanic, SeatLockMechanic).

### Request Lifecycle

```
Inbound Guards (JWT, RBAC, Scope)
  → ZodValidationPipe (body/params — throws ZodValidationException on bad data)
    → Controller (thin: extract user from @CurrentUser(), call service, return Result)
      → Service (business rules, orchestration — returns Result.ok() or Result.fail())
        → ResponseInterceptor (OkResult → 200/201 ApiResponse; FailResult → HttpException)
          → GlobalExceptionFilter (catches everything → sanitized JSON)
```

### Result Pattern (Railway Oriented Programming)

Services **never throw**. They always return `Result.ok(data)` or `Result.fail(appError)`.

```typescript
// Success
return Result.ok(WorkshopResponseDto.from(entity));
// Failure
return Result.fail(seatErrors.unavailable(workshopId));
```

Repositories wrap Drizzle calls with `tryCatch`:

```typescript
async findById(id: string): Promise<Result<WorkshopType>> {
  return tryCatch(
    async () => { /* drizzle query */ },
    (err) => systemErrors.internal('Failed to fetch workshop', err)
  );
}
```

Cross-module communication: only Service → Service. Never import another module's Repository.

### Error Factories

All errors are created through factory functions in `src/shared/response/errors.ts`. Each maps to an `ErrorCode` and `ErrorCategory` (which resolves to an HTTP status). Key groups:

| Factory | Codes |
|---------|-------|
| `authErrors` | TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_REVOKED, REFRESH_TOKEN_INVALID, INVALID_CREDENTIALS, USER_SUSPENDED, CHECKIN_SCOPE_DENIED |
| `seatErrors` | SEAT_UNAVAILABLE, SEAT_LOCK_EXPIRED |
| `registrationErrors` | REGISTRATION_DUPLICATE, REGISTRATION_NOT_FOUND, REGISTRATION_CANCELLED |
| `paymentErrors` | PAYMENT_DUPLICATE, PAYMENT_ALREADY_SUCCESS, PAYMENT_GATEWAY_OPEN, PAYMENT_GATEWAY_ERROR, PAYMENT_TIMEOUT, PAYMENT_NOT_FOUND |
| `workshopErrors` | WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, WORKSHOP_CANCELLED, WORKSHOP_FULL, WORKSHOP_TIME_CONFLICT |
| `ticketErrors` | TICKET_NOT_FOUND, TICKET_VOID, TICKET_ALREADY_CHECKEDIN |
| `systemErrors` | INTERNAL_ERROR, DB_LOCK_TIMEOUT |

### Guards and Decorators

- `@Public()` — skip JWT auth
- `@Roles(UserRole.STUDENT)` — RBAC guard; accepts single role or array
- `@CurrentUser()` — extracts JWT payload (`{ userId, role, ... }`)
- `WorkshopScopeGuard` — for CHECKIN_STAFF: validates `workshop_id` against `allowed_workshop_ids` in JWT
- `HmacSignatureGuard` — for payment webhooks: validates HMAC signature header

### Path Alias

`@/*` → `./src/*` (configured in tsconfig.json, resolved by tsc-alias at build)

## Key Patterns

1. **DTOs use `createZodDto` from `nestjs-zod`** — Zod schema → NestJS validation class. Request DTOs are in `dto/` folders; response DTOs use `static from(entity)` factory methods that strip internal DB fields.

2. **IDOR prevention** — For STUDENT routes, `student_id` is always taken from `jwt.sub`, never from URL params or body. Repositories add `WHERE student_id = jwt.sub` automatically.

3. **Redis keys** — `seat:available:{wid}` (available counter), `seat:lock:{wid}:{regId}` (15min TTL), `token:blacklist:{jti}` (TTL = remaining JWT life), `idempotency:{key}` (24h TTL), `circuit:payment:{gateway}` (hash), `ratelimit:register:{userId}` (token bucket).

4. **Controller return** — Never use `@Res() res: Response`. Return the Result directly; `ResponseInterceptor` maps it to HTTP.

5. **Jest** — Tests alongside source (`*.spec.ts`). `rootDir` is `src`. Uses `ts-jest` transformer.
