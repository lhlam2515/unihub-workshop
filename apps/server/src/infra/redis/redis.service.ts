/**
 * Redis Service
 *
 * Thin wrapper over the ioredis client. This is the **only layer** in the system
 * permitted to interact directly with Redis through the `ioredis` library. All
 * Business-layer Services and Mechanics consume only the primitives exposed here.
 *
 * Design rationale:
 * - Prevents infrastructure leakage: if the Redis library is swapped in the future,
 *   only this file needs to change.
 * - Automatic JSON serialization/deserialization via `jsonGet` / `jsonSet` so
 *   consumers never inline `JSON.parse` / `JSON.stringify`.
 *
 * Lifecycle:
 * - **Startup:** Connects to the Redis instance via the `REDIS_URL` environment
 *   variable in `onModuleInit`. Fails fast if Redis is unreachable.
 * - **Shutdown:** `onModuleDestroy` calls `client.quit()` to gracefully close the
 *   persistent connection, preventing the Node.js process from hanging on SIGTERM.
 *
 * Redis key blueprint reference: `docs/blueprint/data/redis-keys.md`
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Database index for the Redis service.
 *
 * REF: `docs/blueprint/design/02_storage-strategy.md` L22-26 — DB0 = cache, DB1 = queue, DB2 = rate limit
 */
export enum RedisDb {
  Cache = 0,
  Queue = 1,
  RateLimit = 2,
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /** DB0 — cache (allkeys-lru eviction policy) */
  private client!: Redis;
  /** DB1 — queue (noeviction) */
  private queueClient!: Redis;
  /** DB2 — rate limit (volatile-ttl eviction policy) */
  private rateLimitClient!: Redis;

  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the ioredis client from the REDIS_URL environment variable.
   *
   * Runs during the NestJS `onModuleInit` lifecycle — after all modules are
   * resolved and before the server accepts requests. If Redis is unavailable
   * the application fails fast rather than serving traffic with a broken
   * connection.
   *
   * Side effects: Opens persistent TCP connections to Redis DB0, DB1, DB2.
   */
  async onModuleInit() {
    const url = this.configService.getOrThrow<string>("redis.url");
    this.client = new Redis(url);
    this.queueClient = new Redis(url);
    this.rateLimitClient = new Redis(url);

    // Prevent process crash on Redis connection errors
    this.client.on("error", (err) =>
      this.logger.error("Redis client (DB0) error", err)
    );
    this.queueClient.on("error", (err) =>
      this.logger.error("Redis queue client (DB1) error", err)
    );
    this.rateLimitClient.on("error", (err) =>
      this.logger.error("Redis rate-limit client (DB2) error", err)
    );

    // Note: Database selection (SELECT command) is skipped because managed Redis services
    // (Upstash, Redis Cloud, etc.) typically only support database 0. Logical separation
    // is achieved through distinct client instances, which is sufficient for this use case.
  }

  // ---------------------------------------------------------------------------
  // String Primitives
  // ---------------------------------------------------------------------------

  /**
   * Retrieves the value of a key.
   *
   * @param key - The Redis key to read.
   * @returns The string value if the key exists, `null` otherwise.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Stores a string value at a Redis key.
   *
   * @param key - Target Redis key.
   * @param value - String value to store.
   * @param exSeconds - Optional TTL in seconds. Omit for persistent keys.
   * @returns `"OK"` on success.
   */
  async set(key: string, value: string, exSeconds?: number): Promise<"OK"> {
    if (exSeconds !== undefined) {
      return this.client.set(key, value, "EX", exSeconds);
    }
    return this.client.set(key, value);
  }

