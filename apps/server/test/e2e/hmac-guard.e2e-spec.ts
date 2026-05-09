/**
 * HMAC Signature Guard E2E Tests
 *
 * Verifies that the HmacSignatureGuard correctly authenticates payment
 * webhook callbacks via HMAC-SHA256 signatures.
 *
 * Endpoint: POST /api/v1/payments/webhook/{gateway}
 * Security: @Public() + @UseGuards(HmacSignatureGuard) — no JWT required.
 */
import crypto, { randomUUID } from "node:crypto";

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
import { PaymentsService } from "../../src/modules/payment/services/payments.service";
import { Result } from "../../src/shared/response/result";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-hmac";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-hmac";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-hmac";
process.env.REDIS_URL = "redis://mock:6379";
process.env.R2_ENDPOINT = "https://mock.r2.dev";
process.env.R2_ACCESS_KEY_ID = "mock-key";
process.env.R2_SECRET_ACCESS_KEY = "mock-secret";
process.env.R2_BUCKET_NAME = "mock-bucket";
process.env.R2_PUBLIC_URL = "https://mock.r2.dev/public";
process.env.R2_REGION = "auto";
process.env.PAYMENT_GATEWAY_SECRETS = JSON.stringify({
  vnpay: "vnpay-test-secret",
  momo: "momo-test-secret",
});

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
};

const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

const mockStorageService = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
  delete: jest.fn(),
};

// ---------------------------------------------------------------------------
// HMAC helper
// ---------------------------------------------------------------------------
function computeHmacSignature(
  gateway: string,
  body: Record<string, unknown>
): string {
  const secrets: Record<string, string> = JSON.parse(
    process.env.PAYMENT_GATEWAY_SECRETS!
  );
  const secret = secrets[gateway] ?? "";
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("HMAC Signature Guard (E2E)", () => {
  let app: INestApplication;
  let mockPaymentsService: Record<string, jest.Mock>;

  function webhookBody(txnId = "txn-vnpay-001") {
    return {
      gatewayTxnId: txnId,
      status: "SUCCESS" as const,
      idempotencyKey: randomUUID(),
    };
  }

  beforeAll(async () => {
    mockPaymentsService = { handleWebhook: jest.fn() };

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
      .overrideProvider(NotificationWorker)
      .useValue({})
      .overrideProvider(AiSummaryWorker)
      .useValue({})
      .overrideProvider(StudentSyncWorker)
      .useValue({})
      .overrideProvider(PaymentsService)
      .useValue(mockPaymentsService)
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
  // POST /api/v1/payments/webhook/vnpay — valid signature
  // -----------------------------------------------------------------------
  describe("POST /api/v1/payments/webhook/vnpay — valid signature", () => {
    it("returns 200 when HMAC signature matches", async () => {
      const body = webhookBody();
      const signature = computeHmacSignature("vnpay", body);
      mockPaymentsService.handleWebhook.mockResolvedValue(
        Result.ok({ received: true })
      );

      const { status } = await request(app.getHttpServer())
        .post("/api/v1/payments/webhook/vnpay")
        .set("X-Gateway-Signature", signature)
        .send(body);

      expect(status).toBe(200);
    });

    it("delegates to PaymentsService when HMAC passes", async () => {
      const body = webhookBody();
      const signature = computeHmacSignature("vnpay", body);
      mockPaymentsService.handleWebhook.mockResolvedValue(
        Result.ok({ received: true })
      );

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhook/vnpay")
        .set("X-Gateway-Signature", signature)
        .send(body);

      expect(mockPaymentsService.handleWebhook).toHaveBeenCalled();
    });

    it("works for multiple gateways with different secrets", async () => {
      const body = webhookBody("txn-momo-001");
      const signature = computeHmacSignature("momo", body);
      mockPaymentsService.handleWebhook.mockResolvedValue(
        Result.ok({ received: true })
      );

      const { status } = await request(app.getHttpServer())
        .post("/api/v1/payments/webhook/momo")
        .set("X-Gateway-Signature", signature)
        .send(body);

      expect(status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/payments/webhook/vnpay — invalid signature
  // -----------------------------------------------------------------------
  describe("POST /api/v1/payments/webhook/vnpay — invalid signature", () => {
    it("returns 401 when signature does not match", () => {
      return request(app.getHttpServer())
        .post("/api/v1/payments/webhook/vnpay")
        .set("X-Gateway-Signature", "invalid-signature")
        .send(webhookBody())
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });

    it("returns 401 when signature header is missing", () => {
      return request(app.getHttpServer())
        .post("/api/v1/payments/webhook/vnpay")
        .send(webhookBody())
        .expect(401);
    });

    it("returns 401 for unknown gateway", () => {
      return request(app.getHttpServer())
        .post("/api/v1/payments/webhook/unknown-gw")
        .set("X-Gateway-Signature", "some-signature")
        .send(webhookBody())
        .expect(401);
    });

    it("returns 404 when route does not match (empty gateway)", () => {
      return request(app.getHttpServer())
        .post("/api/v1/payments/webhook/")
        .set("X-Gateway-Signature", "some-signature")
        .send(webhookBody())
        .expect(404);
    });

    it("does not call PaymentsService on invalid signature", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/payments/webhook/vnpay")
        .set("X-Gateway-Signature", "wrong-signature")
        .send(webhookBody())
        .expect(401);

      expect(mockPaymentsService.handleWebhook).not.toHaveBeenCalled();
    });

    it("returns 401 with wrong HMAC key for same gateway", () => {
      const body = webhookBody("txn-cross");
      const vnpaySig = computeHmacSignature("vnpay", body);

      return request(app.getHttpServer())
        .post("/api/v1/payments/webhook/momo")
        .set("X-Gateway-Signature", vnpaySig)
        .send(body)
        .expect(401);
    });
  });
});
