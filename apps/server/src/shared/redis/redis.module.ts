/**
 * Redis Module
 *
 * Global module cung cấp RedisService thông qua ioredis.
 * Đọc REDIS_URL từ config. Export RedisService để tất cả module
 * dùng không cần import lại.
 */

import { Global, Module } from "@nestjs/common";

import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
