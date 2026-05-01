/**
 * Workshop Admin + Public E2E Tests
 *
 * Covers FR-F02-001 through FR-F02-007:
 * - POST /api/v1/admin/workshops (create, room conflict)
 * - POST /api/v1/admin/workshops/:id/publish (publish, already published)
 * - POST /api/v1/admin/workshops/:id/cancel
 * - PATCH /api/v1/admin/workshops/:id/emergency-update
 * - GET /api/v1/workshops (public list)
 * - GET /api/v1/workshops/:id (public detail)
 * - Role guard: STUDENT gets 403 on admin endpoints
 */
import crypto from "node:crypto";

import { getQueueToken } from "@nestjs/bullmq";
import {
  type ArgumentMetadata,
  type INestApplication,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
} from "../../src/database/database.constants";
import { WorkshopsService } from "../../src/modules/catalog/services/workshops.service";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "../../src/shared/queues/queue.constants";
import { RedisService } from "../../src/shared/redis/redis.service";
import { workshopErrors } from "../../src/shared/response/errors";
import { Result } from "../../src/shared/response/result";
import { StorageService } from "../../src/shared/storage/storage.service";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = "test-jwt-secret-admin";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-admin";
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock-admin";
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

@Injectable()
class PassThroughPipe implements PipeTransform {
  transform(value: any, _metadata: ArgumentMetadata): any {
    return this.coerceDates(value);
  }

  private coerceDates(v: any): any {
    if (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
    ) {
      return new Date(v);
    }
    if (Array.isArray(v)) return v.map((i) => this.coerceDates(i));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, this.coerceDates(val)])
      );
    }
    return v;
  }
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Response factory helpers
// ---------------------------------------------------------------------------
function draftWorkshopDto(overrides: Record<string, unknown> = {}) {
  return {
    workshop_id: "w-draft-001",
    title: "Draft Workshop",
    speaker_name: "Speaker Name",
    room_name: "Room A",
    starts_at: new Date("2026-07-01T09:00:00Z"),
    ends_at: new Date("2026-07-01T11:00:00Z"),
    available_seats: 50,
    is_paid: false,
    confirmed_count: 0,
    locked_count: 0,
    created_by: "org-uuid",
    status: "DRAFT",
    ...overrides,
  };
}

function publishedWorkshopDto(overrides: Record<string, unknown> = {}) {
  return {
    workshop_id: "w-pub-001",
    title: "Published Workshop",
    speaker_name: "Speaker Name",
    room_name: "Room B",
    starts_at: new Date("2026-07-10T09:00:00Z"),
    ends_at: new Date("2026-07-10T11:00:00Z"),
    available_seats: 100,
    is_paid: true,
    price: 50000,
    confirmed_count: 10,
    locked_count: 3,
    created_by: "org-uuid",
    status: "PUBLISHED",
    ...overrides,
  };
}