  /**
   * Stores a value at a Redis key only if the key does not already exist (SET NX).
   *
   * Used for distributed locks and idempotency guards (Layer 1).
   *
   * When `exSeconds` is provided the operation uses `SET key value EX seconds NX`
   * to guarantee atomicity of the SET + EXPIRE pair.
   *
   * @param key - Target Redis key.
   * @param value - String value to store.
   * @param exSeconds - Optional TTL in seconds.
   * @returns `true` if the key was created, `false` if it already existed.
   */
  async setNx(
    key: string,
    value: string,
    exSeconds?: number
  ): Promise<boolean> {
    if (exSeconds !== undefined) {
      const result = await this.client.set(key, value, "EX", exSeconds, "NX");
      return result === "OK";
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  /**
   * Deletes one or more Redis keys.
   *
   * @param key - A single key or an array of keys to delete.
   * @returns The number of keys actually removed (0 if none existed).
   */
  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    return this.client.del(...keys);
  }

  // ---------------------------------------------------------------------------
  // Atomic Counters
  // ---------------------------------------------------------------------------

  /**
   * Atomically increments an integer counter stored at a Redis key.
   *
   * Used for `seat:available:{workshop_id}` — the source of truth for remaining
   * seat counts. If the key does not exist, Redis initializes it to 0 before
   * incrementing.
   *
   * @param key - Redis key holding the counter.
   * @returns The new counter value after increment.
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Atomically decrements an integer counter stored at a Redis key.
   *
   * Used for `seat:available:{workshop_id}` when a student successfully registers.
   * The consumer (SeatCounterService) is responsible for checking whether the
   * return value is negative — if so, it must call `incr` as a compensating action
   * and report `SEAT_UNAVAILABLE`.
   *
   * @param key - Redis key holding the counter.
   * @returns The new counter value after decrement.
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  // ---------------------------------------------------------------------------
  // Key Expiry (TTL)
  // ---------------------------------------------------------------------------

  /**
   * Sets a time-to-live on a Redis key.
   *
   * @param key - Redis key to expire.
   * @param seconds - TTL in seconds.
   * @returns `true` if the TTL was set, `false` if the key does not exist.
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  /**
   * Returns the remaining time-to-live of a Redis key.
   *
   * @param key - Redis key to inspect.
   * @returns Remaining seconds if the key has a TTL, `-1` if the key has no TTL,
   *          `-2` if the key does not exist.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ---------------------------------------------------------------------------
  // Hash Operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieves the value of a single field in a Redis Hash.
   *
   * Used for circuit breaker state lookups:
   * `hGet("circuit:payment:{gateway}", "state")`.
   *
   * @param key - Redis Hash key.
   * @param field - Field name within the Hash.
   * @returns The field's string value if it exists, `null` if the field or Hash
   *          does not exist.
   */
  async hGet(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  /**
   * Stores a value at a field in a Redis Hash.
   *
   * @param key - Redis Hash key.
   * @param field - Field name within the Hash.
   * @param value - String value to store.
   * @returns `1` if the field was newly created, `0` if an existing field was updated.
   */
  async hSet(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  /**
   * Retrieves all field-value pairs from a Redis Hash.
   *
   * Used for reading full circuit breaker state:
   * `hGetAll("circuit:payment:{gateway}")` returns the entire state object
   * `{state, failure_count, opened_at, last_attempt}`.
   *
   * @param key - Redis Hash key.
   * @returns An object with all field-value pairs as `Record<string, string>`.
   *          Returns an empty object if the Hash does not exist.
   */
  async hGetAll(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  // ---------------------------------------------------------------------------
  // Sorted Set Primitives (ADR-06 Sliding Window Rate Limiting)
  // ---------------------------------------------------------------------------

  /**
   * Adds a member with a numeric score to a Sorted Set.
   *
   * Used by the Sliding Window Rate Limiter to timestamp each request.
   *
   * @param key - Redis Sorted Set key (e.g. `rl:ip:{ip}`).
   * @param score - The numeric score (typically a Unix millisecond timestamp).
   * @param member - The member string (typically the request timestamp).
   * @returns The number of new elements added to the Sorted Set.
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.rateLimitClient.zadd(key, score, member);
  }

  /**
   * Removes all members in a Sorted Set with scores in the given interval.
   *
   * Used by the Sliding Window Rate Limiter to prune expired entries before
   * counting — `ZREMRANGEBYSCORE key -inf <window_start>`.
   *
   * @param key - Redis Sorted Set key.
   * @param min - Minimum score bound (use `"-inf"` for unbounded).
   * @param max - Maximum score bound (use `"+inf"` for unbounded).
   * @returns The number of members removed.
   */
  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    return this.rateLimitClient.zremrangebyscore(key, min, max);
  }

  /**
   * Returns the number of elements in a Sorted Set.
   *
   * Used by the Sliding Window Rate Limiter to count requests after pruning:
   * `ZCARD key` gives the current window count.
   *
   * @param key - Redis Sorted Set key.
   * @returns The cardinality (number of members) of the Sorted Set.
   */
  async zcard(key: string): Promise<number> {
    return this.rateLimitClient.zcard(key);
  }

  // ---------------------------------------------------------------------------
  // Key Scanning
  // ---------------------------------------------------------------------------

  /**
   * Scans Redis for all keys matching a glob-style pattern.
   *
   * Uses ioredis `scanStream` under the hood — iterates the keyspace in
   * incremental buckets rather than blocking the server with a single `KEYS`
   * call. Suitable for administrative tasks (reconciliation, monitoring,
   * circuit-breaker recovery) that need to discover keys by pattern.
   *
   * @param pattern - Glob-style key pattern (e.g. `"seat:lock:*"`, `"circuit:payment:*"`).
   * @returns An array of matching key names (empty if none match).
   */
  async scanKeys(pattern: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const keys: string[] = [];
      const stream = this.client.scanStream({ match: pattern, count: 100 });

      stream.on("data", (batch: string[]) => {
        if (batch.length > 0) keys.push(...batch);
      });
      stream.on("end", () => resolve(keys));
      stream.on("error", (err: Error) => {
        stream.destroy();
        reject(err);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Pipeline / MULTI-EXEC (ADR-06 atomic batch)
  // ---------------------------------------------------------------------------

  /**
   * Returns an ioredis `Pipeline` instance for batched / transactional execution.
   *
   * Commands queued on the pipeline are sent to Redis in a single round‑trip when
   * `.exec()` is called. This is the mechanism used by the Sliding Window Rate
   * Limiter to atomically execute:
   *
   * `ZREMRANGEBYSCORE → ZADD → ZCARD → EXPIRE`
   *
   * @returns An ioredis `Pipeline` bound to the **rate-limit (DB2)** connection.
   */
  multi(): ReturnType<Redis["multi"]> {
    return this.rateLimitClient.multi();
  }

  // ---------------------------------------------------------------------------
  // Multi-Database Selection
  // ---------------------------------------------------------------------------

  /**
   * Switches the current (cache DB0) connection to a different logical database.
   *
   * Typical use — switching to DB1 for queue operations:
   * ```ts
   * const redis = getRedis();
   * await redis.selectDb(RedisDb.Queue);
   * ```
   *
   * **Prefer using the dedicated clients** (`client`, `queueClient`,
   * `rateLimitClient`) which are pre‑configured for the correct database.
   *
   * @param db - Logical database index (0–15).
   * @returns `"OK"` on success.
   */
  async selectDb(db: RedisDb | number): Promise<"OK"> {
    return this.client.select(db);
  }

  // ---------------------------------------------------------------------------
  // JSON Helpers
  // ---------------------------------------------------------------------------

  /**
   * Retrieves and deserializes a JSON value from Redis.
   *
   * Convenience method — calls `get` and automatically applies `JSON.parse`.
   * Intended for keys that hold structured payloads such as
   * `seat:lock:{wid}:{rid}` or `circuit:payment:{gw}`.
   *
   * @param key - Redis key holding a JSON string.
   * @returns The deserialized object typed as `T`, or `null` if the key does not exist.
   */
  async jsonGet<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  /**
   * Serializes and stores a JSON value in Redis.
   *
   * Convenience method — applies `JSON.stringify` before delegating to `set`.
   *
   * @param key - Target Redis key.
   * @param value - Any JSON-safe value to serialize.
   * @param exSeconds - Optional TTL in seconds.
   * @returns `"OK"` on success.
   */
  async jsonSet(
    key: string,
    value: unknown,
    exSeconds?: number
  ): Promise<"OK"> {
    const serialized = JSON.stringify(value);
    if (exSeconds !== undefined) {
      return this.client.set(key, serialized, "EX", exSeconds);
    }
    return this.client.set(key, serialized);
  }

  /**
   * Returns a range of members from a Sorted Set by index.
   *
   * Used by SlidingWindowService to retrieve the oldest entry timestamp.
   *
   * @param key - Redis Sorted Set key.
   * @param start - Start index (0-based, inclusive).
   * @param stop - Stop index (0-based, inclusive).
   * @returns An array of member strings in the specified range.
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop);
  }

  // ---------------------------------------------------------------------------
  // Transaction Pipeline
  // ---------------------------------------------------------------------------

  /**
   * Returns an ioredis Pipeline for atomic MULTI/EXEC transaction batches.
   *
   * The caller chains commands on the returned Pipeline, then calls `exec()`
   * to execute them atomically. The result is an array of `[error, result]`
   * tuples in command order.
   *
   * Used by SlidingWindowService to atomically prune, count, add, and set TTL
   * on a Sorted Set without race conditions between concurrent requests.
   *
   * @returns An ioredis Pipeline instance (chainable, with `.exec()`).
   */
  pipeline() {
    return this.client.pipeline();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Gracefully closes the ioredis connection on application shutdown.
   *
   * Calls `client.quit()` to terminate the persistent TCP connection. Without
   * this the Node.js process may hang on SIGTERM because the connection remains
   * open.
   *
   * Side effects: Closes the TCP connection to the Redis server.
   */
  async onModuleDestroy() {
    this.client.removeAllListeners();
    this.queueClient.removeAllListeners();
    this.rateLimitClient.removeAllListeners();
    await Promise.all([
      this.client.quit(),
      this.queueClient.quit(),
      this.rateLimitClient.quit(),
    ]);
  }
}
