import crypto from "crypto";

import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";

import { RedisService } from "@/infra/redis/redis.service";
import { authErrors } from "@/shared/response/errors";

import { TokenService } from "./token.service";

describe("TokenService", () => {
  let tokenService: TokenService;
  let mockRedisService: Record<string, jest.Mock>;
  let privateKey: string;
  let publicKey: string;
  let wrongPrivateKey: string;

  beforeAll(() => {
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;

    const wrongPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    wrongPrivateKey = wrongPair.privateKey;
  });

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const configs: Record<string, unknown> = {
        "jwt.privateKey": privateKey,
        "jwt.publicKey": publicKey,
        "jwt.secret": "test-hs256-secret",
        "jwt.accessExpiry.WEB": 900,
        "jwt.accessExpiry.MOBILE": 28800,
        "jwt.refreshExpiry": 604800,
      };
      return configs[key] ?? defaultValue ?? null;
    }),
    getOrThrow: jest.fn((key: string) => {
      const configs: Record<string, unknown> = {
        "jwt.privateKey": privateKey,
        "jwt.publicKey": publicKey,
        "jwt.secret": "test-hs256-secret",
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
        { identityId: "usr-1", role: "STUDENT" },
        "WEB"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const decoded = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as Record<string, unknown>;
      expect(decoded.sub).toBe("usr-1");
      expect(decoded.role).toBe("STUDENT");
      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.jti).toBe("string");
      expect(decoded.allowed_workshop_ids).toEqual([]);
      expect(decoded.exp).toBeDefined();
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      expect(expDelta).toBeGreaterThan(850);
      expect(expDelta).toBeLessThanOrEqual(900);
    });

    it("signs a MOBILE token with 28800s expiry", async () => {
      const token = await tokenService.signAccessToken(
        { identityId: "usr-2", role: "BTC" },
        "MOBILE"
      );

      const decoded = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as Record<string, unknown>;
      expect(decoded.sub).toBe("usr-2");
      expect(decoded.role).toBe("BTC");
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      expect(expDelta).toBeGreaterThan(28700);
      expect(expDelta).toBeLessThanOrEqual(28800);
    });

    it("includes allowedWorkshopIds for CHECKIN_STAFF", async () => {
      const token = await tokenService.signAccessToken(
        {
          identityId: "usr-staff",
          role: "CHECKIN_STAFF",
          allowedWorkshopIds: ["ws-1", "ws-2"],
        },
        "WEB"
      );

      const decoded = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as Record<string, unknown>;
      expect(decoded.allowed_workshop_ids).toEqual(["ws-1", "ws-2"]);
    });

    it("generates a unique jti per call", async () => {
      const token1 = await tokenService.signAccessToken(
        { identityId: "usr-1", role: "STUDENT" },
        "WEB"
      );
      const token2 = await tokenService.signAccessToken(
        { identityId: "usr-1", role: "STUDENT" },
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
      const token = await tokenService.signRefreshToken("usr-1", "STUDENT");

      expect(token).toBeDefined();
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as Record<string, unknown>;
      expect(decoded.sub).toBe("usr-1");
      expect(decoded.type).toBe("STUDENT");
      expect(decoded.jti).toBeDefined();
      const expDelta = (decoded.exp as number) - Math.floor(Date.now() / 1000);
      expect(expDelta).toBeGreaterThan(604700);
      expect(expDelta).toBeLessThanOrEqual(604800);
    });

    it("generates a unique jti per call", async () => {
      const token1 = await tokenService.signRefreshToken("usr-1", "STUDENT");
      const token2 = await tokenService.signRefreshToken("usr-1", "STUDENT");

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
        { identityId: "usr-1", role: "STUDENT" },
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
        privateKey,
        { algorithm: "RS256", expiresIn: 0 }
      );
      await new Promise((r) => setTimeout(r, 100));

      const result = await tokenService.verifyAccessToken(expiredToken);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(authErrors.tokenExpired());
    });

    it("returns FailResult with TOKEN_INVALID for bad signature", async () => {
      const badToken = jwt.sign(
        { sub: "usr-1", role: "STUDENT", jti: "test-jti" },
        wrongPrivateKey,
        { algorithm: "RS256" }
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
      const refreshToken = await tokenService.signRefreshToken(
        "usr-1",
        "STUDENT"
      );

      const result = await tokenService.verifyRefreshToken(refreshToken);

      expect(result.isSuccess).toBe(true);
      expect(result.data.sub).toBe("usr-1");
      expect(result.data.jti).toBeDefined();
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID for bad signature", async () => {
      const badToken = jwt.sign(
        { sub: "usr-1", jti: "test-jti" },
        wrongPrivateKey,
        { algorithm: "RS256" }
      );

      const result = await tokenService.verifyRefreshToken(badToken);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID for expired token", async () => {
      const expiredToken = jwt.sign(
        { sub: "usr-1", jti: "test-jti" },
        privateKey,
        { algorithm: "RS256", expiresIn: 0 }
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
    });

    it("returns false when jti is not in Redis", async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await tokenService.isBlacklisted("test-jti");

      expect(result).toBe(false);
    });
  });
});
