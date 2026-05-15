import { HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { RateLimitGuard } from "./rate-limit.guard";
import { RATE_LIMIT_KEY } from "../constants/rate-limit.constants";
import { SlidingWindowService } from "../services/sliding-window.service";

import type { ExecutionContext } from "@nestjs/common";

function mockExecutionContext(overrides?: {
  user?: Record<string, unknown> | null;
  ip?: string | null;
  body?: Record<string, unknown>;
  handler?: (...args: unknown[]) => unknown;
  controller?: new (...args: unknown[]) => unknown;
}): ExecutionContext {
  const res = {
    header: jest.fn(),
  };
  const req: Record<string, unknown> = {};
  // Only set user/ip when explicitly provided so `.user?.sub` / `.ip` tests work
  if ("user" in (overrides ?? {})) req.user = overrides!.user ?? null;
  if ("ip" in (overrides ?? {})) req.ip = overrides!.ip ?? undefined;
  if (!("ip" in (overrides ?? {}))) req.ip = "127.0.0.1";
  if ("body" in (overrides ?? {})) req.body = overrides!.body;

  return {
    getHandler: () => overrides?.handler ?? (() => undefined),
    getClass: () => overrides?.controller ?? class {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;
  let mockReflector: Record<string, jest.Mock>;
  let mockSlidingWindow: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockReflector = { getAllAndOverride: jest.fn() };
    mockSlidingWindow = { check: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: SlidingWindowService, useValue: mockSlidingWindow },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  describe("no @RateLimit() metadata", () => {
    it("allows request when no config is set", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const result = await guard.canActivate(mockExecutionContext());

      expect(result).toBe(true);
      expect(mockSlidingWindow.check).not.toHaveBeenCalled();
    });

    it("allows request when config array is empty", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);

      const result = await guard.canActivate(mockExecutionContext());

      expect(result).toBe(true);
      expect(mockSlidingWindow.check).not.toHaveBeenCalled();
    });
  });

  describe("under rate limit", () => {
    it("allows request when sliding window returns allowed", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 59, resetMs: 50_000 })
      );

      const result = await guard.canActivate(mockExecutionContext());

      expect(result).toBe(true);
      expect(mockSlidingWindow.check).toHaveBeenCalledWith("T1", "127.0.0.1");
    });

    it("sets rate-limit response headers", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 42, resetMs: 30_000 })
      );

      const ctx = mockExecutionContext();
      const res = ctx.switchToHttp().getResponse();

      await guard.canActivate(ctx);

      expect(res.header).toHaveBeenCalledWith("X-RateLimit-Limit", "60");
      expect(res.header).toHaveBeenCalledWith("X-RateLimit-Remaining", "42");
      expect(res.header).toHaveBeenCalledWith("X-RateLimit-Reset", "30000");
    });
  });

  describe("over rate limit", () => {
    it("throws 429 HttpException when sliding window rejects", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          context: { limit: 60, retryAfterSeconds: 30, tier: "T1" },
        })
      );

      await expect(guard.canActivate(mockExecutionContext())).rejects.toThrow(
        HttpException
      );
    });

    it("sets Retry-After header when limit exceeded", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
          context: { limit: 60, retryAfterSeconds: 30, tier: "T1" },
        })
      );

      const ctx = mockExecutionContext();
      const res = ctx.switchToHttp().getResponse();

      await expect(guard.canActivate(ctx)).rejects.toThrow();

      expect(res.header).toHaveBeenCalledWith("Retry-After", "30");
    });

    it("throws 429 with RATE_LIMIT_EXCEEDED error body", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          context: { limit: 60, retryAfterSeconds: 30, tier: "T1" },
        })
      );

      try {
        await guard.canActivate(mockExecutionContext());
        expect("should not reach here").toBe(true);
      } catch (e) {
        const ex = e as HttpException;
        expect(ex.getStatus()).toBe(429);
        const body = ex.getResponse() as Record<string, unknown>;
        // Guard passes AppError directly — GlobalExceptionFilter maps it
        expect(body).toMatchObject({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
        });
      }
    });
  });

  describe("subject derivation", () => {
    it("uses JWT sub for authenticated requests", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T2", limit: 30, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 29, resetMs: 60_000 })
      );

      await guard.canActivate(
        mockExecutionContext({ user: { sub: "user-uuid-001" } })
      );

      expect(mockSlidingWindow.check).toHaveBeenCalledWith(
        "T2",
        "user-uuid-001"
      );
    });

    it("uses client IP for unauthenticated requests", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 59, resetMs: 60_000 })
      );

      await guard.canActivate(mockExecutionContext({ ip: "192.168.1.42" }));

      expect(mockSlidingWindow.check).toHaveBeenCalledWith(
        "T1",
        "192.168.1.42"
      );
    });

    it("falls back to 'unknown' when neither sub nor ip is available", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 59, resetMs: 60_000 })
      );

      await guard.canActivate(
        mockExecutionContext({ user: undefined, ip: undefined })
      );

      expect(mockSlidingWindow.check).toHaveBeenCalledWith("T1", "unknown");
    });
  });

  describe("resourceIdSource", () => {
    it("appends resourceId to identifier when path resolves to a value", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        {
          tier: "T3",
          limit: 5,
          windowMs: 60_000,
          resourceIdSource: "body.workshopId",
        },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 4, resetMs: 60_000 })
      );

      await guard.canActivate(
        mockExecutionContext({
          user: { sub: "student-uuid" },
          body: { workshopId: "workshop-uuid" },
        })
      );

      expect(mockSlidingWindow.check).toHaveBeenCalledWith(
        "T3",
        "student-uuid:workshop-uuid"
      );
    });

    it("falls back to base identifier when resourceIdSource path resolves to undefined", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        {
          tier: "T3",
          limit: 5,
          windowMs: 60_000,
          resourceIdSource: "body.workshopId",
        },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 4, resetMs: 60_000 })
      );

      await guard.canActivate(
        mockExecutionContext({
          user: { sub: "student-uuid" },
          body: {},
        })
      );

      expect(mockSlidingWindow.check).toHaveBeenCalledWith(
        "T3",
        "student-uuid"
      );
    });

    it("does not affect identifier when resourceIdSource is absent", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T2", limit: 30, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 29, resetMs: 60_000 })
      );

      await guard.canActivate(
        mockExecutionContext({ user: { sub: "user-uuid" } })
      );

      expect(mockSlidingWindow.check).toHaveBeenCalledWith("T2", "user-uuid");
    });
  });

  describe("multi-tier support", () => {
    it("checks all tiers sequentially and allows if all pass", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
        { tier: "T2", limit: 30, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check
        .mockResolvedValueOnce(
          Result.ok({ allowed: true, remaining: 59, resetMs: 60_000 })
        )
        .mockResolvedValueOnce(
          Result.ok({ allowed: true, remaining: 29, resetMs: 60_000 })
        );

      const result = await guard.canActivate(mockExecutionContext());

      expect(result).toBe(true);
      expect(mockSlidingWindow.check).toHaveBeenCalledTimes(2);
    });

    it("stops at the first tier that exceeds the limit", async () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
        { tier: "T2", limit: 30, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValueOnce(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
          context: { limit: 60, retryAfterSeconds: 10, tier: "T1" },
        })
      );
      mockSlidingWindow.check.mockResolvedValueOnce(
        Result.ok({ allowed: true, remaining: 29, resetMs: 60_000 })
      );

      await expect(guard.canActivate(mockExecutionContext())).rejects.toThrow(
        HttpException
      );

      // T2 should not be checked because T1 already failed
      expect(mockSlidingWindow.check).toHaveBeenCalledTimes(1);
    });
  });

  describe("@RateLimit decorator precedence", () => {
    it("reads metadata from handler and class", async () => {
      const handler = () => undefined;
      const controller = class TestController {};

      mockReflector.getAllAndOverride.mockReturnValue([
        { tier: "T1", limit: 60, windowMs: 60_000 },
      ]);
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 59, resetMs: 60_000 })
      );

      await guard.canActivate(mockExecutionContext({ handler, controller }));

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        RATE_LIMIT_KEY,
        [handler, controller]
      );
    });
  });
});
