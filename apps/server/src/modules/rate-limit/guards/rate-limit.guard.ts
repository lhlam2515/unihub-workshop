import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RATE_LIMIT_KEY } from "../constants/rate-limit.constants";
import {
  HEADER_LIMIT,
  HEADER_REMAINING,
  HEADER_RESET,
  HEADER_RETRY_AFTER,
} from "../constants/rate-limit.constants";
import type { RateLimitConfig } from "../constants/rate-limit.constants";
import { SlidingWindowService } from "../services/sliding-window.service";

/**
 * NestJS guard that enforces rate-limit tiers sequentially (T1 → T2 → T3).
 *
 * The guard reads `@RateLimit()` metadata from the handler (method-level
 * takes precedence over class-level). For each configured tier it delegates
 * to `SlidingWindowService.check()` and, if the limit is exceeded, throws
 * an `HttpException` with status 429.
 *
 * Response headers are set on every request:
 * - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
 *
 * Subject derivation:
 * - For authenticated requests the subject is the JWT `sub` claim.
 * - For unauthenticated requests the subject is the client IP address.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly slidingWindow: SlidingWindowService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configs =
      this.reflector.getAllAndOverride<RateLimitConfig[]>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (configs.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const identifier = (request as any).user?.sub ?? request.ip ?? "unknown";
    const response = context.switchToHttp().getResponse();

    for (const cfg of configs) {
      const result = await this.slidingWindow.check(cfg.tier, identifier);

      const data = result.isSuccess ? result.data : null;
      if (data) {
        response.header(HEADER_LIMIT, String(cfg.limit));
        response.header(HEADER_REMAINING, String(data.remaining));
        response.header(HEADER_RESET, String(data.resetMs));
        if (!data.allowed) {
          response.header(
            HEADER_RETRY_AFTER,
            String(Math.ceil(data.resetMs / 1000))
          );
        }
      }

      if (result.isFailure) {
        const err = result.error;
        response.header(
          HEADER_RETRY_AFTER,
          String(Math.ceil((err.context?.retryAfterSeconds as number) ?? 1))
        );
        throw new HttpException(
          {
            success: false,
            error: {
              code: err.code,
              message: err.message,
              context: err.context,
            },
          },
          429
        );
      }
    }

    return true;
  }
}
