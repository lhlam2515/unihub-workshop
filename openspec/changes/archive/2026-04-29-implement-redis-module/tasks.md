## 1. Environment Configuration

- [x] 1.1 Add `REDIS_URL` to `.env` with a placeholder value (e.g., `redis://localhost:6379`)

## 2. RedisService Implementation

- [x] 2.1 Fix import style: change `import * as Redis from "ioredis"` to `import Redis from "ioredis"` and add `OnModuleDestroy` to the NestJS import
- [x] 2.2 Implement `onModuleInit()`: initialize `this.client = new Redis(process.env.REDIS_URL)`
- [x] 2.3 Implement `get(key)`, `set(key, value, exSeconds?)`, `setNx(key, value, exSeconds?)`, `del(key)` — String operations delegating to ioredis `get`, `set`, `set ... NX EX`, `del`
- [x] 2.4 Implement `incr(key)`, `decr(key)` — Atomic counter operations delegating to ioredis `incr`, `decr`
- [x] 2.5 Implement `expire(key, seconds)`, `ttl(key)` — TTL operations delegating to ioredis `expire` (returning boolean), `ttl`
- [x] 2.6 Implement `hGet(key, field)`, `hSet(key, field, value)`, `hGetAll(key)` — Hash operations delegating to ioredis `hget`, `hset`, `hgetall`
- [x] 2.7 Add `jsonGet<T>(key)` and `jsonSet(key, value, exSeconds?)` convenience methods with JSON serialization
- [x] 2.8 Add `onModuleDestroy()` calling `this.client.quit()` for graceful shutdown
- [x] 2.9 Remove all TODO comments from the implemented methods

## 3. Module Wiring

- [x] 3.1 Import `RedisModule` in `AppModule`'s `imports` array

## 4. Verification

- [x] 4.1 Verify `pnpm build` succeeds with no TypeScript errors
- [x] 4.2 Verify all 5 feature modules (`iam`, `catalog`, `booking`, `checkin`, `background`) resolve `RedisService` without DI errors
- [x] 4.3 Spot-check a consumer method (e.g., `SeatLockMechanic.acquire()`) to confirm the RedisService method call path is complete
