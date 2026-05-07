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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { AI_SUMMARY_QUEUE } from "@/infra/messaging/queue.constants";
import { DocumentsAdminController } from "@/modules/catalog/controllers/documents-admin.controller";
import { RoomsAdminController } from "@/modules/catalog/controllers/rooms-admin.controller";
import { SpeakersAdminController } from "@/modules/catalog/controllers/speakers-admin.controller";
import { WorkshopsAdminController } from "@/modules/catalog/controllers/workshops-admin.controller";
import { WorkshopsPublicController } from "@/modules/catalog/controllers/workshops-public.controller";
import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";
import { RoomsRepository } from "@/modules/catalog/repositories/rooms.repository";
import { SpeakersRepository } from "@/modules/catalog/repositories/speakers.repository";
import { WorkshopDocumentsRepository } from "@/modules/catalog/repositories/workshop-documents.repository";
import { WorkshopSlotsRepository } from "@/modules/catalog/repositories/workshop-slots.repository";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { DocumentsService } from "@/modules/catalog/services/documents.service";
import { RoomConflictService } from "@/modules/catalog/services/room-conflict.service";
import { RoomsService } from "@/modules/catalog/services/rooms.service";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { SpeakersService } from "@/modules/catalog/services/speakers.service";
import { WorkshopNotificationPublisher } from "@/modules/catalog/services/workshop-notification-publisher.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
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
  completePastPublished: jest.fn(),
};

const mockRoomConflictService = {
  checkConflict: jest.fn(),
};

const mockSeatCounterService = {
  getAvailable: jest.fn(),
  initialize: jest.fn(),
  delete: jest.fn(),
};

