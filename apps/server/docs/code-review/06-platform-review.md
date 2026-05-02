# Platform Infrastructure Code Review

**Scope:** apps/server/src/core/ (non-auth), apps/server/src/shared/, apps/server/src/database/
**Date:** 2026-05-02

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1.1.1 | `DatabaseModule` initializes drizzle client at module import time (module-level side effect). `dotenv.config()` is called inline, and `process.env.DATABASE_URL` is read at module load. This breaks test isolation — importing the module in tests triggers a live connection attempt and couples the module to env state at import time. | database/database.module.ts:9-16 | **HIGH** | Move drizzle client init into a `useFactory` provider with `ConfigService` injection. The module should not execute I/O at import time. |
| 1.1.2 | Widespread `process.env` usage in lieu of NestJS ConfigService. 5 files read env vars directly: `cors.config.ts` (FRONTEND_URL), `logger.config.ts` (LOG_LEVEL, NODE_ENV), `redis.service.ts` (REDIS_URL), `queue.module.ts` (REDIS_URL), `database.module.ts` (DATABASE_URL). Only `StorageModule` uses proper DI via `forRoot()`. This tightly couples infrastructure to env layout and makes testing harder. | Multiple files | **HIGH** | Migrate to `@nestjs/config` ConfigService for all env var access. Inject ConfigService into factories/providers rather than reading `process.env` at module or class-init time. |
| 1.1.3 | `SharedQueueModule` does not use `forRootAsync` with ConfigService; passes `process.env.REDIS_URL` directly. No DI for Redis URL, making it impossible to inject per-environment config in tests. | shared/queues/queue.module.ts:36 | **HIGH** | Inject ConfigService via `useFactory` in `BullModule.forRootAsync()`. |
| 1.1.4 | `RedisService.onModuleInit` reads `process.env.REDIS_URL!` (non-null assertion) directly instead of via ConfigService. If `REDIS_URL` is missing, the app crashes with an unhelpful assertion error. | shared/redis/redis.service.ts:40 | **MEDIUM** | Inject ConfigService; validate `REDIS_URL` exists in constructor with a clear error message before calling `new Redis()`. |

### 1.2 Techniques

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1.2.1 | `ResponseInterceptor` passes `processingStartMs` in the non-paginated success path but drops it in the paginated success path. The paginated branch (lines 59-68) calls `paginatedResponse` directly via `resultToHttpResponse` but the constructed `Result.ok({ items, total })` gets no `processingStartMs` option. | core/interceptors/response.interceptor.ts:59-68 | **MEDIUM** | Extract `processingStartMs` from the intercept context and pass it to `paginatedResultToHttpResponse` (which currently only accepts `requestId`). |
| 1.2.2 | `GlobalExceptionFilter` checks for `"category" in exceptionResponse` as a heuristic to detect pre-formatted AppError in HttpExceptions. This is fragile — any HttpException whose response object happens to have a `category` property would be misidentified. | core/exceptions/global-exception.filter.ts:54-56 | **LOW** | Consider checking for a known AppError property (e.g., `"code" in exceptionResponse && "category" in exceptionResponse`) for a more discriminating check. |
| 1.2.3 | `RedisService` uses `private client!: Redis` (definite assignment assertion). If `onModuleInit` is never called (e.g., the service is instantiated outside NestJS lifecycle in tests), accessing `this.client` would throw a cryptic undefined error. | shared/redis/redis.service.ts:27 | **LOW** | Add a guard in each public method: `if (!this.client) throw new Error("RedisService not initialized")`. |

