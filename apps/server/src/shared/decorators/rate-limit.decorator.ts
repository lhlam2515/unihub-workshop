import { SetMetadata } from "@nestjs/common";

import {
  RATE_LIMIT_KEY,
  RATE_LIMIT_TIERS,
} from "@/modules/rate-limit/constants/rate-limit.constants";
import type { RateLimitTierName } from "@/modules/rate-limit/constants/rate-limit.constants";

export interface RateLimitConfig {
  tier: RateLimitTierName;
  limit: number;
  windowMs: number;
}

/**
 * Decorator that attaches rate-limit tier metadata to a controller method or class.
 *
 * When applied at the class level, the config is inherited by all methods.
 * A method-level annotation overrides the class-level one.
 *
 * @example
 * ```typescript
 * @RateLimit([{ tier: "T1", limit: 60, windowMs: 60000 }])
 * @Post("login")
 * async login() { ... }
 * ```
 */
export const RateLimit = (
  configs: RateLimitConfig[] = [{ tier: "T2", ...RATE_LIMIT_TIERS.T2 }]
) => SetMetadata(RATE_LIMIT_KEY, configs);