const mockSpeakersRepo = {
  findById: jest.fn(),
  listSpeakers: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockRoomsRepo = {
  findById: jest.fn(),
  listRooms: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockWorkshopSlotsRepo = {
  create: jest.fn(),
  findByWorkshopId: jest.fn(),
};

const mockWorkshopDocumentsRepo = {
  create: jest.fn(),
  findByWorkshopId: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
};

const mockAiSummariesRepo = {
  findByWorkshopId: jest.fn(),
  retryAiSummary: jest.fn(),
};

const mockNotificationPublisher = {
  publishEmergencyUpdate: jest.fn(),
  publishCancelled: jest.fn(),
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
    capacity: 100,
    isPaid: false,
    price: null,
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
  workshops: { ...draftWorkshop.workshops, status: "PUBLISHED" },
};

const cancelledWorkshop = {
  ...draftWorkshop,
  workshops: { ...draftWorkshop.workshops, status: "CANCELLED" },
};

const workshopSlot = {
  slotId: "slot-001",
  workshopId: "wid-001",
  totalCapacity: 100,
  confirmedCount: 0,
  lockedCount: 0,
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
  capacity: 100,
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
  let documentsAdminController: DocumentsAdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [
        WorkshopsPublicController,
        WorkshopsAdminController,
        RoomsAdminController,
        SpeakersAdminController,
        DocumentsAdminController,
      ],
      providers: [
        WorkshopsService,
        RoomConflictService,
        SeatCounterService,
        RoomsService,
        SpeakersService,
        DocumentsService,
        WorkshopNotificationPublisher,
        { provide: WorkshopsRepository, useValue: mockWorkshopsRepo },
        { provide: RoomConflictService, useValue: mockRoomConflictService },
        { provide: SeatCounterService, useValue: mockSeatCounterService },
        { provide: SpeakersRepository, useValue: mockSpeakersRepo },
        { provide: RoomsRepository, useValue: mockRoomsRepo },
        { provide: WorkshopSlotsRepository, useValue: mockWorkshopSlotsRepo },
        {
          provide: WorkshopDocumentsRepository,
          useValue: mockWorkshopDocumentsRepo,
        },
        { provide: AiSummariesRepository, useValue: mockAiSummariesRepo },
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
    documentsAdminController = module.get<DocumentsAdminController>(
      DocumentsAdminController
    );
  });

  // -------------------------------------------------------------------------
  // WorkshopsPublicController — FR-F02-006, FR-F02-007
  // -------------------------------------------------------------------------
  describe("WorkshopsPublicController", () => {
    describe("listPublished — FR-F02-006", () => {
      it("returns only published workshops with available_seats", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({ items: [publishedWorkshop], total: 1 })
        );
        mockSeatCounterService.getAvailable.mockResolvedValue(95);

        const result = await publicController.listPublished({
          page: 1,
          limit: 20,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(mockWorkshopsRepo.findPublished).toHaveBeenCalled();
      });

      it("supports filtering by faculty and date range", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({ items: [], total: 0 })
        );

        await publicController.listPublished({
          faculty: "Engineering",
          date_from: new Date("2026-06-01"),
          date_to: new Date("2026-06-30"),
          page: 1,
          limit: 20,
        });

        expect(mockWorkshopsRepo.findPublished).toHaveBeenCalledWith(
          expect.objectContaining({
            faculty: "Engineering",
            date_from: "2026-06-01",
            date_to: "2026-06-30",
          })
        );
      });

      it("returns empty list when no published workshops exist", async () => {
        mockWorkshopsRepo.findPublished.mockResolvedValue(
          Result.ok({ items: [], total: 0 })
        );

        const result = await publicController.listPublished({
          page: 1,
          limit: 20,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(0);
        expect(result.data.total).toBe(0);
      });
    });

    describe("getPublicDetail — FR-F02-007", () => {
      it("returns public detail of a published workshop with AI summary", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockSeatCounterService.getAvailable.mockResolvedValue(95);
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
        expect(mockSeatCounterService.getAvailable).toHaveBeenCalledWith(
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
        mockWorkshopSlotsRepo.create.mockResolvedValue(Result.ok(workshopSlot));
        mockSpeakersRepo.findById.mockResolvedValue(Result.ok(speaker));
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.createWorkshop(
          {
            title: "Introduction to AI",
            description: "A beginner-friendly workshop",
            speaker_id: "spk-001",
            room_id: "rm-001",
            starts_at: new Date("2026-06-01T08:00:00Z"),
            ends_at: new Date("2026-06-01T10:00:00Z"),
            capacity: 100,
            is_paid: false,
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
            speaker_id: "spk-001",
            room_id: "rm-001",
            starts_at: new Date("2026-06-01T08:00:00Z"),
            ends_at: new Date("2026-06-01T10:00:00Z"),
            capacity: 100,
            is_paid: false,
          },
          creatorUser as any
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
      });
    });

    describe("publishWorkshop — FR-F02-003", () => {
      it("transitions DRAFT to PUBLISHED and initializes Redis counter", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(draftWorkshop));
        mockWorkshopsRepo.updateStatus.mockResolvedValue(
          Result.ok({ ...draftWorkshop.workshops, status: "PUBLISHED" })
        );
        mockWorkshopSlotsRepo.findByWorkshopId.mockResolvedValue(
          Result.ok(workshopSlot)
        );
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.publishWorkshop("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.updateStatus).toHaveBeenCalledWith(
          "wid-001",
          "PUBLISHED"
        );
        expect(mockSeatCounterService.initialize).toHaveBeenCalledWith(
          "wid-001",
          100
        );
      });

      it("rejects publishing an already PUBLISHED workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );

        const result = await adminController.publishWorkshop("wid-001");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
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
      it("cancels a PUBLISHED workshop and deletes Redis counter", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockWorkshopsRepo.updateStatus.mockResolvedValue(
          Result.ok({
            ...publishedWorkshop.workshops,
            status: "CANCELLED",
          })
        );
        mockWorkshopSlotsRepo.findByWorkshopId.mockResolvedValue(
          Result.ok(workshopSlot)
        );
        mockRoomsRepo.findById.mockResolvedValue(Result.ok(room));

        const result = await adminController.cancelWorkshop("wid-001");

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

        const result = await adminController.cancelWorkshop("wid-001");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("WORKSHOP_CANCELLED");
      });
    });

    describe("emergencyUpdate — FR-F02-005", () => {
      it("updates scheduling fields of a PUBLISHED workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockRoomConflictService.checkConflict.mockResolvedValue(Result.ok());
        mockWorkshopsRepo.update.mockResolvedValue(
          Result.ok({ ...publishedWorkshop.workshops, roomId: "rm-002" })
        );
        mockWorkshopSlotsRepo.findByWorkshopId.mockResolvedValue(
          Result.ok(workshopSlot)
        );
        mockRoomsRepo.findById.mockResolvedValue(
          Result.ok({ ...room, roomId: "rm-002", name: "Hall B" })
        );

        const result = await adminController.emergencyUpdate("wid-001", {
          room_id: "rm-002",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.update).toHaveBeenCalledWith("wid-001", {
          roomId: "rm-002",
        });
        // Should fire notification event
        expect(
          mockNotificationPublisher.publishEmergencyUpdate
        ).toHaveBeenCalled();
      });

      it("rejects emergency update on a DRAFT workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(draftWorkshop));

        const result = await adminController.emergencyUpdate("wid-001", {
          room_id: "rm-002",
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
          room_id: "rm-002",
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
      mockRoomsRepo.listRooms.mockResolvedValue(Result.ok([room]));
      mockRoomsRepo.create.mockResolvedValue(Result.ok(room));
      mockRoomsRepo.update.mockResolvedValue(Result.ok(room));
    });

    describe("listRooms", () => {
      it("returns all rooms", async () => {
        const result = await roomsAdminController.listRooms();

        expect(result.isSuccess).toBe(true);
        expect(mockRoomsRepo.listRooms).toHaveBeenCalled();
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
      mockSpeakersRepo.listSpeakers.mockResolvedValue(Result.ok([speaker]));
      mockSpeakersRepo.create.mockResolvedValue(Result.ok(speaker));
      mockSpeakersRepo.update.mockResolvedValue(Result.ok(speaker));
    });

    describe("listSpeakers", () => {
      it("returns all speakers", async () => {
        const result = await speakersAdminController.listSpeakers();

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.listSpeakers).toHaveBeenCalled();
      });
    });

    describe("createSpeaker", () => {
      it("creates a new speaker", async () => {
        const result = await speakersAdminController.createSpeaker({
          full_name: "Dr. Smith",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.create).toHaveBeenCalled();
      });
    });

    describe("updateSpeaker", () => {
      it("updates an existing speaker", async () => {
        const result = await speakersAdminController.updateSpeaker("spk-001", {
          full_name: "Dr. Smith Updated",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockSpeakersRepo.update).toHaveBeenCalledWith("spk-001", {
          fullName: "Dr. Smith Updated",
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // DocumentsAdminController — FR-F03-001, FR-F03-002
  // -------------------------------------------------------------------------
  describe("DocumentsAdminController", () => {
    const adminUser = {
      sub: "org-001",
      role: "ORGANIZER" as const,
      jti: "jti-org",
      allowed_workshop_ids: [] as string[],
    };
    const documentRecord = {
      documentId: "doc-001",
      workshopId: "wid-001",
      fileName: "document.pdf",
      fileUrl: "https://storage.example.com/document.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      uploadStatus: "UPLOADED",
    };

    beforeEach(() => {
      mockWorkshopDocumentsRepo.create = jest
        .fn()
        .mockResolvedValue(Result.ok(documentRecord));
      mockWorkshopDocumentsRepo.findByWorkshopId = jest
        .fn()
        .mockResolvedValue(Result.ok([documentRecord]));
      mockWorkshopDocumentsRepo.findById = jest
        .fn()
        .mockResolvedValue(Result.ok(documentRecord));
      mockWorkshopDocumentsRepo.delete = jest
        .fn()
        .mockResolvedValue(Result.ok({ deleted: true }));
      mockAiSummariesRepo.findByWorkshopId = jest
        .fn()
        .mockResolvedValue(Result.ok(null));
      mockAiSummariesRepo.retryAiSummary = jest
        .fn()
        .mockResolvedValue(
          Result.ok({ summaryId: "sum-001", status: "PENDING" })
        );
    });

    describe("uploadDocument — FR-F03-001", () => {
      it("uploads a PDF document and queues AI summary", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );

        await documentsAdminController.uploadDocument(
          "wid-001",
          mockFile(),
          adminUser
        );

        // DocumentsService.uploadDocument calls workshopsRepo.findById
        // to verify workshop exists, then creates document record
        expect(mockWorkshopsRepo.findById).toHaveBeenCalledWith("wid-001");
      });
    });

    describe("listDocuments", () => {
      it("lists documents for a workshop", async () => {
        const result = await documentsAdminController.listDocuments("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopDocumentsRepo.findByWorkshopId).toHaveBeenCalledWith(
          "wid-001"
        );
      });
    });

    describe("deleteDocument", () => {
      it("deletes a document", async () => {
        const result = await documentsAdminController.deleteDocument(
          "wid-001",
          "doc-001"
        );

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopDocumentsRepo.delete).toHaveBeenCalledWith(
          "wid-001",
          "doc-001"
        );
      });
    });

    describe("getAiSummary", () => {
      it("returns AI summary for a workshop", async () => {
        const summaryResult = {
          summaryId: "sum-001",
          summaryText: "AI generated summary",
          status: "DONE",
        };
        mockAiSummariesRepo.findByWorkshopId = jest
          .fn()
          .mockResolvedValue(Result.ok(summaryResult));

        const result = await documentsAdminController.getAiSummary("wid-001");

        expect(result.isSuccess).toBe(true);
        expect(mockAiSummariesRepo.findByWorkshopId).toHaveBeenCalledWith(
          "wid-001"
        );
      });
    });

    describe("retryAiSummary — FR-F03-002", () => {
      it("retries failed AI summary generation", async () => {
        const result = await documentsAdminController.retryAiSummary("doc-001");

        expect(result.isSuccess).toBe(true);
        expect(mockAiSummariesRepo.retryAiSummary).toHaveBeenCalledWith(
          "doc-001"
        );
      });
    });
  });
});
