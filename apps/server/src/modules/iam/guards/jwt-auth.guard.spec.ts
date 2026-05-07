import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RedisService } from "@/infra/redis/redis.service";
import { Result } from "@/shared/response/result";

import { JwtAuthGuard } from "./jwt-auth.guard";
import { TokenService } from "../services/token.service";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let tokenService: jest.Mocked<TokenService>;
  let redisService: jest.Mocked<RedisService>;

  const createMockContext = (authHeader?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: authHeader },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as any;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    tokenService = {
      verifyAccessToken: jest.fn(),
    } as any;
    redisService = {
      get: jest.fn(),
    } as any;
    guard = new JwtAuthGuard(reflector, tokenService, redisService);
  });

  describe("public routes", () => {
    it("allows when @Public() is set", async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      await expect(guard.canActivate(createMockContext())).resolves.toBe(true);
    });
  });

  describe("token extraction", () => {
    it("throws when no Authorization header", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("throws when header does not start with Bearer", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      await expect(
        guard.canActivate(createMockContext("Basic token"))
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("token verification", () => {
    it("throws when token is expired", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      tokenService.verifyAccessToken.mockResolvedValue(
        Result.fail({
          category: "AUTH",
          code: "TOKEN_EXPIRED",
          message: "Access token has expired. Please refresh.",
        })
      );
      await expect(
        guard.canActivate(createMockContext("Bearer expired.token.here"))
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when token is invalid", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      tokenService.verifyAccessToken.mockResolvedValue(
        Result.fail({
          category: "AUTH",
          code: "TOKEN_INVALID",
          message: "JWT signature is invalid or malformed.",
        })
      );
      await expect(
        guard.canActivate(createMockContext("Bearer bad.token.here"))
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("blacklist check", () => {
    it("throws when jti is blacklisted", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      tokenService.verifyAccessToken.mockResolvedValue(
        Result.ok({
          sub: "u1",
          role: "STUDENT",
          jti: "jti-revoked",
          allowed_workshop_ids: [],
        })
      );
      redisService.get.mockResolvedValue("revoked");
      await expect(
        guard.canActivate(createMockContext("Bearer valid.token.here"))
      ).rejects.toThrow("Token has been revoked");
    });
  });

  describe("suspension check", () => {
    it("throws when user is suspended", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      tokenService.verifyAccessToken.mockResolvedValue(
        Result.ok({
          sub: "u1",
          role: "STUDENT",
          jti: "jti-ok",
          allowed_workshop_ids: [],
        })
      );
      redisService.get
        .mockResolvedValueOnce(null) // blacklist check returns null (not revoked)
        .mockResolvedValueOnce("true"); // suspension check returns "true"
      await expect(
        guard.canActivate(createMockContext("Bearer valid.token.here"))
      ).rejects.toThrow("Account has been suspended");
    });
  });

  describe("valid token", () => {
    it("attaches payload and returns true", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      tokenService.verifyAccessToken.mockResolvedValue(
        Result.ok({
          sub: "u1",
          role: "STUDENT",
          jti: "jti-ok",
          allowed_workshop_ids: [],
        })
      );
      redisService.get.mockResolvedValue(null);
      const context = createMockContext("Bearer valid.token.here");
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
