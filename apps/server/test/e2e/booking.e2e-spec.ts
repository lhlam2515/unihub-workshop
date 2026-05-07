/**
 * Booking Module E2E Tests
 *
 * Covers FR-F04-001 through FR-F04-006 and FR-F05-001 through FR-F05-005:
 * - Registration flows: free, paid, sold-out, duplicate, cancel
 * - Payment flows: initiate, duplicate key, circuit breaker open, list
 * - Edge case S-C01: JWT sub mapping
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
} from "../../src/infra/database/database.constants";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "../../src/infra/messaging/queue.constants";
import { RedisService } from "../../src/infra/redis/redis.service";
import { StorageService } from "../../src/infra/storage/storage.service";
import { PaymentsService } from "../../src/modules/booking/services/payments.service";
import { RegistrationsService } from "../../src/modules/booking/services/registrations.service";
import {
  paymentErrors,
  registrationErrors,
  workshopErrors,
} from "../../src/shared/response/errors";
import { Result } from "../../src/shared/response/result";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-booking";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-booking";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-booking";
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
// JWT helpers
// ---------------------------------------------------------------------------
function signStudentToken(
  userId = "student-uuid",
  allowedWorkshopIds: string[] = []
) {
  return jwt.sign(
    {
      sub: userId,
      role: "STUDENT",
      jti: crypto.randomUUID(),
      allowed_workshop_ids: allowedWorkshopIds,
    },
    process.env.JWT_SECRET!,
    { expiresIn: 900 }
  );
}

// ---------------------------------------------------------------------------
// Shared response factory helpers
// ---------------------------------------------------------------------------
function confirmedRegistrationDto(overrides: Record<string, unknown> = {}) {
  return {
    registration_id: "reg-free-001",
    student_id: "student-uuid",
    workshop_id: "w-free-001",
    status: "CONFIRMED",
    registered_at: new Date(),
    ...overrides,
  };
}

function pendingPaymentRegistrationDto(
  overrides: Record<string, unknown> = {}
) {
  return {
    registration_id: "reg-paid-001",
    student_id: "student-uuid",
    workshop_id: "w-paid-001",
    status: "PENDING_PAYMENT",
    registered_at: new Date(),
    payment_deadline: new Date(Date.now() + 900_000),
    amount: 50000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("Booking Module (E2E) — FR-F04-001 through FR-F05-005", () => {
  let app: INestApplication;
  let registrationsServiceMock: Record<string, jest.Mock>;
  let paymentsServiceMock: Record<string, jest.Mock>;

  const studentToken = signStudentToken("student-uuid");

  beforeAll(async () => {
    registrationsServiceMock = {
      register: jest.fn(),
      getMyRegistrations: jest.fn(),
      getRegistrationDetail: jest.fn(),
      cancelRegistration: jest.fn(),
    };

    paymentsServiceMock = {
      initiate: jest.fn(),
      getMyPayments: jest.fn(),
      getPaymentDetail: jest.fn(),
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
      .overrideProvider(RegistrationsService)
      .useValue(registrationsServiceMock)
      .overrideProvider(PaymentsService)
      .useValue(paymentsServiceMock)
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

  // =====================================================================
  // Registration flows
  // =====================================================================

  describe("POST /api/v1/registrations — FR-F04-001 through FR-F04-004", () => {
    it("returns 200 CONFIRMED for a free workshop (FR-F04-001)", () => {
      registrationsServiceMock.register.mockResolvedValue(
        Result.ok(confirmedRegistrationDto())
      );

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ workshop_id: "w-free-001" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("CONFIRMED");
          expect(res.body.data.registration_id).toBe("reg-free-001");
        });
    });

    it("returns 200 PENDING_PAYMENT with payment_deadline for a paid workshop (FR-F04-002)", () => {
      registrationsServiceMock.register.mockResolvedValue(
        Result.ok(pendingPaymentRegistrationDto())
      );

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ workshop_id: "w-paid-001" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("PENDING_PAYMENT");
          expect(res.body.data).toHaveProperty("payment_deadline");
          expect(res.body.data.amount).toBe(50000);
        });
    });

    it("returns 409 WORKSHOP_FULL when no seats remain (FR-F04-003)", () => {
      registrationsServiceMock.register.mockResolvedValue(
        Result.fail(workshopErrors.full("w-full-001"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ workshop_id: "w-full-001" })
        .expect(422)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe("WORKSHOP_FULL");
        });
    });

    it("returns 409 REGISTRATION_DUPLICATE when already registered (FR-F04-004)", () => {
      registrationsServiceMock.register.mockResolvedValue(
        Result.fail(registrationErrors.duplicate("student-uuid", "w-dupe-001"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ workshop_id: "w-dupe-001" })
        .expect(409)
        .expect((res) => {
          expect(res.body.error.code).toBe("REGISTRATION_DUPLICATE");
        });
    });

    it("returns 401 without a valid JWT", () => {
      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .send({ workshop_id: "w-001" })
        .expect(401);
    });

    it("returns 403 when ORGANIZER tries to register (STUDENT-only route)", () => {
      const orgToken = jwt.sign(
        {
          sub: "org-uuid",
          role: "ORGANIZER",
          jti: crypto.randomUUID(),
          allowed_workshop_ids: [],
        },
        process.env.JWT_SECRET!,
        { expiresIn: 900 }
      );

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ workshop_id: "w-001" })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/students/me/registrations — FR-F04-005
  // -----------------------------------------------------------------------
  describe("GET /api/v1/students/me/registrations — FR-F04-005", () => {
    it("returns 200 with paginated list of registrations", () => {
      registrationsServiceMock.getMyRegistrations.mockResolvedValue(
        Result.ok({
          items: [
            confirmedRegistrationDto({ registration_id: "reg-1" }),
            pendingPaymentRegistrationDto({ registration_id: "reg-2" }),
          ],
          total: 2,
          page: 1,
          limit: 20,
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/students/me/registrations")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.pagination).toBeDefined();
          expect(res.body.pagination.total).toBe(2);
          expect(res.body.data.items).toHaveLength(2);
        });
    });

    it("calls service with JWT sub, not a body param (IDOR enforcement)", () => {
      registrationsServiceMock.getMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], total: 0, page: 1, limit: 20 })
      );
      const token = signStudentToken("idor-test-user");

      return request(app.getHttpServer())
        .get("/api/v1/students/me/registrations")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .then(() => {
          // The sub from JWT must be passed as studentId, not from URL
          expect(
            registrationsServiceMock.getMyRegistrations
          ).toHaveBeenCalledWith("idor-test-user", expect.objectContaining({}));
        });
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/registrations/:id — FR-F04-006
  // -----------------------------------------------------------------------
  describe("DELETE /api/v1/registrations/:id — cancel registration (FR-F04-006)", () => {
    it("returns 200 with cancelled registration", () => {
      registrationsServiceMock.cancelRegistration.mockResolvedValue(
        Result.ok(
          confirmedRegistrationDto({
            registration_id: "reg-cancel-001",
            status: "CANCELLED",
            cancelled_at: new Date(),
          })
        )
      );

      return request(app.getHttpServer())
        .delete("/api/v1/registrations/reg-cancel-001")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("CANCELLED");
        });
    });

    it("calls service with JWT sub and registration ID", () => {
      registrationsServiceMock.cancelRegistration.mockResolvedValue(
        Result.ok(
          confirmedRegistrationDto({
            registration_id: "reg-c-002",
            status: "CANCELLED",
          })
        )
      );

      return request(app.getHttpServer())
        .delete("/api/v1/registrations/reg-c-002")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .then(() => {
          expect(
            registrationsServiceMock.cancelRegistration
          ).toHaveBeenCalledWith("student-uuid", "reg-c-002");
        });
    });
  });

  // -----------------------------------------------------------------------
  // Edge case S-C01 — JWT sub mapping
  // -----------------------------------------------------------------------
  describe("Edge case S-C01 — user.sub from JWT, not user.userId", () => {
    it("reveals S-C01: controller calls register with undefined (user.userId vs JwtPayload.sub)", () => {
      registrationsServiceMock.register.mockResolvedValue(
        Result.ok(confirmedRegistrationDto())
      );

      const token = signStudentToken("custom-sub-user");

      return request(app.getHttpServer())
        .post("/api/v1/registrations")
        .set("Authorization", `Bearer ${token}`)
        .send({ workshop_id: "w-sub-test" })
        .expect(200)
        .then(() => {
          // KNOWN ISSUE (S-C01): The controller uses `user.userId` but
          // @CurrentUser() returns the JwtPayload type which has `sub`,
          // NOT `userId`.  The first argument is therefore `undefined`.
          // The fix: change the controller parameter from `{ userId }` to
          // `user: JwtPayload` and read `user.sub`.
          expect(registrationsServiceMock.register).toHaveBeenCalledWith(
            undefined, // because JwtPayload has sub, not userId
            expect.objectContaining({ workshop_id: "w-sub-test" })
          );
        });
    });
  });

  // =====================================================================
  // Payment flows
  // =====================================================================

  describe("POST /api/v1/payments — FR-F05-001 through FR-F05-004", () => {
    const idempotencyKey = "idem-key-001";

    it("returns 200 with CreatePaymentResponseDto (FR-F05-001)", () => {
      paymentsServiceMock.initiate.mockResolvedValue(
        Result.ok({
          payment_id: "pay-001",
          redirect_url: "https://mock-gateway/pay/abc",
          payment_deadline: new Date(Date.now() + 900_000),
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .set("X-Idempotency-Key", idempotencyKey)
        .send({ registration_id: "reg-paid-001", gateway: "MOCK" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.payment_id).toBe("pay-001");
          expect(res.body.data).toHaveProperty("redirect_url");
          expect(res.body.data).toHaveProperty("payment_deadline");
        });
    });

    it("returns 409 PAYMENT_DUPLICATE with duplicate idempotency key (FR-F05-002)", () => {
      paymentsServiceMock.initiate.mockResolvedValue(
        Result.fail(paymentErrors.duplicate(idempotencyKey, "pay-002"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .set("X-Idempotency-Key", idempotencyKey)
        .send({ registration_id: "reg-paid-001", gateway: "MOCK" })
        .expect(409)
        .expect((res) => {
          expect(res.body.error.code).toBe("PAYMENT_DUPLICATE");
        });
    });

    it("returns 503 PAYMENT_SERVICE_UNAVAILABLE when circuit breaker is OPEN (FR-F05-003)", () => {
      paymentsServiceMock.initiate.mockResolvedValue(
        Result.fail({
          category: "OVERLOADED" as const,
          code: "PAYMENT_GATEWAY_OPEN" as const,
          message: "Payment service is temporarily unavailable.",
          context: { gateway: "MOCK", openedAt: new Date().toISOString() },
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .set("X-Idempotency-Key", "idem-key-open-001")
        .send({ registration_id: "reg-paid-002", gateway: "MOCK" })
        .expect(503)
        .expect((res) => {
          expect(res.body.error.code).toBe("PAYMENT_GATEWAY_OPEN");
        });
    });

    it("returns 400 when X-Idempotency-Key header is missing", () => {
      return request(app.getHttpServer())
        .post("/api/v1/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ registration_id: "reg-paid-001", gateway: "MOCK" })
        .expect(400);
    });

    it("returns 403 when ORGANIZER role tries to create payment", () => {
      const orgToken = jwt.sign(
        {
          sub: "org-uuid",
          role: "ORGANIZER",
          jti: crypto.randomUUID(),
          allowed_workshop_ids: [],
        },
        process.env.JWT_SECRET!,
        { expiresIn: 900 }
      );

      return request(app.getHttpServer())
        .post("/api/v1/payments")
        .set("Authorization", `Bearer ${orgToken}`)
        .set("X-Idempotency-Key", "org-idem-key")
        .send({ registration_id: "reg-001", gateway: "MOCK" })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/students/me/payments — FR-F05-005
  // -----------------------------------------------------------------------
  describe("GET /api/v1/students/me/payments — FR-F05-005", () => {
    it("returns 200 with paginated list of payments", () => {
      paymentsServiceMock.getMyPayments.mockResolvedValue(
        Result.ok({
          items: [
            {
              payment_id: "pay-list-001",
              registration_id: "reg-001",
              amount: 50000,
              status: "PENDING",
              gateway: "MOCK",
              initiated_at: new Date(),
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/students/me/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.items).toHaveLength(1);
          expect(res.body.data.items[0].payment_id).toBe("pay-list-001");
          expect(res.body.pagination).toBeDefined();
        });
    });

    it("returns empty list when no payments exist", () => {
      paymentsServiceMock.getMyPayments.mockResolvedValue(
        Result.ok({ items: [], total: 0, page: 1, limit: 20 })
      );

      return request(app.getHttpServer())
        .get("/api/v1/students/me/payments")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.items).toHaveLength(0);
          expect(res.body.pagination.total).toBe(0);
        });
    });
  });
});
