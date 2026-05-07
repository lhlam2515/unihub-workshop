import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { RedisModule } from "@/infra/redis/redis.module";

import { RateLimitGuard } from "./guards/rate-limit.guard";
import { SlidingWindowService } from "./services/sliding-window.service";

@Module({
  imports: [RedisModule, DiscoveryModule],
  providers: [SlidingWindowService, RateLimitGuard],
  exports: [SlidingWindowService, RateLimitGuard],
})
export class RateLimitModule {}
