/**
 * JWT Authentication Guard
 *
 * Primary inbound security gate. Runs first in the request lifecycle and
 * enforces authentication for every route unless explicitly skipped via
 * the `@Public()` decorator.
 *
 * Lifecycle position: Stage 1 — Inbound Security (before ZodValidationPipe).
 * Depends on: JwtAuthGuard
 *
 * Verification flow:
 * 1. Skip if the route is decorated with `@Public()`.
 * 2. Extract the Bearer token from the `Authorization` header.
 * 3. Verify the JWT signature and expiration using TokenService (RS256).
 * 4. Check the token's `jti` against the Redis blacklist (`token:blacklist:{jti}`).
 * 5. Attach the decoded `JwtPayload` to `request.user` for downstream guards and decorators.
 *
 * Error mapping (caught by GlobalExceptionFilter):
 * - Missing Authorization header → 401 "Missing authorization token"
 * - Invalid or expired JWT → 401 "Invalid token"
 * - Blacklisted token → 401 "Token has been revoked"
 *
 * @see {@link Public} decorator for skipping authentication
 * @see {@link JwtPayload} for the shape attached to request.user
 * @see {@link RolesGuard} for the next stage in the guard chain
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

import { RedisService } from "@/infra/redis/redis.service";
import { IS_PUBLIC_KEY } from "@/shared/decorators/public.decorator";
import { authErrors } from "@/shared/response/errors";

import { TokenService } from "../services/token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Authenticates the request by validating the Bearer JWT token.
   *
   * Business rules:
   * - Routes marked with `@Public()` bypass authentication entirely.
   * - The token must be present in the `Authorization: Bearer <token>` header.
   * - The JWT signature and expiration are verified using TokenService (RS256).
   * - If the token's `jti` is found in the Redis blacklist, the request is rejected
   *   even if the JWT is structurally valid.
   *
   * Side effects:
   * - Reads from `token:blacklist:{jti}` in Redis for revocation check.
   * - Attaches the decoded `JwtPayload` to `request.user`.
   *
   * @param context - NestJS execution context providing access to the HTTP request.
   * @returns `true` if the token is valid and not blacklisted.
   * @throws UnauthorizedException if the token is missing, invalid, expired, or revoked.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Missing authorization token");
    }

    const verifyResult = await this.tokenService.verifyAccessToken(token);
    if (verifyResult.isFailure) {
      throw new UnauthorizedException("Invalid token");
    }

    const payload = verifyResult.data;

    const isBlacklisted = await this.redisService.get(
      `token:blacklist:${payload.jti}`
    );
    if (isBlacklisted !== null) {
      throw new UnauthorizedException("Token has been revoked");
    }

    const isSuspended = await this.redisService.get(
      `user:suspended:${payload.sub}`
    );
    if (isSuspended !== null) {
      throw new UnauthorizedException(
        authErrors.userSuspended(payload.sub).message
      );
    }

    request.user = payload;
    return true;
  }

  /**
   * Extracts the Bearer token from the Authorization header.
   *
   * @param request - Incoming HTTP request.
   * @returns The raw JWT string if the header is present and uses the Bearer scheme, `undefined` otherwise.
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
