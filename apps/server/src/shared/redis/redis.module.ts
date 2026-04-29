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

import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