### 1.3 Security

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1.3.1 | `GlobalExceptionFilter` logs `String(exception)` for non-Error thrown values in 5xx handler. A string throw could contain sensitive data (DB credentials, tokens, PII) that gets written to logs verbatim. | core/exceptions/global-exception.filter.ts:69-70 | **LOW** | Sanitize/truncate non-Error exception serialization. Prefer `exception instanceof Error ? exception.message : "Non-Error exception"`. |
| 1.3.2 | `cors.config.ts` allows all requests without an Origin header (mobile, server-to-server). Dynamically resolving `process.env.FRONTEND_URL` at config-read time (once at module init) rather than via ConfigService means the allowed origin is frozen at boot. | core/config/cors.config.ts:14-16 | **LOW** | Acceptable tradeoff for mobile clients. Confirm this covers both dev (localhost) and prod (FRONTEND_URL) correctly and note the boot-time freeze is intentional. |

## 2. Code Quality Principles

### 2.1 KISS

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.1.1 | `Logger.config.ts` writes error logs to `path.join("logs", "error.log")`. The `logs/` directory relative to CWD may not exist, causing unhandled crash at startup. | core/config/logger.config.ts:42-43 | **MEDIUM** | Use `appRoot` from `app-root-path` or ensure the `logs/` directory is created before adding the File transport. Consider a lifecycle hook to verify the directory exists. |
| 2.1.2 | `tryCatch` has a minor typing subtlety — `Result.ok(await fn())` infers `T` correctly but the `error` variable in `catch` is `unknown`, which is correct but could be more descriptive in the generic constraint. | shared/response/result.ts:203-212 | **LOW** | No change needed; the typing is functionally correct. `unknown` is the right type for catch variables. |

### 2.2 YAGNI

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.2.1 | `Result.combine` aggregates multiple Results but returns `Result<void>`, discarding all data. Verify this is used by any caller. If unused, it adds dead surface area to the core Result abstraction. | shared/response/result.ts:76-84 | **LOW** | Check if `combine` is used across the codebase. If not, remove or make it generic to collect multiple Ok payloads into a tuple. |
| 2.2.2 | `OkResult.map` provides a `Functor`-style map operation. Verify actual usage — if no service code calls `.map()`, this is unnecessary complexity on the core Result type. | shared/response/result.ts:145-147 | **LOW** | Check callers. The project pattern for data transformation is the `transform` option in `resultToHttpResponse` and `ResponseDto.from()` factories, which may make `.map()` redundant. |

### 2.3 DRY

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.3.1 | `StorageService.getFileStream` and `getFileBuffer` share identical S3 GetObject logic: key resolution, `NoSuchKey` detection, and error mapping. The only difference is how `response.Body` is consumed (stream vs buffer). | shared/storage/storage.service.ts:154-232 | **MEDIUM** | Extract a private `getFileObject(keyOrUrl)` method that returns the raw S3 response, then let `getFileStream` and `getFileBuffer` handle just the body conversion. |
| 2.3.2 | `event-contracts.ts` duplicates enum values (NotificationType, NotificationChannel, PaymentGateway) that are already defined as DB-level pgEnums in `enums.schema.ts`. The file itself notes "kept in sync by convention." This is a maintenance liability. | shared/queues/event-contracts.ts:9-22 | **MEDIUM** | Derive event types from the DB enum zod schemas in `database/types/enums.types.ts` rather than hand-maintaining parallel type unions in the shared module. |
| 2.3.3 | `CORS` allowed origins list is inline in `cors.config.ts`. If other parts of the system also need the allowed-origins list (e.g., CSP headers, CSRF), it must be duplicated. | core/config/cors.config.ts:4-8 | **LOW** | Consider centralizing the allowed origins list in a shared config or constants file if other security middleware needs it. |

