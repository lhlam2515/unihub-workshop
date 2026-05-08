/** DI token targeting the cache (DB0) Redis client. */
export const REDIS_CACHE = "REDIS_CACHE";
/** DI token targeting the queue (DB1) Redis client. */
export const REDIS_QUEUE = "REDIS_QUEUE";
/** DI token targeting the rate-limit (DB2) Redis client. */
export const REDIS_RATE_LIMIT = "REDIS_RATE_LIMIT";

/** DI token exposing the raw ioredis client (DB1) for BullMQ native Worker/Queue constructors. */
export const REDIS_QUEUE_CLIENT = Symbol("REDIS_QUEUE_CLIENT");
