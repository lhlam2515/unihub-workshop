/**
 * Three-tier rate-limit thresholds for the Sliding Window algorithm.
 *
 * T1 — IP-based throttling for auth and list endpoints (60 req / 60s).
 * T2 — User-based throttling for authenticated write endpoints (30 req / 60s).
 * T3 — User×Workspace based throttling for registration/payment (5 req / 60s).
 */
export const RATE_LIMIT_TIERS = {
  T1: { limit: 60, windowMs: 60_000 },
  T2: { limit: 30, windowMs: 60_000 },
  T3: { limit: 5, windowMs: 60_000 },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RateLimitTierName = keyof typeof RATE_LIMIT_TIERS;

export interface RateLimitConfig {
  tier: RateLimitTierName;
  limit: number;
  windowMs: number;
  /**
   * Dot-path into the request object to extract a resource-specific identifier.
   *
   * When set, the resolved value is appended to the base identifier (JWT sub or
   * IP) with a colon separator. This enables per-resource rate limiting (e.g. T3
   * per user×workshop instead of per-user).
   *
   * If the path resolves to a falsy value (missing field, null, undefined), the
   * tier falls back to the base identifier alone — degraded but non-blocking.
   *
   * @example "body.workshopId" → identifier = "user-uuid:workshop-uuid"
   */
  resourceIdSource?: string;
}

/** Metadata key used by the @RateLimit decorator and RateLimitGuard. */
export const RATE_LIMIT_KEY = "rate_limit:tier";

// Response header names (standardized across the API)
export const HEADER_LIMIT = "X-RateLimit-Limit";
export const HEADER_REMAINING = "X-RateLimit-Remaining";
export const HEADER_RESET = "X-RateLimit-Reset";
export const HEADER_RETRY_AFTER = "Retry-After";