### 2.4 SOLID

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.4.1 | **DIP violation — systematic**: High-level infrastructure modules depend concretely on `process.env` rather than on abstractions. `cors.config.ts`, `logger.config.ts`, `redis.service.ts`, `queue.module.ts`, and `database.module.ts` all read `process.env` directly. Only `StorageModule` uses proper DI via `forRoot()`. | Multiple files | **HIGH** | Migrate to ConfigService-injected factories. See findings 1.1.1–1.1.4. |
| 2.4.2 | **SRP — well maintained**: The `shared/response/` directory correctly splits concerns: `types.ts` (shapes) → `result.ts` (monad) → `errors.ts` (factories) → `builder.ts` (serialization). Each file has a single responsibility. | shared/response/ | ✅ | No action needed. Pattern should be preserved. |
| 2.4.3 | **OCP — error factories**: The `createError()` function + `CreateErrorOptions` interface + domain error factory groups (authErrors, seatErrors, etc.) provide excellent extensibility. New error types require only adding a new factory group, not modifying existing code. | shared/response/errors.ts | ✅ | No action needed. Reference pattern for other extensibility points. |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.5.1 | `database.module.ts` imports `dotenv` and calls `dotenv.config()` as a module-level side effect. This belongs in the application bootstrap layer (main.ts or AppModule), not in a feature/database module. This blurs the line between infrastructure configuration and domain wiring. | database/database.module.ts:9 | **MEDIUM** | Remove `dotenv.config()` from the module. The application's bootstrap (main.ts) or a dedicated config module should be responsible for env loading. |
| 2.5.2 | Core/shared/database boundaries are otherwise clean: `core/` handles framework plumbing; `shared/` provides cross-cutting utilities (Result, Redis, Storage, decorators, queues); `database/` is the single schema source of truth. No layer bleeds concerns incorrectly. | All | ✅ | No action needed. Architecture boundaries are well-maintained. |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.6.1 | `GlobalExceptionFilter` accesses `request.headers["x-request-id"]`, `request.method`, `request.url` — all direct properties, no deep chaining. Clean. | core/exceptions/global-exception.filter.ts:29-30, 69 | ✅ | No action needed. |
| 2.6.2 | `RedisService` and `StorageService` both wrap their respective SDKs completely — consumers never interact with ioredis or S3 directly. | shared/redis/redis.service.ts, shared/storage/storage.service.ts | ✅ | Good. This is the correct application of the Law of Demeter for infrastructure wrappers. |

## 3. Database Schema Review

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 3.1 | `offlineCheckinQueue.sync_status` uses a raw `varchar(20)` column with a CHECK constraint instead of a dedicated `pgEnum`. Every other status/type column in the schema uses pgEnum. This is inconsistent and loses type-level safety in Drizzle. | database/schema/transaction.schema.ts:173-176 | **MEDIUM** | Create a `syncStatusEnum` in `enums.schema.ts` and use it in the `offlineCheckinQueue` table definition. Update the CHECK constraint accordingly. |
| 3.2 | `checkinStaffAssignments.workshop_ids` uses `jsonb` storing `string[]`. A proper many-to-many join table (`checkin_staff_workshops`) would provide referential integrity, queryability, and index support for per-workshop staff lookups. | database/schema/identity.schema.ts:13-17 | **MEDIUM** | Evaluate whether the JSONB array provides sufficient query performance. If staff-scope checks need indexed lookups per workshop, migrate to a join table. |
| 3.3 | `offlineCheckinQueue` has no indexes on `syncStatus` or `workshopId`. The offline sync process will query by `syncStatus = 'PENDING'` to find unsynced records, which will be sequential scans. | database/schema/transaction.schema.ts:165-187 | **MEDIUM** | Add a partial index on `syncStatus WHERE sync_status = 'PENDING'` for efficient sync queue polling. Consider adding index on `workshopId` if queue queries filter by workshop. |
| 3.4 | `transaction.types.ts` defines `offlineCheckinSyncStatusSchema` as a standalone Zod enum to override `drizzle-zod`'s default string inference for `syncStatus`. This is a workaround for the missing pgEnum — fixing finding 3.1 would make this override unnecessary. | database/types/transaction.types.ts:16-20 | **LOW** | Clean up once finding 3.1 is fixed. |

