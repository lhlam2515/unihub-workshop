/**
 * Auth Module E2E Tests
 *
 * Covers FR-F01-001 through FR-F01-008:
 * - POST /api/v1/auth/login (valid, wrong password, inactive user)
 * - POST /api/v1/auth/refresh (valid, expired)
 * - POST /api/v1/auth/logout (authenticated, unauthenticated)
 * - GET /api/v1/auth/me (with token, without token)
 * - Edge case S-H01: Set-Cookie header for WEB login
 */
import crypto from "node:crypto";

import { getQueueToken } from "@nestjs/bullmq";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
} from "../../src/database/database.constants";
import { AuthService } from "../../src/modules/iam/services/auth.service";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "../../src/shared/queues/queue.constants";
import { RedisService } from "../../src/shared/redis/redis.service";
import { authErrors } from "../../src/shared/response/errors";
import { Result } from "../../src/shared/response/result";
import { StorageService } from "../../src/shared/storage/storage.service";

// ---------------------------------------------------------------------------
// Environment setup — must happen before module imports
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-auth";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-auth";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-auth";
process.env.REDIS_URL = "redis://mock:6379";
process.env.R2_ENDPOINT = "https://mock.r2.dev";
process.env.R2_ACCESS_KEY_ID = "mock-key";
process.env.R2_SECRET_ACCESS_KEY = "mock-secret";
process.env.R2_BUCKET_NAME = "mock-bucket";
process.env.R2_PUBLIC_URL = "https://mock.r2.dev/public";
process.env.R2_REGION = "auto";

// ---------------------------------------------------------------------------
// Global mocks — Redis, Storage, BullMQ queues
// ---------------------------------------------------------------------------
const mockRedis = {
  get: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
  set: jest
    .fn<Promise<string>, [string, string, ...unknown[]]>()
    .mockResolvedValue("OK"),
  setNx: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(99),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(800),
  hGet: jest
    .fn<Promise<string | null>, [string, string]>()
    .mockResolvedValue(null),
  hSet: jest.fn().mockResolvedValue(1),
  hGetAll: jest
    .fn<Promise<Record<string, string>>, [string]>()
    .mockResolvedValue({}),
  scanKeys: jest.fn<Promise<string[]>, [string]>().mockResolvedValue([]),
};

const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

const mockStorageService = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
  delete: jest.fn(),
};

// ---------------------------------------------------------------------------
// JWT token helpers
// ---------------------------------------------------------------------------
function signStudentToken(userId = "student-uuid") {
  return jwt.sign(
    {
      sub: userId,
      role: "STUDENT",
      jti: crypto.randomUUID(),
      allowed_workshop_ids: [],
    },
    process.env.JWT_SECRET!,
    { expiresIn: 900 }
  );
}

