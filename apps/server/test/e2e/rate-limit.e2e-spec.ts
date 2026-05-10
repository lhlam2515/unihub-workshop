/**
 * Rate Limiting E2E Tests
 *
 * Verifies that the RateLimitGuard correctly blocks requests exceeding the
 * configured threshold and sets proper response headers.
 *
 * FR references:
 * - ADR-06: Sliding Window Rate Limiting
 * - CATEGORY_TO_HTTP_STATUS: RATE_LIMIT → 429
 */
import { getQueueToken } from "@nestjs/bullmq";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
} from "../../src/infra/database/database.constants";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "../../src/infra/messaging/queue.constants";
import { RedisService } from "../../src/infra/redis/redis.service";
import { StorageService } from "../../src/infra/storage/storage.service";
import { AiSummaryWorker } from "../../src/modules/background/workers/ai-summary.worker";
import { NotificationWorker } from "../../src/modules/background/workers/notification.worker";
import { StudentSyncWorker } from "../../src/modules/background/workers/student-sync.worker";
import { AuthService } from "../../src/modules/iam/services/auth.service";
import { SlidingWindowService } from "../../src/modules/rate-limit/services/sliding-window.service";
import { Result } from "../../src/shared/response/result";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-rl";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-rl";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-rl";
process.env.REDIS_URL = "redis://mock:6379";
process.env.R2_ENDPOINT = "https://mock.r2.dev";
process.env.R2_ACCESS_KEY_ID = "mock-key";
process.env.R2_SECRET_ACCESS_KEY = "mock-secret";
process.env.R2_BUCKET_NAME = "mock-bucket";
process.env.R2_PUBLIC_URL = "https://mock.r2.dev/public";
process.env.R2_REGION = "auto";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------
const mockRedis = {
  get: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  setNx: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(99),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(800),
  hGet: jest.fn().mockResolvedValue(null),
  hSet: jest.fn().mockResolvedValue(1),
  hGetAll: jest.fn().mockResolvedValue({}),
  scanKeys: jest.fn().mockResolvedValue([]),
  pipeline: jest.fn().mockReturnValue({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }),
  zrange: jest.fn().mockResolvedValue([]),
};

const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

const mockStorageService = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
  delete: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("Rate Limiting (E2E) — ADR-06", () => {
  let app: INestApplication;
  let mockSlidingWindow: Record<string, jest.Mock>;
  let mockAuthService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockSlidingWindow = { check: jest.fn() };
    mockAuthService = {
      login: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({})
      .overrideProvider(DATABASE_SCHEMA)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(getQueueToken(NOTIFICATION_QUEUE))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken(AI_SUMMARY_QUEUE))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken(STUDENT_SYNC_QUEUE))
      .useValue(mockQueue)
      .overrideProvider(SlidingWindowService)
      .useValue(mockSlidingWindow)
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .overrideProvider(NotificationWorker)
      .useValue({})
      .overrideProvider(AiSummaryWorker)
      .useValue({})
      .overrideProvider(StudentSyncWorker)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/login — @RateLimit T1 (60 req/min), @Public
  // -----------------------------------------------------------------------
  describe("POST /api/v1/auth/login — under rate limit", () => {
    it("returns 200 when sliding window allows the request", () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 59, resetMs: 60_000 })
      );
      mockAuthService.login.mockResolvedValue(
        Result.ok({
          accessToken: "mock-at",
          refreshToken: "mock-rt",
          expiresIn: 900,
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ accountType: "STUDENT", studentId: "STU001", password: "pw" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.accessToken).toBe("mock-at");
        });
    });

    it("sets X-RateLimit headers on allowed requests", () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.ok({ allowed: true, remaining: 42, resetMs: 30_000 })
      );
      mockAuthService.login.mockResolvedValue(
        Result.ok({
          accessToken: "mock-at",
          refreshToken: "mock-rt",
          expiresIn: 900,
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ accountType: "STUDENT", studentId: "STU001", password: "pw" })
        .expect(200)
        .expect((res) => {
          expect(res.headers["x-ratelimit-limit"]).toBe("60");
          expect(res.headers["x-ratelimit-remaining"]).toBe("42");
          expect(res.headers["x-ratelimit-reset"]).toBe("30000");
        });
    });
  });

  describe("POST /api/v1/auth/login — over rate limit", () => {
    it("returns 429 RATE_LIMIT_EXCEEDED when sliding window rejects", () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          context: { limit: 60, retryAfterSeconds: 45, tier: "T1" },
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ accountType: "STUDENT", studentId: "STU001", password: "pw" })
        .expect(429)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
          expect(res.body.error.message).toContain("Too many requests");
        });
    });

    it("sets Retry-After header when rate limited", () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
          context: { limit: 60, retryAfterSeconds: 45, tier: "T1" },
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ accountType: "STUDENT", studentId: "STU001", password: "pw" })
        .expect(429)
        .expect((res) => {
          expect(res.headers["retry-after"]).toBe("45");
          expect(res.headers["x-ratelimit-limit"]).toBe("60");
        });
    });

    it("returns 429 before calling AuthService (guard blocks at stage 1)", async () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
          context: { limit: 60, retryAfterSeconds: 45, tier: "T1" },
        })
      );

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ accountType: "STUDENT", studentId: "STU001", password: "pw" })
        .expect(429);

      // AuthService should never be called because the guard rejects first
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/refresh — @RateLimit T1 (30 req/min), @Public
  // -----------------------------------------------------------------------
  describe("POST /api/v1/auth/refresh — rate-limited at T1/30", () => {
    it("returns 429 with its own tier limit", () => {
      mockSlidingWindow.check.mockResolvedValue(
        Result.fail({
          category: "RATE_LIMIT",
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
          context: { limit: 30, retryAfterSeconds: 12, tier: "T1" },
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "some-token" })
        .expect(429)
        .expect((res) => {
          expect(res.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
          expect(res.headers["retry-after"]).toBe("12");
        });
    });
  });
});