## 4. Documentation & Convention Review

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 4.1 | `cors.config.ts` contains Vietnamese comments (lines 11-26: "TRƯỜNG HỢP 1", etc.). The project documentation convention requires all JSDoc and comments in English. | core/config/cors.config.ts:11-26 | **MEDIUM** | Translate comments to English to comply with the documentation convention. |
| 4.2 | `builder.ts` has contradictory `@throws` documentation: the function-level JSDoc says `@throws Never`, but the `@param options.transform` documentation says `@throws Error if options.transform throws`. | shared/response/builder.ts:173, 177-178 | **LOW** | Remove the `@throws Never` on the function, as the function CAN throw (via the transform callback). Or clarify that the function itself doesn't throw but the optional transform parameter may. |

## 5. Strategic Recommendations

### 5.1 Immediate Fixes (Critical)
None identified. The platform infrastructure is production-ready with no crash-level or data-corruption issues.

### 5.2 Short-Term Improvements (High)

1. **Centralize env var access via ConfigService** (findings 1.1.1–1.1.4, 2.4.1)
    - Install `@nestjs/config` if not already present.
    - Replace all `process.env.*` reads with `ConfigService.get()` via factory/provider injection.
    - `DatabaseModule` should use a provider factory, not module-level I/O.
    - `RedisService` should accept config via DI, not read env in `onModuleInit`.

2. **Fix paginated response processing time** (finding 1.2.1)
    - Add `processingStartMs` parameter to `paginatedResultToHttpResponse`.
    - Pass it through to `paginatedResponse` for consistent response metadata.

3. **Fix `syncStatus` enum inconsistency** (finding 3.1)
    - Add `syncStatusEnum` to `enums.schema.ts`.
    - Update `offlineCheckinQueue` table and remove the CHECK constraint.

### 5.3 Long-Term Architecture

1. **StorageService DRY extraction** (finding 2.3.1): Extract shared S3 GetObject logic into a private helper, reducing ~60 lines of duplicated error handling.

2. **Eliminate enum duplication** (finding 2.3.2): Derive queue event-contract types from database enum zod schemas instead of hand-maintaining parallel type unions. This tightens the shared→database dependency but eliminates the sync burden.

3. **CORS config as a provider** (finding 4.1): Migrate `cors.config.ts` from a plain function to an injectable provider so it can participate in DI and be stub-able in integration tests.

## Pass 2 Additions (NestJS Docs + Code Quality Specialist)

> Second-pass review against NestJS v11 official docs (exception filters, interceptors, custom decorators, dynamic modules, lifecycle hooks, ConfigService) + code quality specialist.

### Pass 2: NestJS Docs Compliance

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| P2.1.1 | `GlobalExceptionFilter` uses Express `Request`/`Response` types directly instead of NestJS `HttpAdapterHost` | NestJS recommends `HttpAdapterHost` for framework-agnostic filters; direct Express types couple the filter to Express and prevent migration to Fastify or other HTTP adapters | `core/exceptions/global-exception.filter.ts:26-27` | **Medium** | Inject `HttpAdapterHost` and use `httpAdapter.getRequestUrl()`, `httpAdapter.reply()` instead of Express `Request`/`Response` types |
| P2.1.2 | `ResponseInterceptor` imports Express types directly — same Express coupling concern | While interceptors are HTTP-layer by nature, NestJS provides `HttpAdapter` for platform-agnostic response handling | `core/interceptors/response.interceptor.ts:15` | **Low** | Consider using `HttpAdapterHost` for response handling if Fastify migration is a future concern |
| P2.1.3 | `DatabaseModule` is a static `@Global()` module — doesn't use `forRoot()`/`forRootAsync()` dynamic module pattern | NestJS convention for database modules (TypeORM, Mongoose, Prisma) is `forRoot()`/`forRootAsync()` for configurable initialization; static module prevents DI-based configuration | `database/database.module.ts:30-35` | **Medium** | Adopt `forRootAsync()` pattern accepting `ConfigService` to resolve `DATABASE_URL` at runtime via DI, eliminating module-level side effects |
| P2.1.4 | `CurrentUser` decorator uses `request.user as JwtPayload` — unsafe cast when guard is absent | If `JwtAuthGuard` is missing on a route, `request.user` is `undefined`; the cast silently suppresses this, producing a confusing runtime error downstream | `shared/decorators/current-user.decorator.ts:19` | **Medium** | Add guard: `if (!request.user) throw new InternalServerErrorException('CurrentUser used without JwtAuthGuard')` |
| P2.1.5 | `IdempotencyKey` decorator throws a framework `BadRequestException` — architectural inconsistency with Result pattern | Project convention says "services never throw"; decorator throws a NestJS exception, bypassing the Result→ResponseInterceptor pipeline | `shared/decorators/idempotency-key.decorator.ts:24` | **Low** | Consider returning a structured Result-based response or use a pipe that maps validation errors through the error factory chain |
| P2.1.6 | `StorageModule` provides `forRoot()` but no `forRootAsync()` variant | For consistency with NestJS dynamic module conventions, both synchronous and async factory patterns should be available | `shared/storage/storage.module.ts:38` | **Low** | Add `forRootAsync()` accepting `ConfigService` to resolve config at runtime |