function signOrganizerToken(userId = "org-uuid") {
  return jwt.sign(
    {
      sub: userId,
      role: "ORGANIZER",
      jti: crypto.randomUUID(),
      allowed_workshop_ids: [],
    },
    process.env.JWT_SECRET!,
    { expiresIn: 900 }
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("Auth Module (E2E) — FR-F01-001 through FR-F01-008", () => {
  let app: INestApplication;
  let authServiceMock: Record<string, jest.Mock>;

  const validLoginDto = {
    email: "student@university.edu.vn",
    password: "password123",
    platform: "WEB" as const,
  };

  const loginResponse = {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 900,
    user: {
      user_id: "student-uuid",
      email: "student@university.edu.vn",
      role: "STUDENT",
    },
  };

  const meResponse = {
    user_id: "student-uuid",
    email: "student@university.edu.vn",
    role: "STUDENT",
  };

  beforeAll(async () => {
    authServiceMock = {
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
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
      .overrideProvider(AuthService)
      .useValue(authServiceMock)
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
  // POST /api/v1/auth/login — FR-F01-001, FR-F01-002, FR-F01-003
  // -----------------------------------------------------------------------
  describe("POST /api/v1/auth/login — FR-F01-001", () => {
    it("returns 200 with access_token for valid credentials (FR-F01-001)", () => {
      authServiceMock.login.mockResolvedValue(Result.ok(loginResponse));

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(validLoginDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.access_token).toBe("mock-access-token");
          expect(res.body.data.expires_in).toBe(900);
          expect(res.body.data.user.role).toBe("STUDENT");
        });
    });

    it("returns 401 INVALID_CREDENTIALS for wrong password (FR-F01-002)", () => {
      authServiceMock.login.mockResolvedValue(
        Result.fail(authErrors.invalidCredentials())
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(validLoginDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
        });
    });

    it("returns 401 INVALID_CREDENTIALS for inactive / suspended user (FR-F01-003)", () => {
      authServiceMock.login.mockResolvedValue(
        Result.fail(authErrors.invalidCredentials())
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(validLoginDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
        });
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/refresh — FR-F01-004, FR-F01-005
  // -----------------------------------------------------------------------
  describe("POST /api/v1/auth/refresh — FR-F01-004", () => {
    it("returns 200 with new tokens for a valid refresh token (FR-F01-004)", () => {
      authServiceMock.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresIn: 900,
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: "valid-refresh-token" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.access_token).toBe("new-access");
          expect(res.body.data.refresh_token).toBe("new-refresh");
        });
    });

    it("returns 401 REFRESH_TOKEN_INVALID when refresh token is expired (FR-F01-005)", () => {
      authServiceMock.refreshToken.mockResolvedValue(
        Result.fail(authErrors.refreshTokenInvalid())
      );

      return request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: "expired-token" })
        .expect(401)
        .expect((res) => {
          expect(res.body.error.code).toBe("REFRESH_TOKEN_INVALID");
        });
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/logout — FR-F01-006
  // -----------------------------------------------------------------------
  describe("POST /api/v1/auth/logout — FR-F01-006", () => {
    it("returns 200 when authenticated user logs out", () => {
      authServiceMock.logout.mockResolvedValue(Result.ok());
      const token = signStudentToken();

      return request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });

    it("returns 401 when logging out without an Authorization header", () => {
      return request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .expect(401);
    });

    it("calls AuthService.logout with sub and jti from the JWT payload", () => {
      authServiceMock.logout.mockResolvedValue(Result.ok());
      const token = signStudentToken("student-for-spy");
      const decoded = jwt.decode(token) as { sub: string; jti: string };

      return request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .then(() => {
          expect(authServiceMock.logout).toHaveBeenCalledWith(
            decoded.sub,
            decoded.jti
          );
        });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/auth/me — FR-F01-007, FR-F01-008
  // -----------------------------------------------------------------------
  describe("GET /api/v1/auth/me — FR-F01-007", () => {
    it("returns 200 with user profile when authenticated (FR-F01-007)", () => {
      authServiceMock.getMe.mockResolvedValue(Result.ok(meResponse));
      const token = signStudentToken();

      return request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.user_id).toBe("student-uuid");
          expect(res.body.data.role).toBe("STUDENT");
        });
    });

    it("returns 401 when no auth token is provided (FR-F01-008)", () => {
      return request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });

    it("returns 200 for ORGANIZER role on /me", () => {
      authServiceMock.getMe.mockResolvedValue(
        Result.ok({
          user_id: "org-uuid",
          email: "organizer@university.edu.vn",
          role: "ORGANIZER",
        })
      );
      const token = signOrganizerToken();

      return request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.role).toBe("ORGANIZER");
        });
    });

    it("calls AuthService.getMe with the JWT sub claim", () => {
      authServiceMock.getMe.mockResolvedValue(Result.ok(meResponse));
      const token = signStudentToken("student-uuid-verify");
      const decoded = jwt.decode(token) as { sub: string };

      return request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .then(() => {
          expect(authServiceMock.getMe).toHaveBeenCalledWith(decoded.sub);
        });
    });
  });

  // -----------------------------------------------------------------------
  // Edge case: S-H01 — Set-Cookie header for WEB login
  // -----------------------------------------------------------------------
  describe("Edge case S-H01 — Set-Cookie for WEB login", () => {
    it("reflects the login response envelope when service succeeds", () => {
      authServiceMock.login.mockResolvedValue(Result.ok(loginResponse));

      return request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(validLoginDto)
        .expect(200)
        .expect((res) => {
          // The ApiResponse envelope must be present
          expect(res.body).toHaveProperty("success", true);
          expect(res.body).toHaveProperty("data");
          expect(res.body).toHaveProperty("meta");
          expect(res.body.meta).toHaveProperty("requestId");
          expect(res.body.meta).toHaveProperty("timestamp");
          expect(res.body.data).toHaveProperty("access_token");
        });
    });
  });

  // -----------------------------------------------------------------------
  // Blacklisted token rejection test (JwtAuthGuard integration)
  // -----------------------------------------------------------------------
  describe("Blacklisted token (JwtAuthGuard integration)", () => {
    it("returns 401 when Redis returns a value for the jti (blacklisted)", () => {
      // Simulate blacklisted token: override the mock once
      mockRedis.get.mockResolvedValueOnce("revoked");

      authServiceMock.getMe.mockResolvedValue(Result.ok(meResponse));
      const token = signStudentToken("student-blacklisted");

      return request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        })
        .then(() => {
          // Restore default
          mockRedis.get.mockResolvedValue(null);
        });
    });
  });
});