function cancelledWorkshopDto(overrides: Record<string, unknown> = {}) {
  return {
    workshop_id: "w-cancel-001",
    title: "Cancelled Workshop",
    speaker_name: "Speaker Name",
    room_name: "Room C",
    starts_at: new Date("2026-08-01T09:00:00Z"),
    ends_at: new Date("2026-08-01T11:00:00Z"),
    available_seats: 30,
    is_paid: false,
    confirmed_count: 0,
    locked_count: 0,
    created_by: "org-uuid",
    status: "CANCELLED",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("Workshop Admin Module (E2E) — FR-F02-001 through FR-F02-007", () => {
  let app: INestApplication;
  let workshopsServiceMock: Record<string, jest.Mock>;

  const orgToken = signOrganizerToken("org-uuid");
  const studentToken = signStudentToken("student-uuid");

  beforeAll(async () => {
    workshopsServiceMock = {
      createWorkshop: jest.fn(),
      listAdmin: jest.fn(),
      getAdminDetail: jest.fn(),
      updateWorkshop: jest.fn(),
      publishWorkshop: jest.fn(),
      emergencyUpdate: jest.fn(),
      cancelWorkshop: jest.fn(),
      listPublished: jest.fn(),
      getPublicDetail: jest.fn(),
      getPublishedById: jest.fn(),
      getStats: jest.fn(),
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
      .overrideProvider(WorkshopsService)
      .useValue(workshopsServiceMock)
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
  // POST /api/v1/admin/workshops — FR-F02-001, FR-F02-002
  // =====================================================================
  describe("POST /api/v1/admin/workshops — FR-F02-001", () => {
    const createPayload = {
      title: "New Workshop",
      description: "A test workshop",
      speaker_id: "speaker-uuid",
      room_id: "room-uuid",
      starts_at: "2026-07-15T09:00:00.000Z",
      ends_at: "2026-07-15T11:00:00.000Z",
      capacity: 50,
      is_paid: false,
    };

    it("returns 200 with workshop admin detail (DRAFT) (FR-F02-001)", () => {
      workshopsServiceMock.createWorkshop.mockResolvedValue(
        Result.ok(draftWorkshopDto({ workshop_id: "w-new-001" }))
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${orgToken}`)
        .send(createPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.workshop_id).toBe("w-new-001");
          expect(res.body.data.status).toBe("DRAFT");
        });
    });

    it("returns 409 WORKSHOP_TIME_CONFLICT when room is already booked (FR-F02-002)", () => {
      workshopsServiceMock.createWorkshop.mockResolvedValue(
        Result.fail(
          workshopErrors.roomConflict(
            "room-uuid",
            "2026-07-15T09:00:00.000Z",
            "2026-07-15T11:00:00.000Z"
          )
        )
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${orgToken}`)
        .send(createPayload)
        .expect(409)
        .expect((res) => {
          expect(res.body.error.code).toBe("WORKSHOP_TIME_CONFLICT");
        });
    });

    it("passes the creator userId from JWT sub to createWorkshop", () => {
      workshopsServiceMock.createWorkshop.mockResolvedValue(
        Result.ok(draftWorkshopDto())
      );

      const customOrgToken = signOrganizerToken("custom-org-user");

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${customOrgToken}`)
        .send(createPayload)
        .expect(200)
        .then(() => {
          expect(workshopsServiceMock.createWorkshop).toHaveBeenCalledWith(
            expect.objectContaining({ title: "New Workshop" }),
            "custom-org-user"
          );
        });
    });
  });

  // -----------------------------------------------------------------------
  // Role guard: STUDENT gets 403 on admin endpoints
  // -----------------------------------------------------------------------
  describe("Role guard — STUDENT gets 403 on admin endpoints", () => {
    it("returns 403 when STUDENT tries to create a workshop", () => {
      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          title: "Hack Attempt",
          speaker_id: crypto.randomUUID(),
          room_id: crypto.randomUUID(),
          starts_at: "2026-07-15T09:00:00.000Z",
          ends_at: "2026-07-15T11:00:00.000Z",
          capacity: 10,
          is_paid: false,
        })
        .expect(403);
    });

    it("returns 403 when STUDENT tries to publish a workshop", () => {
      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-001/publish")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(403);
    });

    it("returns 403 when STUDENT tries to cancel a workshop", () => {
      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-001/cancel")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(403);
    });

    it("returns 403 when STUDENT tries emergency update", () => {
      return request(app.getHttpServer())
        .patch("/api/v1/admin/workshops/w-001/emergency-update")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ room_id: crypto.randomUUID() })
        .expect(403);
    });

    it("returns 403 when STUDENT tries GET admin/workshops", () => {
      return request(app.getHttpServer())
        .get("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/admin/workshops/:id/publish — FR-F02-003, FR-F02-004
  // -----------------------------------------------------------------------
  describe("POST /api/v1/admin/workshops/:id/publish — FR-F02-003", () => {
    it("returns 200 and transitions DRAFT to PUBLISHED (FR-F02-003)", () => {
      workshopsServiceMock.publishWorkshop.mockResolvedValue(
        Result.ok(publishedWorkshopDto({ workshop_id: "w-to-publish" }))
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-to-publish/publish")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("PUBLISHED");
        });
    });

    it("returns 422 WORKSHOP_NOT_PUBLISHED when already PUBLISHED (FR-F02-004)", () => {
      workshopsServiceMock.publishWorkshop.mockResolvedValue(
        Result.fail(workshopErrors.notPublished("w-already-pub", "PUBLISHED"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-already-pub/publish")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(422)
        .expect((res) => {
          expect(res.body.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
        });
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/admin/workshops/:id/cancel — FR-F02-005
  // -----------------------------------------------------------------------
  describe("POST /api/v1/admin/workshops/:id/cancel — FR-F02-005", () => {
    it("returns 200 and transitions workshop to CANCELLED (FR-F02-005)", () => {
      workshopsServiceMock.cancelWorkshop.mockResolvedValue(
        Result.ok(cancelledWorkshopDto({ workshop_id: "w-to-cancel" }))
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-to-cancel/cancel")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("CANCELLED");
        });
    });

    it("returns 422 WORKSHOP_CANCELLED when already cancelled", () => {
      workshopsServiceMock.cancelWorkshop.mockResolvedValue(
        Result.fail(workshopErrors.cancelled("w-already-cancelled"))
      );

      return request(app.getHttpServer())
        .post("/api/v1/admin/workshops/w-already-cancelled/cancel")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(422)
        .expect((res) => {
          expect(res.body.error.code).toBe("WORKSHOP_CANCELLED");
        });
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/admin/workshops/:id/emergency-update — FR-F02-006
  // -----------------------------------------------------------------------
  describe("PATCH /api/v1/admin/workshops/:id/emergency-update — FR-F02-006", () => {
    it("returns 200 with updated workshop detail (FR-F02-006)", () => {
      workshopsServiceMock.emergencyUpdate.mockResolvedValue(
        Result.ok(
          publishedWorkshopDto({
            workshop_id: "w-emergency-001",
            room_name: "New Room",
          })
        )
      );

      return request(app.getHttpServer())
        .patch("/api/v1/admin/workshops/w-emergency-001/emergency-update")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ room_id: "new-room-uuid" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.room_name).toBe("New Room");
        });
    });

    it("accepts updates with starts_at and ends_at", () => {
      workshopsServiceMock.emergencyUpdate.mockResolvedValue(
        Result.ok(
          publishedWorkshopDto({
            workshop_id: "w-etime-001",
            starts_at: new Date("2026-07-15T10:00:00Z"),
            ends_at: new Date("2026-07-15T12:00:00Z"),
          })
        )
      );

      return request(app.getHttpServer())
        .patch("/api/v1/admin/workshops/w-etime-001/emergency-update")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({
          starts_at: "2026-07-15T10:00:00.000Z",
          ends_at: "2026-07-15T12:00:00.000Z",
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });
  });

  // =====================================================================
  // GET /api/v1/workshops — FR-F02-007 (public list)
  // =====================================================================
  describe("GET /api/v1/workshops — public list (FR-F02-007)", () => {
    it("returns 200 with paginated published workshops", () => {
      workshopsServiceMock.listPublished.mockResolvedValue(
        Result.ok({
          items: [
            {
              workshop_id: "w-pub-list-001",
              title: "Public Workshop 1",
              speaker_name: "Speaker A",
              starts_at: new Date("2026-07-20T09:00:00Z"),
              available_seats: 48,
              is_paid: false,
            },
            {
              workshop_id: "w-pub-list-002",
              title: "Public Workshop 2",
              speaker_name: "Speaker B",
              starts_at: new Date("2026-07-21T09:00:00Z"),
              available_seats: 100,
              is_paid: true,
              price: 75000,
            },
          ],
          total: 2,
          page: 1,
          limit: 20,
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/workshops")
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.items).toHaveLength(2);
          expect(res.body.pagination).toBeDefined();
          expect(res.body.data.items[0]).toHaveProperty("workshop_id");
          expect(res.body.data.items[0]).toHaveProperty("available_seats");
        });
    });
  });

  // =====================================================================
  // GET /api/v1/workshops/:id — public detail
  // =====================================================================
  describe("GET /api/v1/workshops/:id — public detail", () => {
    it("returns 200 with workshop detail including AI summary", () => {
      workshopsServiceMock.getPublicDetail.mockResolvedValue(
        Result.ok({
          workshop_id: "w-detail-001",
          title: "Detail Workshop",
          speaker_name: "Speaker C",
          room_name: "Room D",
          starts_at: new Date("2026-07-25T09:00:00Z"),
          ends_at: new Date("2026-07-25T11:00:00Z"),
          available_seats: 30,
          is_paid: true,
          price: 100000,
          description: "A workshop with full details",
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/workshops/w-detail-001")
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.workshop_id).toBe("w-detail-001");
          expect(res.body.data).toHaveProperty("room_name");
          expect(res.body.data).toHaveProperty("description");
        });
    });

    it("returns 404 WORKSHOP_NOT_FOUND for a non-existent workshop", () => {
      workshopsServiceMock.getPublicDetail.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-nonexistent"))
      );

      return request(app.getHttpServer())
        .get("/api/v1/workshops/w-nonexistent")
        .expect(404)
        .expect((res) => {
          expect(res.body.error.code).toBe("WORKSHOP_NOT_FOUND");
        });
    });
  });

  // =====================================================================
  // GET /api/v1/admin/workshops — admin listing
  // =====================================================================
  describe("GET /api/v1/admin/workshops — admin listing", () => {
    it("returns 200 with paginated workshops for ORGANIZER", () => {
      workshopsServiceMock.listAdmin.mockResolvedValue(
        Result.ok({
          items: [
            draftWorkshopDto({ workshop_id: "w-list-admin-draft" }),
            publishedWorkshopDto({ workshop_id: "w-list-admin-pub" }),
          ],
          total: 2,
          page: 1,
          limit: 20,
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/admin/workshops")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.items).toHaveLength(2);
          expect(res.body.pagination).toBeDefined();
        });
    });
  });

  // =====================================================================
  // GET /api/v1/admin/workshops/:id/stats — admin statistics
  // =====================================================================
  describe("GET /api/v1/admin/workshops/:id/stats — admin stats", () => {
    it("returns 200 with workshop stats for ORGANIZER", () => {
      workshopsServiceMock.getStats.mockResolvedValue(
        Result.ok({
          confirmed_count: 15,
          locked_count: 2,
          available_seats: 83,
          total_capacity: 100,
        })
      );

      return request(app.getHttpServer())
        .get("/api/v1/admin/workshops/w-stats-001/stats")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.confirmed_count).toBe(15);
          expect(res.body.data.total_capacity).toBe(100);
        });
    });
  });
});