### Pass 2: Code Quality (New Findings)

| # | Finding | Principle | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| P2.2.1 | `isPaginatedShape` allows `NaN` values — `typeof NaN === 'number'` in JS | **Correctness** | `core/interceptors/response.interceptor.ts:26-28` | **Critical** | Use `Number.isFinite()` instead of `typeof === 'number'` for `total`, `page`, `limit` checks; add `>= 0` constraints |
| P2.2.2 | `IdempotencyKey` decorator casts header as `string`, but Express headers can be `string[]` | **Type Safety** | `shared/decorators/idempotency-key.decorator.ts:21` | **Critical** | Normalize: `const raw = request.headers["x-idempotency-key"]; const key = Array.isArray(raw) ? raw[0] : raw;` |
| P2.2.3 | `jsonGet`/`jsonSet` call `this.client.get()`/`this.client.set()` directly instead of delegating to `this.get()`/`this.set()` | **KISS/OCP** | `shared/redis/redis.service.ts:257-261,273-283` | **Medium** | Delegate to public `get`/`set` methods so logging, metrics, or read-through cache additions are automatically inherited |
| P2.2.4 | `GlobalExceptionFilter` imports concrete `winstonLogger` instead of injecting NestJS `Logger` | **DIP/Testability** | `core/exceptions/global-exception.filter.ts:14,68` | **Medium** | Inject `Logger` via constructor DI to allow mocking in tests |
| P2.2.5 | `scanKeys` doesn't destroy stream on error — leaks Node.js stream and discards partial data | **Resource Leak** | `shared/redis/redis.service.ts:230-241` | **Medium** | Add `stream.destroy()` in the `error` event handler |
| P2.2.6 | `ErrorCode` union has ~40 members aggregating every domain — violates Interface Segregation Principle | **ISP** | `shared/response/types.ts:23-66` | **Medium** | Break into domain-specific subsets (`AuthErrorCode`, `PaymentErrorCode`, etc.) and compose the main union |
| P2.2.7 | `RegistrationEventData` missing from barrel re-export in `queues/index.ts` — consumers import from inner path | **Import Hygiene** | `shared/queues/index.ts:9-16` | **Low** | Add `RegistrationEventData` to the barrel re-exports |
| P2.2.8 | `CurrentUser` decorator silently returns `undefined` via `as JwtPayload` cast | **Type Safety** | `shared/decorators/current-user.decorator.ts:19` | **Low** | See P2.1.4 — guard clause recommended |
| P2.2.9 | `FailResult.propagate<U>()` method has zero callers across the codebase | **YAGNI** | `shared/response/result.ts:187-189` | **Low** | Remove unused method; reintroduce if needed |
| P2.2.10 | `chainAsync` utility function has zero callers — codebase uses inline `isFailure` checks instead | **YAGNI** | `shared/response/result.ts:225-236` | **Low** | Remove unused utility; inline checks are more explicit and readable |

