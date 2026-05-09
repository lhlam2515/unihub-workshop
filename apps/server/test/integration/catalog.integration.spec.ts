/**
 * Catalog Module — Integration Tests
 *
 * Tests workshops-public, workshops-admin, rooms-admin, speakers-admin,
 * and documents-admin controllers with mocked services/repositories.
 *
 * FR references:
 * - FR-F02-001: Create Workshop
 * - FR-F02-002: Detect Room Scheduling Conflict
 * - FR-F02-003: Publish Workshop
 * - FR-F02-004: Cancel Workshop
 * - FR-F02-005: Update Workshop Room or Schedule (Published)
 * - FR-F02-006: List Published Workshops
 * - FR-F02-007: View Workshop Detail
 * - FR-F03-001: Upload Workshop Document
 * - FR-F03-002: Trigger AI Summary Generation
 */
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";

import { AI_SUMMARY_QUEUE } from "@/infra/messaging/queue.constants";
import { RedisService } from "@/infra/redis/redis.service";
import { StorageService } from "@/infra/storage/storage.service";
import { AiSummaryAdminController } from "@/modules/ai-summary/controllers/ai-summary-admin.controller";
import { PdfSummaryPipeline } from "@/modules/ai-summary/pipeline/pdf-summary.pipeline";
import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { AiSummaryService } from "@/modules/ai-summary/services/ai-summary.service";
import { RoomsAdminController } from "@/modules/catalog/controllers/rooms-admin.controller";
import { RoomsPublicController } from "@/modules/catalog/controllers/rooms-public.controller";
import { SpeakersAdminController } from "@/modules/catalog/controllers/speakers-admin.controller";
import { SpeakersPublicController } from "@/modules/catalog/controllers/speakers-public.controller";
import { WorkshopsAdminController } from "@/modules/catalog/controllers/workshops-admin.controller";
import { WorkshopsPublicController } from "@/modules/catalog/controllers/workshops-public.controller";
import { RoomsRepository } from "@/modules/catalog/repositories/rooms.repository";
import { SpeakersRepository } from "@/modules/catalog/repositories/speakers.repository";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { RoomConflictService } from "@/modules/catalog/services/room-conflict.service";
import { RoomsService } from "@/modules/catalog/services/rooms.service";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { SpeakersService } from "@/modules/catalog/services/speakers.service";
import { WorkshopNotificationPublisher } from "@/modules/catalog/services/workshop-notification-publisher.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { TokenService } from "@/modules/iam/services/token.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWorkshopsRepo = {
  findPublished: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  listAdmin: jest.fn(),
  completePastOpen: jest.fn(),
};

const mockRoomConflictService = {
  checkConflict: jest.fn(),
};

const mockSeatCounterService = {
  getAvailable: jest.fn(),
  getCachedSeats: jest.fn(),
  initialize: jest.fn(),
  delete: jest.fn(),
};

const mockSpeakersRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockRoomsRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockAiSummariesRepo = {
  findByWorkshopId: jest.fn(),
  retryAiSummary: jest.fn(),
  updateStatus: jest.fn(),
  upsert: jest.fn(),
};

const mockNotificationPublisher = {
  publishEmergencyUpdate: jest.fn(),
  publishCancelled: jest.fn(),
};

const mockPipeline = {
  execute: jest.fn(),
};

const mockStorageService = {
  uploadFile: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setex: jest.fn(),
};

const mockTokenService = {
  verifyAccessToken: jest.fn(),
};

