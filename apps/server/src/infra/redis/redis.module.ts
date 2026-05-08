/**
 * Redis Module
 *
 * Global module that provides {@link RedisService} — the sole abstraction layer
 * over ioredis. Imported once in `AppModule`. The `@Global()` decorator makes
 * `RedisService` injectable in every feature module without explicit imports.
 *
 * Design rationale:
 * - A global module avoids requiring every feature module to import RedisModule
 *   individually. This is the canonical NestJS pattern for infrastructure providers
 *   consumed across the entire system.
 *
 * Side effects: None. This module only registers a provider, it executes no logic.
 */
import { Global, Module } from "@nestjs/common";

import {
  REDIS_CACHE,
  REDIS_QUEUE,
  REDIS_RATE_LIMIT,
} from "./redis.constants";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    RedisService,
    // Aliases so consumers can be explicit about which logical DB they target.
    // All resolve to the same RedisService instance (3 connections managed internally).
    { provide: REDIS_CACHE, useExisting: RedisService },
    { provide: REDIS_QUEUE, useExisting: RedisService },
    { provide: REDIS_RATE_LIMIT, useExisting: RedisService },
  ],
  exports: [RedisService, REDIS_CACHE, REDIS_QUEUE, REDIS_RATE_LIMIT],
})
export class RedisModule {}