### Updated Finding Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| NestJS Compliance (Pass 1) | 0 | 3 | 1 | 3 | 7 |
| Code Quality (Pass 1) | 0 | 1 | 6 | 5 | 12 |
| Database Schema (Pass 1) | 0 | 0 | 3 | 1 | 4 |
| Documentation (Pass 1) | 0 | 0 | 1 | 1 | 2 |
| **Pass 2 New Findings** | **2** | **0** | **6** | **8** | **16** |
| **Grand Total** | **2** | **4** | **17** | **18** | **41** |

### Pass 2 Key Weaknesses

1. **2 Critical correctness issues**: `isPaginatedShape` allows `NaN` propagation into JSON API responses; `IdempotencyKey` header cast hides `string[]` from duplicate headers.
2. **Missing NestJS patterns**: `GlobalExceptionFilter` uses Express types instead of `HttpAdapterHost`; `DatabaseModule` lacks `forRootAsync` dynamic module pattern.
3. **Dead code accumulation**: `FailResult.propagate` and `chainAsync` are unused — speculative infrastructure with no callers.
4. **Encapsulation gaps**: `jsonGet`/`jsonSet` bypass the `get`/`set` abstraction layer in `RedisService`; `GlobalExceptionFilter` imports concrete logger instead of DI.

### Key Strengths (Pass 1 & 2 Combined)

1. **Clean Result pattern architecture**: `Result<T>` + `OkResult`/`FailResult` + `tryCatch` + `chainAsync` form a cohesive, well-typed Railway-Oriented Programming foundation. Error factories are organized by domain with excellent extensibility (`createError` + `CreateErrorOptions`).

2. **Well-separated response pipeline**: `types.ts` (shape contracts) → `result.ts` (monad) → `errors.ts` (domain factories) → `builder.ts` (HTTP serialization) creates a clean, testable chain.

3. **Excellent infrastructure wrapping**: `RedisService` and `StorageService` fully encapsulate their respective SDKs. No consumer code touches `ioredis` or `@aws-sdk/client-s3` directly. This is textbook Dependency Inversion.

4. **Database schema quality**: Comprehensive use of pgEnum, CHECK constraints, partial unique indexes, and proper FK references. The `chk_workshops_price` CHECK constraint (paid workshops must have price > 0) is a nice domain-level invariant enforcement.

5. **StorageModule `forRoot()` pattern**: One of the few places that properly implements NestJS dynamic module patterns with config validation, defaults, and descriptive fail-fast errors.

### Key Weaknesses (Pass 1 & 2 Combined)

1. **Systematic `process.env` dependency**: Every infrastructure module reads env vars directly instead of using NestJS ConfigService. This is the single most impactful architectural debt — it couples the entire platform layer to global mutable state and complicates testing.

2. **DatabaseModule module-level side effect**: Initializing the drizzle client at import time prevents clean test isolation and couples the module to environment state. This goes against NestJS module design principles.

3. **2 Critical correctness issues**: `isPaginatedShape` allows `NaN` propagation into JSON API responses; `IdempotencyKey` header cast hides `string[]` from duplicate headers — both can produce silent incorrect behavior.

4. **StorageService S3 GetObject duplication**: `getFileStream` and `getFileBuffer` share ~80% of their implementation. This violates DRY and means any error-handling change must be made in two places.

5. **Missing NestJS patterns**: `GlobalExceptionFilter` uses Express types instead of `HttpAdapterHost`; `DatabaseModule` lacks `forRootAsync` dynamic module pattern; `RedisModule` lacks async initialization with DI.

6. **Dead code accumulation + type safety gaps**: `Result.propagate()` and `chainAsync()` are unused; `ErrorCode` union violates ISP with ~40 members; `jsonGet`/`jsonSet` bypass their own abstraction.
