## Why

The Redis infrastructure layer is the backbone of UniHub's high-concurrency architecture — it powers atomic seat counters (12K CCU), token blacklists, rate limiters, circuit breakers, idempotency guards, and distributed seat locks. Currently, `RedisService` has all 11 methods as empty stubs returning default values, and `RedisModule` is not wired into `AppModule`. This blocks 10+ consumer files across 4 modules (IAM, Catalog, Booking, Background) from functioning. Without this foundation, every safety mechanism designed in the blueprint is inert.

## What Changes

- Implement `RedisService` with a real `ioredis` client connection, replacing all 11 stub methods with actual Redis commands
- Wire `RedisModule` into `AppModule` so the `@Global()` provider is available to all feature modules
- Add `REDIS_URL` environment variable to `.env` for client initialization
- Add JSON serialization/deserialization helpers for structured data (seat locks, circuit breaker state)

## Capabilities

### New Capabilities

- `redis-infrastructure`: Centralized Redis client wrapper exposing 11 primitive operations (`get`, `set`, `setNx`, `del`, `incr`, `decr`, `expire`, `ttl`, `hGet`, `hSet`, `hGetAll`) with automatic JSON serialization and environment-based configuration. Serves as the single abstraction layer between business logic and the `ioredis` library.

### Modified Capabilities

None — all existing spec-level behaviors remain unchanged. This change only implements the infrastructure layer that existing specs already depend on.

## Impact

- **`src/shared/redis/redis.module.ts`** — already scaffolded, no structural changes needed
- **`src/shared/redis/redis.service.ts`** — replace all 11 stub methods with real `ioredis` calls
- **`src/app.module.ts`** — add `RedisModule` to the `imports` array
- **`.env`** — add `REDIS_URL` variable
- **10+ consumer files** across `booking/mechanics/`, `catalog/services/`, `iam/services/`, and `background/` — these already inject `RedisService` and will start working once the service is implemented
