import { Module } from "@nestjs/common";

import { RedisModule } from "@/infra/redis/redis.module";

import { GlobalRateLimitMechanic } from "./services/global-rate-limit.service";
import { RateLimiterMechanic } from "./services/rate-limiter.service";

@Module({
  imports: [RedisModule],
  providers: [RateLimiterMechanic, GlobalRateLimitMechanic],
  exports: [RateLimiterMechanic, GlobalRateLimitMechanic],
})
export class RateLimitModule {}
