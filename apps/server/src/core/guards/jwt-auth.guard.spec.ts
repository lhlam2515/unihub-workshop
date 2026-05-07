import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";

import { RedisService } from "@/infra/redis/redis.service";

import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;

  const JWT_SECRET = "test-secret";

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

  const signToken = (payload: object, expiresInSec?: number) =>
    jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    redisService = {
      get: jest.fn(),
    } as any;
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === "jwt.secret") return JWT_SECRET;
        return "";
      }),
    } as any;
    guard = new JwtAuthGuard(reflector, redisService, configService);
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
      const token = signToken({ sub: "u1", role: "STUDENT", jti: "jti-1" }, 0);
      await new Promise((r) => setTimeout(r, 100));
      await expect(
        guard.canActivate(createMockContext(`Bearer ${token}`))
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when token has bad signature", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const token = jwt.sign(
        { sub: "u1", role: "STUDENT", jti: "jti-1" },
        "wrong-secret"
      );
      await expect(
        guard.canActivate(createMockContext(`Bearer ${token}`))
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when token is malformed", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      await expect(
        guard.canActivate(createMockContext("Bearer malformed.token.here"))
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("blacklist check", () => {
    it("throws when jti is blacklisted", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const token = signToken(
        { sub: "u1", role: "STUDENT", jti: "jti-revoked" },
        3600
      );
      redisService.get.mockResolvedValue("revoked");
      await expect(
        guard.canActivate(createMockContext(`Bearer ${token}`))
      ).rejects.toThrow("Token has been revoked");
    });
  });

  describe("suspension check", () => {
    it("throws when user is suspended", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const token = signToken(
        { sub: "u1", role: "STUDENT", jti: "jti-ok" },
        3600
      );
      redisService.get
        .mockResolvedValueOnce(null) // blacklist check returns null (not revoked)
        .mockResolvedValueOnce("true"); // suspension check returns "true"
      await expect(
        guard.canActivate(createMockContext(`Bearer ${token}`))
      ).rejects.toThrow("Account has been suspended");
    });
  });

  describe("valid token", () => {
    it("attaches payload and returns true", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const token = signToken(
        { sub: "u1", role: "STUDENT", jti: "jti-ok" },
        3600
      );
      redisService.get.mockResolvedValue(null);
      const context = createMockContext(`Bearer ${token}`);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