const mockNotificationLogProducer = {
  createAndEnqueue: jest.fn(),
  batchCreateAndEnqueue: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const draftWorkshop = {
  workshops: {
    workshopId: "wid-001",
    title: "Introduction to AI",
    description: "A beginner-friendly workshop",
    speakerId: "spk-001",
    roomId: "rm-001",
    startsAt: new Date("2026-06-01T08:00:00Z"),
    endsAt: new Date("2026-06-01T10:00:00Z"),
    seatsTotal: 100,
    price: 0,
    status: "DRAFT",
    createdBy: "org-001",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  speakers: { fullName: "Dr. Smith" },
  rooms: { name: "Hall A" },
};

const publishedWorkshop = {
  ...draftWorkshop,
  workshops: { ...draftWorkshop.workshops, status: "OPEN" },
};

const cancelledWorkshop = {
  ...draftWorkshop,
  workshops: { ...draftWorkshop.workshops, status: "CANCELLED" },
};

const speaker = {
  speakerId: "spk-001",
  fullName: "Dr. Smith",
  title: "AI Researcher",
  bio: "Expert in machine learning",
  avatarUrl: null,
};

const room = {
  roomId: "rm-001",
  name: "Hall A",
  building: "Main",
  floor: 1,
  seatsTotal: 100,
  price: 0,
  floorPlanUrl: null,
  facilities: ["projector"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function provideMockGuard() {
  return {
    provide: JwtAuthGuard,
    useValue: { canActivate: jest.fn().mockResolvedValue(true) },
  };
}

function provideMockRolesGuard() {
  return {
    provide: RolesGuard,
    useValue: { canActivate: jest.fn().mockReturnValue(true) },
  };
}

function mockFile(): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "document.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    buffer: Buffer.from("mock-pdf-content"),
    size: 1024,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Catalog Module — Integration", () => {
  let publicController: WorkshopsPublicController;
  let adminController: WorkshopsAdminController;
  let roomsAdminController: RoomsAdminController;
  let speakersAdminController: SpeakersAdminController;
  let aiSummaryAdminController: AiSummaryAdminController;
  let roomsPublicController: RoomsPublicController;
  let speakersPublicController: SpeakersPublicController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [
        WorkshopsPublicController,
        WorkshopsAdminController,
        RoomsAdminController,
        RoomsPublicController,
        SpeakersAdminController,
        SpeakersPublicController,
        AiSummaryAdminController,
      ],
      providers: [
        WorkshopsService,
        RoomConflictService,
        SeatCounterService,
        RoomsService,
        SpeakersService,
        AiSummaryService,
        WorkshopNotificationPublisher,
        { provide: WorkshopsRepository, useValue: mockWorkshopsRepo },
        { provide: RoomConflictService, useValue: mockRoomConflictService },
        { provide: SeatCounterService, useValue: mockSeatCounterService },
        { provide: SpeakersRepository, useValue: mockSpeakersRepo },
        { provide: RoomsRepository, useValue: mockRoomsRepo },
        { provide: AiSummariesRepository, useValue: mockAiSummariesRepo },
        { provide: PdfSummaryPipeline, useValue: mockPipeline },
        { provide: StorageService, useValue: mockStorageService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: NotificationLogProducer,
          useValue: mockNotificationLogProducer,
        },
        {
          provide: WorkshopNotificationPublisher,
          useValue: mockNotificationPublisher,
        },
        { provide: getQueueToken(AI_SUMMARY_QUEUE), useValue: mockQueue },
        provideMockGuard(),
        provideMockRolesGuard(),
      ],
    }).compile();

    publicController = module.get<WorkshopsPublicController>(
      WorkshopsPublicController
    );
    adminController = module.get<WorkshopsAdminController>(
      WorkshopsAdminController
    );
    roomsAdminController =
      module.get<RoomsAdminController>(RoomsAdminController);
    speakersAdminController = module.get<SpeakersAdminController>(
      SpeakersAdminController
    );
    roomsPublicController = module.get<RoomsPublicController>(
      RoomsPublicController
    );
    speakersPublicController = module.get<SpeakersPublicController>(
      SpeakersPublicController
    );
    aiSummaryAdminController = module.get<AiSummaryAdminController>(
      AiSummaryAdminController
    );
  });

  // -------------------------------------------------------------------------
  // WorkshopsPublicController — FR-F02-006, FR-F02-007
  // -------------------------------------------------------------------------
  describe("WorkshopsPublicController", () => {
    describe("listPublished — FR-F02-006", () => {
      it("returns only published workshops with available_seats", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({
            items: [publishedWorkshop],
            nextCursor: null,
            hasMore: false,
            limit: 20,
          })
        );
        mockSeatCounterService.getAvailable.mockResolvedValue(95);

        const result = await publicController.listPublished({
          cursor: undefined,
          limit: 20,
          hasSeats: false,
          sort: "startsAt",
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.hasMore).toBe(false);
        expect(mockWorkshopsRepo.findPublished).toHaveBeenCalled();
      });

      it("supports filtering by date range", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 20 })
        );

        await publicController.listPublished({
          day: "2026-06-01",
          cursor: undefined,
          limit: 20,
          hasSeats: false,
          sort: "startsAt",
        });

        expect(mockWorkshopsRepo.findPublished).toHaveBeenCalledWith(
          expect.objectContaining({
            dateFrom: expect.any(Date),
            dateTo: expect.any(Date),
          })
        );
      });

      it("returns empty list when no published workshops exist", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 20 })
        );

        const result = await publicController.listPublished({
          cursor: undefined,
          limit: 20,
          hasSeats: false,
          sort: "startsAt",
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(0);
        expect(result.data.hasMore).toBe(false);
      });
    });

    describe("getPublicDetail — FR-F02-007", () => {
      it("returns public detail of a published workshop with AI summary", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockSeatCounterService.getCachedSeats.mockResolvedValue(95);
        mockAiSummariesRepo.findByWorkshopId.mockResolvedValue(
          Result.ok({
            summaryId: "sum-001",
            summaryText: "AI summary of the workshop",
            status: "DONE",
          })
        );

        const result = await publicController.getPublicDetail("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.findById).toHaveBeenCalledWith("wid-001");
        expect(mockSeatCounterService.getCachedSeats).toHaveBeenCalledWith(
          "wid-001"
        );
      });

      it("returns WORKSHOP_NOT_PUBLISHED for a draft workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(draftWorkshop));

        const result = await publicController.getPublicDetail("wid-001");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
      });

      it("returns WORKSHOP_NOT_FOUND for non-existent workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.fail(workshopErrors.notFound("wid-nonexistent"))
        );

        const result =
          await publicController.getPublicDetail("wid-nonexistent");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
      });
    });
  });

  // -------------------------------------------------------------------------
  // WorkshopsAdminController — FR-F02-001, FR-F02-003, FR-F02-004, FR-F02-005
  // -------------------------------------------------------------------------
  describe("WorkshopsAdminController", () => {
    const creatorUser = {
      sub: "org-001",
      role: "ORGANIZER",
      jti: "jti-org",
      allowed_workshop_ids: [] as string[],
    };

    describe("createWorkshop — FR-F02-001", () => {
      it("creates a DRAFT workshop successfully", async () => {
        mockRoomConflictService.checkConflict.mockResolvedValue(Result.ok());
        mockWorkshopsRepo.create.mockResolvedValue(
          Result.ok(draftWorkshop.workshops)
        );
        mockSpeakersRepo.findById.mockResolvedValue(Result.ok(speaker));
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.createWorkshop(
          {
            title: "Introduction to AI",
            description: "A beginner-friendly workshop",
            speakerId: "spk-001",
            roomId: "rm-001",
            startsAt: new Date("2026-06-01T08:00:00Z"),
            endsAt: new Date("2026-06-01T10:00:00Z"),
            seatsTotal: 100,
            price: 0,
          },
          creatorUser as any
        );

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: "DRAFT",
            createdBy: "org-001",
          })
        );
        expect(mockRoomConflictService.checkConflict).toHaveBeenCalled();
      });

      it("returns WORKSHOP_TIME_CONFLICT when room is booked — FR-F02-002", async () => {
        mockRoomConflictService.checkConflict.mockResolvedValue(
          Result.fail(
            workshopErrors.roomConflict(
              "rm-001",
              "2026-06-01T08:00:00Z",
              "2026-06-01T10:00:00Z"
            )
          )
        );

        const result = await adminController.createWorkshop(
          {
            title: "Introduction to AI",
            speakerId: "spk-001",
            roomId: "rm-001",
            startsAt: new Date("2026-06-01T08:00:00Z"),
            endsAt: new Date("2026-06-01T10:00:00Z"),
            seatsTotal: 100,
            price: 0,
          },
          creatorUser as any
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
      });
    });

    describe("publishWorkshop — FR-F02-003", () => {
      it("transitions DRAFT to OPEN and initializes Redis counter", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(draftWorkshop));
        mockWorkshopsRepo.updateStatus.mockResolvedValue(
          Result.ok({ ...draftWorkshop.workshops, status: "OPEN" })
        );
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.publishWorkshop("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.updateStatus).toHaveBeenCalledWith(
          "wid-001",
          "OPEN"
        );
        expect(mockSeatCounterService.initialize).toHaveBeenCalledWith(
          "wid-001",
          100
        );
      });

      it("rejects publishing an already OPEN workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );

        const result = await adminController.publishWorkshop("wid-001");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_ALREADY_PUBLISHED");
      });

      it("rejects publishing a CANCELLED workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(cancelledWorkshop)
        );

        const result = await adminController.publishWorkshop("wid-001");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
      });
    });

    describe("cancelWorkshop — FR-F02-004", () => {
      it("cancels an OPEN workshop and deletes Redis counter", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockWorkshopsRepo.updateStatus.mockResolvedValue(
          Result.ok({
            ...publishedWorkshop.workshops,
            status: "CANCELLED",
          })
        );
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.cancelWorkshop("wid-001", {
          reason: "Test cancellation reason for testing",
          notifyRegistered: true,
        });

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.updateStatus).toHaveBeenCalledWith(
          "wid-001",
          "CANCELLED"
        );
        expect(mockSeatCounterService.delete).toHaveBeenCalledWith("wid-001");
        expect(mockNotificationPublisher.publishCancelled).toHaveBeenCalled();
      });

      it("rejects cancelling an already CANCELLED workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(cancelledWorkshop)
        );

        const result = await adminController.cancelWorkshop("wid-001", {
          reason: "Test cancellation reason for testing",
          notifyRegistered: true,
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_CANCELLED");
      });
    });

    describe("emergencyUpdate — FR-F02-005", () => {
      it("updates scheduling fields of an OPEN workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockRoomConflictService.checkConflict.mockResolvedValue(Result.ok());
        mockWorkshopsRepo.update.mockResolvedValue(
          Result.ok({ ...publishedWorkshop.workshops, roomId: "rm-002" })
        );
        mockRoomsRepo.findById.mockResolvedValue(
          Result.ok({ ...room, roomId: "rm-002", name: "Hall B" })
        );

        const result = await adminController.emergencyUpdate("wid-001", {
          roomId: "rm-002",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.update).toHaveBeenCalledWith(
          "wid-001",
          {
            roomId: "rm-002",
          },
          0
        );
        // Should fire notification event
        expect(
          mockNotificationPublisher.publishEmergencyUpdate
        ).toHaveBeenCalled();
      });

      it("rejects emergency update on a DRAFT workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(draftWorkshop));

        const result = await adminController.emergencyUpdate("wid-001", {
          roomId: "rm-002",
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
      });

      it("rejects if room conflict exists", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockRoomConflictService.checkConflict.mockResolvedValue(
          Result.fail(
            workshopErrors.roomConflict(
              "rm-002",
              "2026-06-01T08:00:00Z",
              "2026-06-01T10:00:00Z"
            )
          )
        );

        const result = await adminController.emergencyUpdate("wid-001", {
          roomId: "rm-002",
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
      });
    });
  });

  // -------------------------------------------------------------------------
  // RoomsAdminController
  // -------------------------------------------------------------------------
  describe("RoomsAdminController", () => {
    beforeEach(() => {
      mockRoomsRepo.findAll.mockResolvedValue(Result.ok([room]));
      mockRoomsRepo.create.mockResolvedValue(Result.ok(room));
      mockRoomsRepo.update.mockResolvedValue(Result.ok(room));
    });

    describe("listRooms", () => {
      it("returns all rooms", async () => {
        const result = await roomsAdminController.listRooms({} as any);

        expect(result.isSuccess).toBe(true);
        expect(mockRoomsRepo.findAll).toHaveBeenCalled();
      });
    });

    describe("createRoom", () => {
      it("creates a new room", async () => {
        const result = await roomsAdminController.createRoom({
          name: "Hall B",
          capacity: 50,
        });

        expect(result.isSuccess).toBe(true);
        expect(mockRoomsRepo.create).toHaveBeenCalled();
      });
    });

    describe("updateRoom", () => {
      it("updates an existing room", async () => {
        const result = await roomsAdminController.updateRoom("rm-001", {
          name: "Hall A Updated",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockRoomsRepo.update).toHaveBeenCalledWith("rm-001", {
          name: "Hall A Updated",
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // SpeakersAdminController
  // -------------------------------------------------------------------------
  describe("SpeakersAdminController", () => {
    beforeEach(() => {
      mockSpeakersRepo.findAll.mockResolvedValue(Result.ok([speaker]));
      mockSpeakersRepo.create.mockResolvedValue(Result.ok(speaker));
      mockSpeakersRepo.update.mockResolvedValue(Result.ok(speaker));
    });

    describe("listSpeakers", () => {
      it("returns all speakers", async () => {
        const result = await speakersAdminController.listSpeakers({} as any);

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.findAll).toHaveBeenCalled();
      });
    });

    describe("createSpeaker", () => {
      it("creates a new speaker", async () => {
        const result = await speakersAdminController.createSpeaker({
          fullName: "Dr. Smith",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.create).toHaveBeenCalled();
      });
    });

    describe("updateSpeaker", () => {
      it("updates an existing speaker", async () => {
        const result = await speakersAdminController.updateSpeaker("spk-001", {
          fullName: "Dr. Smith Updated",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.update).toHaveBeenCalledWith("spk-001", {
          fullName: "Dr. Smith Updated",
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // AiSummaryAdminController — FR-F03-001, FR-F03-002
  // -------------------------------------------------------------------------
  describe("AiSummaryAdminController", () => {
    const mockFile = (): Express.Multer.File => ({
      fieldname: "file",
      originalname: "document.pdf",
      encoding: "7bit",
      mimetype: "application/pdf",
      buffer: Buffer.from("mock-pdf-content"),
      size: 1024,
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    });

    beforeEach(() => {
      mockWorkshopsRepo.findById = jest.fn();
      mockPipeline.execute = jest.fn();
      mockStorageService.uploadFile = jest.fn();
    });

    describe("uploadDocument — FR-F03-001", () => {
      it("uploads a PDF and queues AI summary", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockStorageService.uploadFile.mockResolvedValue(Result.ok());

        const result = await aiSummaryAdminController.uploadDocument(
          "wid-001",
          mockFile()
        );

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.findById).toHaveBeenCalledWith("wid-001");
        expect(mockStorageService.uploadFile).toHaveBeenCalled();
      });

      it("returns WORKSHOP_NOT_FOUND for non-existent workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.fail(workshopErrors.notFound("wid-nonexistent"))
        );

        const result = await aiSummaryAdminController.uploadDocument(
          "wid-nonexistent",
          mockFile()
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
      });
    });

    describe("getAiSummary", () => {
      it("returns AI summary when found", async () => {
        const summaryResult = {
          summaryId: "sum-001",
          summaryText: "AI generated summary",
          status: "DONE",
        };
        mockAiSummariesRepo.findByWorkshopId.mockResolvedValue(
          Result.ok(summaryResult)
        );

        const result = await aiSummaryAdminController.getAiSummary("wid-001");

        expect(result.isSuccess).toBe(true);
      });

      it("returns NONE status when no summary exists", async () => {
        mockAiSummariesRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));

        const result = await aiSummaryAdminController.getAiSummary("wid-001");

        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.data.status).toBe("NONE");
        }
      });
    });

    describe("retryAiSummary — FR-F03-002", () => {
      it("retries failed AI summary generation", async () => {
        mockAiSummariesRepo.findByWorkshopId.mockResolvedValue(
          Result.ok({
            summaryId: "sum-001",
            status: "FAILED",
            summaryText: null,
          })
        );
        mockAiSummariesRepo.updateStatus = jest
          .fn()
          .mockResolvedValue(Result.ok());

        const result = await aiSummaryAdminController.retryAiSummary("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockAiSummariesRepo.findByWorkshopId).toHaveBeenCalledWith(
          "wid-001"
        );
      });

      it("skips retry when summary is already DONE", async () => {
        mockAiSummariesRepo.findByWorkshopId.mockResolvedValue(
          Result.ok({
            summaryId: "sum-001",
            status: "DONE",
            summaryText: "text",
          })
        );

        const result = await aiSummaryAdminController.retryAiSummary("wid-001");

        expect(result.isSuccess).toBe(true);
      });
    });
  });
});
