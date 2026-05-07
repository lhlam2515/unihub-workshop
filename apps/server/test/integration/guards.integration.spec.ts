/**
 * Guards — Integration Tests
 *
 * Tests each guard in isolation with mocked ExecutionContext and Reflector.
 *
 * FR references:
 * - FR-F01-004: Validate JWT and Check Blacklist (JwtAuthGuard)
 * - FR-F01-005: Enforce Role-Based Authorization (RolesGuard)
 * - FR-F01-006: Enforce Workshop Scope for CheckinStaff (WorkshopScopeGuard)
 * - S-H04: Missing scope guard on sync and status endpoints (noted as omission)
 */
import crypto from "node:crypto";

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { WorkshopScopeGuard } from "@/core/guards/workshop-scope.guard";
import { RedisService } from "@/infra/redis/redis.service";
import { HmacSignatureGuard } from "@/modules/payment/guards/hmac-signature.guard";
import { IS_PUBLIC_KEY } from "@/shared/decorators/public.decorator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OLD_ENV = process.env;

function mockExecutionContext(options: {
  handler?: (...args: unknown[]) => unknown;
  controller?: new (...args: unknown[]) => unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: Record<string, unknown>;
  rawBody?: string;
}): any {
  return {
    getHandler: () => options.handler ?? (() => undefined),
    getClass: () => options.controller ?? class {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: options.headers ?? {},
        params: options.params ?? {},
        body: options.body ?? {},
        user: options.user,
        rawBody: options.rawBody,
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// JwtAuthGuard — FR-F01-004
// ---------------------------------------------------------------------------

describe("JwtAuthGuard — FR-F01-004", () => {
  let guard: JwtAuthGuard;
  let mockReflector: Record<string, jest.Mock>;
  let mockRedisService: Record<string, jest.Mock>;

  const validToken = jwt.sign(
    { sub: "usr-001", role: "STUDENT", jti: "jti-001" },
    "test-secret",
    { expiresIn: "15m" }
  );

  beforeAll(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: "test-secret" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    mockRedisService = {
      get: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  describe("@Public() decorator skips authentication", () => {
    it("returns true for a route marked @Public()", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);

      const ctx = mockExecutionContext({});
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        [ctx.getHandler(), ctx.getClass()]
      );
    });
  });

  describe("valid token passes", () => {
    it("returns true for a valid non-blacklisted token", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockRedisService.get.mockResolvedValue(null);

      const ctx = mockExecutionContext({
        headers: { authorization: `Bearer ${validToken}` },
      });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe("missing token throws UnauthorizedException", () => {
    it("throws when no Authorization header is present", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const ctx = mockExecutionContext({ headers: {} });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("throws when header does not use Bearer scheme", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const ctx = mockExecutionContext({
        headers: { authorization: "Basic abc123" },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe("invalid token throws UnauthorizedException", () => {
    it("throws when token is expired or malformed", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const ctx = mockExecutionContext({
        headers: { authorization: "Bearer invalid-token" },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe("blacklisted token throws UnauthorizedException", () => {
    it("throws when the token jti exists in Redis blacklist", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockRedisService.get.mockResolvedValue("revoked");

      const ctx = mockExecutionContext({
        headers: { authorization: `Bearer ${validToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException
      );
      expect(mockRedisService.get).toHaveBeenCalledWith(
        "token:blacklist:jti-001"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// RolesGuard — FR-F01-005
// ---------------------------------------------------------------------------

describe("RolesGuard — FR-F01-005", () => {
  let guard: RolesGuard;
  let mockReflector: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: mockReflector }],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  describe("matching role passes", () => {
    it("allows access when user role matches the required role", () => {
      mockReflector.getAllAndOverride.mockReturnValue(["ORGANIZER"]);

      const ctx = mockExecutionContext({ user: { role: "ORGANIZER" } });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("allows access when user role is one of multiple required roles", () => {
      mockReflector.getAllAndOverride.mockReturnValue(["STUDENT", "ORGANIZER"]);

      const ctx = mockExecutionContext({ user: { role: "STUDENT" } });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe("mismatched role throws ForbiddenException", () => {
    it("throws when user role is not in the required list", () => {
      mockReflector.getAllAndOverride.mockReturnValue(["ORGANIZER"]);

      const ctx = mockExecutionContext({ user: { role: "STUDENT" } });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it("throws when user has no role", () => {
      mockReflector.getAllAndOverride.mockReturnValue(["ORGANIZER"]);

      const ctx = mockExecutionContext({ user: {} });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe("no @Roles decorator allows all", () => {
    it("allows access when no roles metadata is set", () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const ctx = mockExecutionContext({ user: { role: "STUDENT" } });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("allows access when roles array is empty", () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);

      const ctx = mockExecutionContext({ user: { role: "STUDENT" } });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// WorkshopScopeGuard — FR-F01-006
// ---------------------------------------------------------------------------

describe("WorkshopScopeGuard — FR-F01-006", () => {
  let guard: WorkshopScopeGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkshopScopeGuard],
    }).compile();

    guard = module.get<WorkshopScopeGuard>(WorkshopScopeGuard);
  });

  describe("workshop in allowed list passes", () => {
    it("allows when workshop_id from params is in allowed_workshop_ids", () => {
      const ctx = mockExecutionContext({
        params: { id: "wid-A" },
        user: { allowed_workshop_ids: ["wid-A", "wid-B"] },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("allows when workshop_id from body is in allowed_workshop_ids", () => {
      const ctx = mockExecutionContext({
        body: { workshop_id: "wid-B" },
        user: { allowed_workshop_ids: ["wid-A", "wid-B"] },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe("workshop not in list throws ForbiddenException", () => {
    it("throws when workshop_id is not in allowed_workshop_ids", () => {
      const ctx = mockExecutionContext({
        params: { id: "wid-C" },
        user: { allowed_workshop_ids: ["wid-A", "wid-B"] },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe("missing workshop_id throws ForbiddenException", () => {
    it("throws when neither params.id nor body.workshop_id is provided", () => {
      const ctx = mockExecutionContext({
        params: {},
        body: {},
        user: { allowed_workshop_ids: ["wid-A"] },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe("empty allowed_workshop_ids rejects all", () => {
    it("throws when user has no allowed workshops", () => {
      const ctx = mockExecutionContext({
        params: { id: "wid-A" },
        user: { allowed_workshop_ids: [] },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});

// ---------------------------------------------------------------------------
// HmacSignatureGuard
// ---------------------------------------------------------------------------

describe("HmacSignatureGuard", () => {
  let guard: HmacSignatureGuard;

  beforeAll(() => {
    process.env = {
      ...OLD_ENV,
      PAYMENT_GATEWAY_SECRETS: JSON.stringify({
        vnpay: "vnpay-secret",
        momo: "momo-secret",
      }),
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [HmacSignatureGuard],
    }).compile();

    guard = module.get<HmacSignatureGuard>(HmacSignatureGuard);
  });

  describe("valid HMAC passes", () => {
    it("allows when signature matches computed HMAC", () => {
      const body = JSON.stringify({ status: "SUCCESS", txn_id: "txn-001" });
      const expectedSignature = crypto
        .createHmac("sha256", "vnpay-secret")
        .update(body)
        .digest("hex");

      const ctx = mockExecutionContext({
        params: { gateway: "vnpay" },
        headers: { "x-gateway-signature": expectedSignature },
        rawBody: body,
        body: { status: "SUCCESS", txn_id: "txn-001" },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe("invalid signature throws UnauthorizedException", () => {
    it("throws when signature does not match", () => {
      const ctx = mockExecutionContext({
        params: { gateway: "vnpay" },
        headers: { "x-gateway-signature": "invalid-signature" },
        body: { status: "SUCCESS" },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it("throws when signature header is missing", () => {
      const ctx = mockExecutionContext({
        params: { gateway: "vnpay" },
        headers: {},
        body: { status: "SUCCESS" },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it("throws for unknown gateway", () => {
      const ctx = mockExecutionContext({
        params: { gateway: "unknown-gw" },
        headers: { "x-gateway-signature": "some-signature" },
        body: { status: "SUCCESS" },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it("throws when gateway param is missing", () => {
      const ctx = mockExecutionContext({
        params: {},
        headers: { "x-gateway-signature": "some-signature" },
        body: { status: "SUCCESS" },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
});
