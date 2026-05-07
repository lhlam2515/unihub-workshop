import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";

import { RedisService } from "@/infra/redis/redis.service";
import { authErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";
import type { JwtPayload, UserRole } from "@/types/jwt-payload";

export const ACCESS_EXPIRY = { WEB: 900, MOBILE: 28800 } as const;
const REFRESH_EXPIRY_SECONDS = 604_800;

@Injectable()
export class TokenService {
  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService
  ) {}

  /**
   * Signs a JWT access token with platform-specific expiry.
   *
   * Business rules:
   * - WEB tokens expire in 15 minutes; MOBILE tokens expire in 8 hours.
   * - CHECKIN_STAFF tokens include the staff's assigned workshop IDs.
   * - Each token carries a unique `jti` for blacklist-based revocation.
   *
   * @param payload.userId - The user's system ID embedded as `sub`.
   * @param payload.role - RBAC role used by RolesGuard for authorization.
   * @param payload.allowedWorkshopIds - Workshop IDs attached only for CHECKIN_STAFF.
   * @param platform - Determines the token's `exp` claim (WEB 900s, MOBILE 28800s).
   * @returns The signed JWT string.
   */
  signAccessToken(
    payload: {
      userId: string;
      role: UserRole;
      allowedWorkshopIds?: string[];
    },
    platform: "WEB" | "MOBILE"
  ): Promise<string> {
    const jti = randomUUID();
    return Promise.resolve(
      jwt.sign(
        {
          sub: payload.userId,
          role: payload.role,
          jti,
          allowed_workshop_ids: payload.allowedWorkshopIds ?? [],
        },
        this.config.getOrThrow<string>("jwt.secret"),
        { expiresIn: ACCESS_EXPIRY[platform] }
      )
    );
  }

  /**
   * Signs a JWT refresh token with a 7-day expiry.
   *
   * Business rules:
   * - Signed with a separate `JWT_REFRESH_SECRET` to limit blast radius.
   * - Consumed refresh tokens are blacklisted in Redis (rotation).
   *
   * @param userId - The user's system ID embedded as `sub`.
   * @returns The signed JWT string.
   */
  signRefreshToken(userId: string): Promise<string> {
    const jti = randomUUID();
    return Promise.resolve(
      jwt.sign(
        { sub: userId, jti },
        this.config.getOrThrow<string>("jwt.refreshSecret"),
        {
          expiresIn: REFRESH_EXPIRY_SECONDS,
        }
      )
    );
  }

  /**
   * Signs a short-lived QR token for ticket check-in.
   *
   * Business rules:
   * - Token contains the ticket_id, workshop_id, and student_id.
   * - Expires in 30 days, matching the workshop event lifecycle.
   * - Signed with the same JWT secret as access tokens for validation simplicity.
   *
   * @param payload.ticket_id - The ticket UUID from the database.
   * @param payload.workshop_id - The workshop UUID the ticket grants access to.
   * @param payload.student_id - The student's user UUID.
   * @returns The signed JWT string (30-day expiry).
   */
  signQrToken(payload: {
    ticket_id: string;
    workshop_id: string;
    student_id: string;
  }): string {
    return jwt.sign(payload, this.config.getOrThrow<string>("jwt.secret"), {
      expiresIn: "30d",
    });
  }

  /**
   * Verifies a JWT access token's signature and expiration.
   *
   * @param token - The raw JWT string from the Authorization header.
   * @returns OkResult containing the decoded JwtPayload, or FailResult with:
   *   - TOKEN_EXPIRED: The token's `exp` claim is in the past.
   *   - TOKEN_INVALID: Malformed token, bad signature, or other JWT error.
   */
  verifyAccessToken(token: string): Promise<Result<JwtPayload>> {
    return tryCatch(
      () =>
        Promise.resolve(
          jwt.verify(
            token,
            this.config.getOrThrow<string>("jwt.secret")
          ) as JwtPayload
        ),
      (err) => {
        if (err instanceof jwt.TokenExpiredError) {
          return authErrors.tokenExpired();
        }
        return authErrors.tokenInvalid(err);
      }
    );
  }

  /**
   * Verifies a JWT refresh token's signature and expiration.
   *
   * @param token - The raw JWT string from the refresh request.
   * @returns OkResult containing `{ sub, jti }`, or FailResult with REFRESH_TOKEN_INVALID.
   */
  verifyRefreshToken(
    token: string
  ): Promise<Result<{ sub: string; jti: string }>> {
    return tryCatch(
      () =>
        Promise.resolve(
          jwt.verify(
            token,
            this.config.getOrThrow<string>("jwt.refreshSecret")
          ) as { sub: string; jti: string }
        ),
      (err) => authErrors.refreshTokenInvalid(err)
    );
  }

  /**
   * Adds a token identifier to the Redis blacklist.
   *
   * Side effects: Writes to Redis key `token:blacklist:{jti}` with the specified TTL.
   * Idempotent: Calling multiple times with the same jti overwrites the previous entry.
   *
   * @param jti - The unique token identifier to revoke.
   * @param remainingTtl - TTL in seconds, matching the token's remaining lifetime.
   */
  async blacklistToken(jti: string, remainingTtl: number): Promise<void> {
    await this.redisService.set(
      `token:blacklist:${jti}`,
      "revoked",
      remainingTtl
    );
  }

  /**
   * Checks whether a token identifier has been blacklisted.
   *
   * @param jti - The unique token identifier to look up.
   * @returns `true` if the jti exists in the Redis blacklist, `false` otherwise.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redisService.get(`token:blacklist:${jti}`);
    return result !== null;
  }
}
