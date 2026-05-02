/**
 * Check-in Module E2E Tests
 *
 * Covers FR-F07-001 through FR-F07-004:
 * - POST /api/v1/checkin/scan (valid QR, VOID ticket, duplicate)
 * - POST /api/v1/checkin/sync (batch offline sync)
 * - GET /api/v1/checkin/workshops/:id/status
 * - GET /api/v1/checkin/workshops/:id/tickets
 * - WorkshopScopeGuard enforcement
 * - Edge case S-H04: sync endpoint does NOT have WorkshopScopeGuard
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
import { CheckinService } from "../../src/modules/checkin/services/checkin.service";
import { OfflineSyncService } from "../../src/modules/checkin/services/offline-sync.service";
import { TicketService as CheckinTicketService } from "../../src/modules/checkin/services/ticket.service";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "../../src/shared/queues/queue.constants";
import { RedisService } from "../../src/shared/redis/redis.service";
import { ticketErrors } from "../../src/shared/response/errors";
import { Result } from "../../src/shared/response/result";
import { StorageService } from "../../src/shared/storage/storage.service";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-checkin";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-checkin";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-checkin";
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

function signCheckinStaffToken(
  userId = "staff-uuid",
  workshopIds: string[] = ["w-checkin-001"]
) {
  return jwt.sign(
    {
      sub: userId,
      role: "CHECKIN_STAFF",
      jti: crypto.randomUUID(),
      allowed_workshop_ids: workshopIds,
    },
    process.env.JWT_SECRET!,
    { expiresIn: 900 }
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("Check-in Module (E2E) — FR-F07-001 through FR-F07-004", () => {
  let app: INestApplication;
  let checkinServiceMock: Record<string, jest.Mock>;
  let offlineSyncServiceMock: Record<string, jest.Mock>;
  let ticketServiceMock: Record<string, jest.Mock>;

  const staffToken = signCheckinStaffToken("staff-uuid", ["w-checkin-001"]);
  const staffTokenForOtherWorkshop = signCheckinStaffToken("staff-uuid-2", [
    "w-other-workshop",
  ]);
  const studentToken = signStudentToken("student-uuid");

  beforeAll(async () => {
    checkinServiceMock = {
      scanQR: jest.fn(),
      getWorkshopCheckinStatus: jest.fn(),
    };

    offlineSyncServiceMock = {
      processSyncBatch: jest.fn(),
    };

    ticketServiceMock = {
      preloadActiveTickets: jest.fn(),
      getMyTickets: jest.fn(),
      getTicketDetail: jest.fn(),
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
      .overrideProvider(CheckinService)
      .useValue(checkinServiceMock)
      .overrideProvider(OfflineSyncService)
      .useValue(offlineSyncServiceMock)
      .overrideProvider(CheckinTicketService)
      .useValue(ticketServiceMock)
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
  // POST /api/v1/checkin/scan — FR-F07-001, FR-F07-002, FR-F07-003
  // =====================================================================
  describe("POST /api/v1/checkin/scan — FR-F07-001 through FR-F07-003", () => {
    const validScan = {
      qr_token: "qr-valid-001",
      workshop_id: "w-checkin-001",
    };

    it("returns 200 with checkin record for a valid QR scan (FR-F07-001)", () => {
      checkinServiceMock.scanQR.mockResolvedValue(
        Result.ok({
          checkinId: "checkin-001",
          checkedInAt: new Date(),
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .set("Authorization", `Bearer ${staffToken}`)
        .send(validScan)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.checkin_id).toBe("checkin-001");
          expect(res.body.data).toHaveProperty("checked_in_at");
        });
    });

    it("returns 422 TICKET_VOID when scanning a VOID ticket (FR-F07-002)", () => {
      checkinServiceMock.scanQR.mockResolvedValue(
        Result.fail(ticketErrors.void("ticket-void-001"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ qr_token: "qr-void-001", workshop_id: "w-checkin-001" })
        .expect(422)
        .expect((res) => {
          expect(res.body.error.code).toBe("TICKET_VOID");
        });
    });

    it("returns 409 TICKET_ALREADY_CHECKEDIN for duplicate scan (FR-F07-003)", () => {
      checkinServiceMock.scanQR.mockResolvedValue(
        Result.fail(
          ticketErrors.alreadyCheckedIn("ticket-dupe-001", "w-checkin-001")
        )
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ qr_token: "qr-dupe-001", workshop_id: "w-checkin-001" })
        .expect(409)
        .expect((res) => {
          expect(res.body.error.code).toBe("TICKET_ALREADY_CHECKEDIN");
        });
    });
  });

  // -----------------------------------------------------------------------
  // WorkshopScopeGuard — FR-F01-006 / FR-F07-004
  // -----------------------------------------------------------------------
  describe("WorkshopScopeGuard enforcement on /checkin/scan (FR-F01-006, FR-F07-004)", () => {
    it("returns 403 when staff scans a workshop outside their allowed scope", () => {
      checkinServiceMock.scanQR.mockResolvedValue(
        Result.ok({ checkinId: "checkin-002", checkedInAt: new Date() })
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .set("Authorization", `Bearer ${staffTokenForOtherWorkshop}`)
        .send({ qr_token: "qr-valid-002", workshop_id: "w-checkin-001" })
        .expect(403);
    });

    it("returns 401 when a STUDENT tries to use the checkin endpoint", () => {
      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ qr_token: "qr-any", workshop_id: "w-checkin-001" })
        .expect(403); // STUDENT does not have CHECKIN_STAFF role
    });

    it("returns 401 without auth token", () => {
      return request(app.getHttpServer())
        .post("/api/v1/checkin/scan")
        .send({ qr_token: "qr-any", workshop_id: "w-checkin-001" })
        .expect(401);
    });
  });

  // =====================================================================
  // POST /api/v1/checkin/sync — FR-F07-005
  // =====================================================================
  describe("POST /api/v1/checkin/sync — offline sync (FR-F07-005)", () => {
    const validSyncPayload = {
      workshop_id: "w-checkin-001",
      items: [
        {
          qr_token: "qr-sync-001",
          timestamp: new Date().toISOString(),
          device_id: "mobile-01",
        },
        {
          qr_token: "qr-sync-002",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    it("returns 200 with SyncResultDto for a valid batch", () => {
      offlineSyncServiceMock.processSyncBatch.mockResolvedValue(
        Result.ok({
          synced_count: 2,
          skipped_count: 0,
          conflicts_count: 0,
          timestamp: new Date(),
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/sync")
        .set("Authorization", `Bearer ${staffToken}`)
        .send(validSyncPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.synced_count).toBe(2);
        });
    });

    it("returns partial counts when some items are conflicts", () => {
      offlineSyncServiceMock.processSyncBatch.mockResolvedValue(
        Result.ok({
          synced_count: 1,
          skipped_count: 0,
          conflicts_count: 1,
          timestamp: new Date(),
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/sync")
        .set("Authorization", `Bearer ${staffToken}`)
        .send(validSyncPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.synced_count).toBe(1);
          expect(res.body.data.conflicts_count).toBe(1);
        });
    });

    it("calls offline sync service with items, staffUserId, and workshopId", () => {
      offlineSyncServiceMock.processSyncBatch.mockResolvedValue(
        Result.ok({
          synced_count: 0,
          skipped_count: 0,
          conflicts_count: 0,
          timestamp: new Date(),
        })
      );

      return request(app.getHttpServer())
        .post("/api/v1/checkin/sync")
        .set("Authorization", `Bearer ${staffToken}`)
        .send(validSyncPayload)
        .expect(200)
        .then(() => {
          expect(offlineSyncServiceMock.processSyncBatch).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({ qr_token: "qr-sync-001" }),
            ]),
            "staff-uuid",
            "w-checkin-001"
          );
        });
    });
  });

  // -----------------------------------------------------------------------
  // Edge case S-H04 — Sync endpoint does NOT have WorkshopScopeGuard
  // -----------------------------------------------------------------------
  describe("Edge case S-H04 — /checkin/sync has no WorkshopScopeGuard", () => {
    it("sync succeeds even for a workshop outside the staff's allowed list", () => {
      offlineSyncServiceMock.processSyncBatch.mockResolvedValue(
        Result.ok({
          synced_count: 0,
          skipped_count: 0,
          conflicts_count: 0,
          timestamp: new Date(),
        })
      );

      // This staff only has "w-other" allowed, but syncs to "w-checkin-001"
      const restrictedStaffToken = signCheckinStaffToken("staff-restricted", [
        "w-other",
      ]);

      return request(app.getHttpServer())
        .post("/api/v1/checkin/sync")
        .set("Authorization", `Bearer ${restrictedStaffToken}`)
        .send({
          workshop_id: "w-checkin-001",
          items: [
            {
              qr_token: "qr-sync-no-scope",
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .expect(200) // No WorkshopScopeGuard → 200 instead of 403
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });
  });

  // =====================================================================
  // GET /api/v1/checkin/workshops/:id/status — FR-F07-006
  // =====================================================================
  describe("GET /api/v1/checkin/workshops/:id/status — FR-F07-006", () => {
    it("returns 200 with CheckinStatusDto", () => {
      checkinServiceMock.getWorkshopCheckinStatus.mockResolvedValue(
        Result.ok({
          confirmed_count: 50,
          checked_in_count: 32,
          pending_count: 18,
          recent_checkins: [
            {
              checkin_id: "chk-001",
              student_name: "Nguyen Van A",
              student_code: "STU001",
              checked_in_at: new Date(),
              source: "ONLINE",
            },
            {
              checkin_id: "chk-002",
              student_name: "Tran Thi B",
              student_code: "STU002",
              checked_in_at: new Date(),
              source: "OFFLINE_SYNC",
            },
          ],
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/checkin/workshops/w-checkin-001/status")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.confirmed_count).toBe(50);
          expect(res.body.data.checked_in_count).toBe(32);
          expect(res.body.data.recent_checkins).toHaveLength(2);
          expect(res.body.data.recent_checkins[0]).toHaveProperty("checkin_id");
        });
    });

    it("returns 401 without auth", () => {
      return request(app.getHttpServer())
        .get("/api/v1/checkin/workshops/w-checkin-001/status")
        .expect(401);
    });
  });

  // =====================================================================
  // GET /api/v1/checkin/workshops/:id/tickets — FR-F07-007
  // =====================================================================
  describe("GET /api/v1/checkin/workshops/:id/tickets — FR-F07-007", () => {
    it("returns 200 with list of active tickets for a workshop", () => {
      const token = signCheckinStaffToken("staff-load", ["w-load-001"]);
      ticketServiceMock.preloadActiveTickets.mockResolvedValue(
        Result.ok([
          {
            ticket_id: "tkt-active-001",
            registration_id: "reg-001",
            qr_token: "qr-load-001",
            status: "ACTIVE",
            workshop: {
              workshop_id: "w-load-001",
              title: "Workshop for Preload",
              starts_at: new Date(),
              ends_at: new Date(),
            },
            student: {
              student_id: "stu-001",
              full_name: "Student A",
              student_code: "STU001",
            },
            issued_at: new Date(),
          },
        ])
      );

      return request(app.getHttpServer())
        .get("/api/v1/checkin/workshops/w-load-001/tickets")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data[0].ticket_id).toBe("tkt-active-001");
          expect(res.body.data[0].status).toBe("ACTIVE");
        });
    });

    it("returns 403 when staff requests tickets for a workshop outside their scope", () => {
      return request(app.getHttpServer())
        .get("/api/v1/checkin/workshops/w-outside-scope/tickets")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);
    });
  });

  // =====================================================================
  // GET /api/v1/students/me/tickets — Student ticket listing
  // =====================================================================
  describe("GET /api/v1/students/me/tickets — Student own tickets", () => {
    it("returns 200 with list of active tickets for the student", () => {
      ticketServiceMock.getMyTickets.mockResolvedValue(
        Result.ok([
          {
            ticket_id: "tkt-stu-001",
            registration_id: "reg-stu-001",
            qr_token: "qr-stu-001",
            status: "ACTIVE",
            workshop: {
              workshop_id: "w-stu-001",
              title: "Student Workshop",
              starts_at: new Date(),
              ends_at: new Date(),
            },
            student: {
              student_id: "student-uuid",
              full_name: "Student Self",
              student_code: "STU001",
            },
            issued_at: new Date(),
          },
        ])
      );

      return request(app.getHttpServer())
        .get("/api/v1/students/me/tickets")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data[0].ticket_id).toBe("tkt-stu-001");
        });
    });

    it("returns 403 for CHECKIN_STAFF on student tickets endpoint", () => {
      return request(app.getHttpServer())
        .get("/api/v1/students/me/tickets")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);
    });
  });
});
