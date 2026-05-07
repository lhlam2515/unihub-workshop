import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";

import { RedisService } from "@/infra/redis/redis.service";
import { authErrors } from "@/shared/response/errors";

import { TokenService } from "./token.service";

const OLD_ENV = process.env;

describe("TokenService", () => {
  let tokenService: TokenService;
  let mockRedisService: Record<string, jest.Mock>;

  beforeAll(() => {
    process.env = {
      ...OLD_ENV,
      JWT_SECRET: "test-jwt-secret-for-unit-tests",
      JWT_REFRESH_SECRET: "test-refresh-secret-for-unit-tests",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const configs: Record<string, unknown> = {
        "jwt.secret": "test-jwt-secret-for-unit-tests",
        "jwt.refreshSecret": "test-refresh-secret-for-unit-tests",
        "jwt.accessExpiry.WEB": 900,
        "jwt.accessExpiry.MOBILE": 28800,
        "jwt.refreshExpiry": 604800,
      };
      return configs[key] ?? defaultValue ?? null;
    }),
    getOrThrow: jest.fn((key: string) => {
      const configs: Record<string, unknown> = {
        "jwt.secret": "test-jwt-secret-for-unit-tests",
        "jwt.refreshSecret": "test-refresh-secret-for-unit-tests",
        "jwt.accessExpiry.WEB": 900,
        "jwt.accessExpiry.MOBILE": 28800,
        "jwt.refreshExpiry": 604800,
      };
      if (!(key in configs)) throw new Error(`Config ${key} not found`);
      return configs[key];
    }),
  };

  beforeEach(async () => {
    mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    tokenService = module.get<TokenService>(TokenService);
  });

  // -------------------------------------------------------------------------
  // signAccessToken
  // -------------------------------------------------------------------------
  describe("signAccessToken", () => {
    it("signs a WEB token with 900s expiry", async () => {
      const token = await tokenService.signAccessToken(
        {
          userId: "usr-1",
          role: "STUDENT",
        },
        "WEB"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Record<
        string,
        unknown
      >;
      expect(decoded.sub).toBe("usr-1");
      expect(decoded.role).toBe("STUDENT");
      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.jti).toBe("string");
      expect(decoded.allowed_workshop_ids).toEqual([]);
      expect(decoded.exp).toBeDefined();
      // Should expire in ~900s from now
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      expect(expDelta).toBeGreaterThan(850);
      expect(expDelta).toBeLessThanOrEqual(900);
    });

    it("signs a MOBILE token with 28800s expiry", async () => {
      const token = await tokenService.signAccessToken(
        {
          userId: "usr-2",
          role: "BTC",
        },
        "MOBILE"
      );

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Record<
        string,
        unknown
      >;
      expect(decoded.sub).toBe("usr-2");
      expect(decoded.role).toBe("BTC");
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      expect(expDelta).toBeGreaterThan(28700);
      expect(expDelta).toBeLessThanOrEqual(28800);
    });

    it("includes allowedWorkshopIds for CHECKIN_STAFF", async () => {
      const token = await tokenService.signAccessToken(
        {
          userId: "usr-staff",
          role: "CHECKIN_STAFF",
          allowedWorkshopIds: ["ws-1", "ws-2"],
        },
        "WEB"
      );

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Record<
        string,
        unknown
      >;
      expect(decoded.allowed_workshop_ids).toEqual(["ws-1", "ws-2"]);
    });

    it("generates a unique jti per call", async () => {
      const token1 = await tokenService.signAccessToken(
        { userId: "usr-1", role: "STUDENT" },
        "WEB"
      );
      const token2 = await tokenService.signAccessToken(
        { userId: "usr-1", role: "STUDENT" },
        "WEB"
      );

      const decoded1 = jwt.decode(token1) as Record<string, unknown>;
      const decoded2 = jwt.decode(token2) as Record<string, unknown>;
      expect(decoded1.jti).not.toBe(decoded2.jti);
    });
  });

  // -------------------------------------------------------------------------
  // signRefreshToken
  // -------------------------------------------------------------------------
  describe("signRefreshToken", () => {
    it("signs a refresh token with 7-day expiry", async () => {
      const token = await tokenService.signRefreshToken("usr-1");

      expect(token).toBeDefined();
      const decoded = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET!
      ) as Record<string, unknown>;
      expect(decoded.sub).toBe("usr-1");
      expect(decoded.jti).toBeDefined();
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      // 604_800 seconds = 7 days
      expect(expDelta).toBeGreaterThan(604700);
      expect(expDelta).toBeLessThanOrEqual(604800);
    });

    it("generates a unique jti per call", async () => {
      const token1 = await tokenService.signRefreshToken("usr-1");
      const token2 = await tokenService.signRefreshToken("usr-1");

      const decoded1 = jwt.decode(token1) as Record<string, unknown>;
      const decoded2 = jwt.decode(token2) as Record<string, unknown>;
      expect(decoded1.jti).not.toBe(decoded2.jti);
    });
  });

  // -------------------------------------------------------------------------
  // verifyAccessToken
  // -------------------------------------------------------------------------
  describe("verifyAccessToken", () => {
    it("returns OkResult with payload for a valid token", async () => {
      const token = await tokenService.signAccessToken(
        { userId: "usr-1", role: "STUDENT" },
        "WEB"
      );

      const result = await tokenService.verifyAccessToken(token);

      expect(result.isSuccess).toBe(true);
      expect(result.data.sub).toBe("usr-1");
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.jti).toBeDefined();
    });

    it("returns FailResult with TOKEN_EXPIRED for expired token", async () => {
      const expiredToken = jwt.sign(
        { sub: "usr-1", role: "STUDENT", jti: "test-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 0 }
      );
      // Small delay to ensure expiry
      await new Promise((r) => setTimeout(r, 100));

      const result = await tokenService.verifyAccessToken(expiredToken);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(authErrors.tokenExpired());
    });

    it("returns FailResult with TOKEN_INVALID for bad signature", async () => {
      const badToken = jwt.sign(
        { sub: "usr-1", role: "STUDENT", jti: "test-jti" },
        "wrong-secret"
      );

      const result = await tokenService.verifyAccessToken(badToken);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TOKEN_INVALID");
    });

    it("returns FailResult with TOKEN_INVALID for malformed token", async () => {
      const result = await tokenService.verifyAccessToken(
        "malformed.token.here"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TOKEN_INVALID");
    });
  });

  // -------------------------------------------------------------------------
  // verifyRefreshToken
  // -------------------------------------------------------------------------
  describe("verifyRefreshToken", () => {
    it("returns OkResult with sub and jti for a valid refresh token", async () => {
      const refreshToken = await tokenService.signRefreshToken("usr-1");

      const result = await tokenService.verifyRefreshToken(refreshToken);

      expect(result.isSuccess).toBe(true);
      expect(result.data.sub).toBe("usr-1");
      expect(result.data.jti).toBeDefined();
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID for bad signature", async () => {
      const badToken = jwt.sign(
        { sub: "usr-1", jti: "test-jti" },
        "wrong-refresh-secret"
      );

      const result = await tokenService.verifyRefreshToken(badToken);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID for expired token", async () => {
      const expiredToken = jwt.sign(
        { sub: "usr-1", jti: "test-jti" },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: 0 }
      );
      await new Promise((r) => setTimeout(r, 100));

      const result = await tokenService.verifyRefreshToken(expiredToken);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });
  });

  // -------------------------------------------------------------------------
  // blacklistToken
  // -------------------------------------------------------------------------
  describe("blacklistToken", () => {
    it("stores revoked jti in Redis with TTL", async () => {
      mockRedisService.set.mockResolvedValue("OK");

      await tokenService.blacklistToken("test-jti", 900);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        "token:blacklist:test-jti",
        "revoked",
        900
      );
    });
  });

  // -------------------------------------------------------------------------
  // isBlacklisted
  // -------------------------------------------------------------------------
  describe("isBlacklisted", () => {
    it("returns true when jti exists in Redis", async () => {
      mockRedisService.get.mockResolvedValue("revoked");

      const result = await tokenService.isBlacklisted("test-jti");

      expect(result).toBe(true);
      expect(mockRedisService.get).toHaveBeenCalledWith(
        "token:blacklist:test-jti"
      );
    });

    it("returns false when jti does not exist in Redis", async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await tokenService.isBlacklisted("unknown-jti");

      expect(result).toBe(false);
    });
  });
});
