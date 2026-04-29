## Context

`RedisService` (`src/shared/redis/redis.service.ts`) is scaffolded with 11 TODO-stub methods and a commented-out client initialization line. `RedisModule` is declared `@Global()` but not imported in `AppModule`. The `ioredis` v5.10.1 dependency is already installed. The `.env` file has no `REDIS_URL`. Ten consumer files across `booking/mechanics/`, `catalog/services/`, `iam/services/`, and `background/` already inject `RedisService` and call its methods. The blueprint documents (`docs/blueprint/data/redis-keys.md`, `docs/blueprint/design/02-storage-strategy.md`) define 6 Redis key namespaces with precise data types, TTLs, and access patterns.

## Goals / Non-Goals

**Goals:**
- Connect `RedisService` to a real Redis instance via `REDIS_URL` environment variable
- Implement all 11 primitive methods (`get`, `set`, `setNx`, `del`, `incr`, `decr`, `expire`, `ttl`, `hGet`, `hSet`, `hGetAll`) as thin wrappers over `ioredis`
- Add JSON serialization/deserialization helpers so consumers don't inline `JSON.parse`/`JSON.stringify`
- Wire `RedisModule` into `AppModule` so the `@Global()` provider is available everywhere
- Add `REDIS_URL` to `.env`

**Non-Goals:**
- Changing method signatures (consumers already depend on the current interface)
- Adding Redis Cluster or Sentinel support (single-node only, matching the blueprint)
- Implementing BullMQ queue configuration (separate change)
- Adding health-check endpoints or metrics (separate change)
- Modifying consumer code in mechanics/services — they already inject and call `RedisService` correctly

## Decisions

### 1. Client initialization in `onModuleInit` via `REDIS_URL`

**Choice:** Initialize `new Redis(process.env.REDIS_URL)` in the `onModuleInit` lifecycle hook.

**Why:** NestJS guarantees `onModuleInit` runs after all module dependencies are resolved and before the server starts accepting requests. This means if Redis is unreachable at startup, the app fails fast rather than serving traffic with a broken Redis connection. Using a single `REDIS_URL` string keeps configuration minimal — `ioredis` parses the URL for host, port, password, and database number.

**Alternatives considered:**
- *Constructor injection with `@nestjs/config` ConfigService*: Adds unnecessary indirection for a single URL. The server currently has no `ConfigModule` set up — introducing it here would expand scope.
- *Lazy initialization on first use*: Would hide connection failures until the first Redis operation, making debugging harder.

### 2. ioredis import style: default export

**Choice:** `import Redis from "ioredis"` with `new Redis(url)`.

**Why:** ioredis v5 uses default export. The existing stub file already uses `import * as Redis from "ioredis"`, which works but the idiomatic form is the default import. We switch to `import Redis from "ioredis"` to match upstream docs and avoid namespace confusion.

### 3. JSON serialization helpers as separate methods

**Choice:** Add `jsonGet<T>(key)` and `jsonSet(key, value, exSeconds?)` as convenience methods that internally call `get`/`set` with `JSON.parse`/`JSON.stringify`.

**Why:** The Redis key blueprint specifies JSON values for `seat:lock:*` and `circuit:payment:*`. Without helpers, every consumer would inline parse/stringify — violating DRY and risking inconsistent error handling. The raw `get`/`set` methods remain available for plain string keys like `seat:available:*` (integer counters) and `token:blacklist:*`.

### 4. No custom error wrapping

**Choice:** Let `ioredis` errors propagate as-is. Do not wrap them in `AppError` or `Result.fail()`.

**Why:** `RedisService` is an infrastructure abstraction, not a business layer component. Callers (mechanics, services) are responsible for wrapping Redis errors in domain-specific `AppError` types via `tryCatch`. Wrapping at this layer would obscure the original error and make debugging connection issues harder. This follows the layered architecture rule that shared infrastructure stays domain-agnostic.

### 5. No explicit connection teardown

**Choice:** Rely on NestJS `OnModuleDestroy` for graceful shutdown, calling `this.client.quit()`.

**Why:** `ioredis` keeps connections alive. Without explicit `quit()`, the Node process may hang on SIGTERM. Adding `OnModuleDestroy` is a one-line method that prevents deployment issues.

## Risks / Trade-offs

- **Redis unreachable at startup → app fails to start**: This is intentional (fail-fast). Mitigation: ensure Redis is available before deploying. In development, `redis-server` or Docker should be documented as a prerequisite.
- **No connection retry customization**: `ioredis` defaults to auto-reconnect with exponential backoff. If custom retry policy is needed later, it can be added via `new Redis(url, { retryStrategy })` without changing the service interface.
- **Single-node only**: The blueprint assumes a single Redis instance. If the project later needs Redis Cluster or Sentinel, the `RedisService` wrapper isolates consumers from that change — only this file would need modification.
