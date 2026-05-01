import { Test, type TestingModule } from "@nestjs/testing";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { WorkshopResponseBuilder } from "../dto/workshop-response.dto";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { RoomsRepository } from "../repositories/rooms.repository";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";
import { WorkshopSlotsRepository } from "../repositories/workshop-slots.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";
import { RoomConflictService } from "./room-conflict.service";
import { SeatCounterService } from "./seat-counter.service";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";
import { WorkshopsService } from "./workshops.service";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const baseWorkshop = {
  workshopId: "w-001",
  title: "Intro to Testing",
  description: "Learn testing",
  speakerId: "s-001",
  roomId: "r-001",
  startsAt: new Date("2026-06-01T09:00:00Z"),
  endsAt: new Date("2026-06-01T11:00:00Z"),
  capacity: 30,
  isPaid: false,
  price: null,
  status: "DRAFT",
  createdBy: "u-001",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

const publishedWorkshop = { ...baseWorkshop, status: "PUBLISHED" };
const cancelledWorkshop = { ...baseWorkshop, status: "CANCELLED" };

const mockSpeaker = {
  speakerId: "s-001",
  fullName: "John Doe",
  title: "Expert",
  bio: "Bio",
  avatarUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockRoom = {
  roomId: "r-001",
  name: "Room A",
  building: "Building 1",
  floor: 2,
  capacity: 50,
  floorPlanUrl: null,
  facilities: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockSlot = {
  workshopId: "w-001",
  totalCapacity: 30,
  lockedCount: 2,
  confirmedCount: 10,
};

const mockAiSummary = {
  summaryId: "sum-001",
  documentId: "doc-001",
  workshopId: "w-001",
  status: "DONE",
  summaryText: "AI generated summary",
  modelUsed: "gpt-4",
  generatedAt: new Date("2026-05-01T00:00:00Z"),
  errorMessage: null,
};

const mockWorkshopRow = {
  workshops: baseWorkshop,
  speakers: mockSpeaker,
  rooms: mockRoom,
};

const mockPublishedRow = {
  workshops: publishedWorkshop,
  speakers: mockSpeaker,
  rooms: mockRoom,
};

const mockCancelledRow = {
  workshops: cancelledWorkshop,
  speakers: mockSpeaker,
  rooms: mockRoom,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WorkshopsService", () => {
  let service: WorkshopsService;
  let workshopsRepo: jest.Mocked<WorkshopsRepository>;
  let roomConflictService: jest.Mocked<RoomConflictService>;
  let seatCounterService: jest.Mocked<SeatCounterService>;
  let speakersRepo: jest.Mocked<SpeakersRepository>;
  let roomsRepo: jest.Mocked<RoomsRepository>;
  let workshopSlotsRepo: jest.Mocked<WorkshopSlotsRepository>;
  let workshopDocumentsRepo: jest.Mocked<WorkshopDocumentsRepository>;
  let aiSummariesRepo: jest.Mocked<AiSummariesRepository>;
  let notificationPublisher: jest.Mocked<WorkshopNotificationPublisher>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopsService,
        {
          provide: WorkshopsRepository,
          useValue: {
            findById: jest.fn(),
            findPublished: jest.fn(),
            listAdmin: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateStatus: jest.fn(),
            completePastPublished: jest.fn(),
          },
        },
        {
          provide: RoomConflictService,
          useValue: { checkConflict: jest.fn() },
        },
        {
          provide: SeatCounterService,
          useValue: {
            getAvailable: jest.fn(),
            initialize: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: SpeakersRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: RoomsRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: WorkshopSlotsRepository,
          useValue: {
            findByWorkshopId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: WorkshopDocumentsRepository,
          useValue: {},
        },
        {
          provide: AiSummariesRepository,
          useValue: { findByWorkshopId: jest.fn() },
        },
        {
          provide: WorkshopNotificationPublisher,
          useValue: {
            publishEmergencyUpdate: jest.fn(),
            publishCancelled: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkshopsService>(WorkshopsService);
    workshopsRepo = module.get(WorkshopsRepository);
    roomConflictService = module.get(RoomConflictService);
    seatCounterService = module.get(SeatCounterService);
    speakersRepo = module.get(SpeakersRepository);
    roomsRepo = module.get(RoomsRepository);
    workshopSlotsRepo = module.get(WorkshopSlotsRepository);
    workshopDocumentsRepo = module.get(WorkshopDocumentsRepository);
    aiSummariesRepo = module.get(AiSummariesRepository);
    notificationPublisher = module.get(WorkshopNotificationPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createWorkshop
  // ---------------------------------------------------------------------------
  describe("createWorkshop", () => {
    const createDto = {
      title: "New Workshop",
      description: "Description",
      speaker_id: "s-001",
      room_id: "r-001",
      starts_at: new Date("2026-06-01T09:00:00Z"),
      ends_at: new Date("2026-06-01T11:00:00Z"),
      capacity: 30,
      is_paid: false,
      price: undefined,
    };

    it("creates a workshop in DRAFT status with slot, speaker, and room (FR-F02-001)", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      workshopSlotsRepo.create.mockResolvedValue(Result.ok(mockSlot));
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const dto = result.data;
        expect(dto.workshop_id).toBe("w-001");
        expect(dto.status).toBe("DRAFT");
        expect(dto.speaker_name).toBe("John Doe");
        expect(dto.room_name).toBe("Room A");
      }
      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-001",
        createDto.starts_at,
        createDto.ends_at
      );
      expect(workshopSlotsRepo.create).toHaveBeenCalledWith(
        baseWorkshop.workshopId,
        30
      );
    });

    it("fails when room conflict exists (FR-F02-002)", async () => {
      roomConflictService.checkConflict.mockResolvedValue(
        Result.fail(workshopErrors.roomConflict("r-001", "09:00", "11:00"))
      );

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
    });

    it("fails when workshop creation fails", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isFailure).toBe(true);
    });

    it("fails when slot creation fails", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      workshopSlotsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isFailure).toBe(true);
    });

    it("handles missing speaker gracefully with 'Unknown'", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      workshopSlotsRepo.create.mockResolvedValue(Result.ok(mockSlot));
      speakersRepo.findById.mockResolvedValue(Result.ok(null));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.speaker_name).toBe("Unknown");
      }
    });

    it("passes price as string when is_paid is true", async () => {
      const paidDto = { ...createDto, is_paid: true, price: 50 };
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      workshopSlotsRepo.create.mockResolvedValue(Result.ok(mockSlot));
      speakersRepo.findById.mockResolvedValue(Result.ok(null));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.createWorkshop(paidDto as any, "u-001");

      expect(workshopsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: "50",
          isPaid: true,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateWorkshop
  // ---------------------------------------------------------------------------
  describe("updateWorkshop", () => {
    const updateDto = { title: "Updated Title" };

    it("updates a DRAFT workshop (FR-F02-005)", async () => {
      const updatedWorkshop = { ...baseWorkshop, title: "Updated Title" };
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.update.mockResolvedValue(Result.ok(updatedWorkshop));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.updateWorkshop("w-001", updateDto as any);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshop_id).toBe("w-001");
      }
      expect(workshopsRepo.update).toHaveBeenCalledWith("w-001", {
        title: "Updated Title",
      });
    });

    it("fails when workshop is not DRAFT", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));

      const result = await service.updateWorkshop("w-001", updateDto as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("re-checks room conflict when room/time changes", async () => {
      const dtoWithRoom = {
        room_id: "r-002",
        starts_at: new Date("2026-07-01T09:00:00Z"),
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(baseWorkshop));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.updateWorkshop("w-001", dtoWithRoom as any);

      expect(result.isSuccess).toBe(true);
      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-002",
        dtoWithRoom.starts_at,
        baseWorkshop.endsAt,
        "w-001"
      );
    });

    it("fails on room conflict when updating (FR-F02-002)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      roomConflictService.checkConflict.mockResolvedValue(
        Result.fail(workshopErrors.roomConflict("r-002", "09:00", "11:00"))
      );

      const result = await service.updateWorkshop("w-001", {
        room_id: "r-002",
      } as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
    });

    it("fails when findById fails", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateWorkshop("w-001", updateDto as any);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // publishWorkshop
  // ---------------------------------------------------------------------------
  describe("publishWorkshop", () => {
    it("publishes a DRAFT workshop initializing Redis (FR-F02-003)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok(publishedWorkshop)
      );
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      seatCounterService.initialize.mockResolvedValue();
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.publishWorkshop("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("PUBLISHED");
      }
      expect(workshopsRepo.updateStatus).toHaveBeenCalledWith(
        "w-001",
        "PUBLISHED"
      );
      expect(seatCounterService.initialize).toHaveBeenCalledWith("w-001", 30);
    });

    it("fails when workshop is not DRAFT (wrong status)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));

      const result = await service.publishWorkshop("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("creates a slot if none exists during publish", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok(publishedWorkshop)
      );
      // First findByWorkshopId returns null (no slot yet)
      workshopSlotsRepo.findByWorkshopId
        .mockResolvedValueOnce(Result.ok(null))
        .mockResolvedValueOnce(Result.ok(mockSlot));
      workshopSlotsRepo.create.mockResolvedValue(Result.ok(mockSlot));
      seatCounterService.initialize.mockResolvedValue();
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.publishWorkshop("w-001");

      expect(result.isSuccess).toBe(true);
      expect(workshopSlotsRepo.create).toHaveBeenCalledWith("w-001", 30);
    });

    it("fails when findById fails", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.publishWorkshop("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // emergencyUpdate
  // ---------------------------------------------------------------------------
  describe("emergencyUpdate", () => {
    const emergencyDto = { room_id: "r-002" };

    it("updates scheduling fields on a PUBLISHED workshop (FR-F02-005)", async () => {
      const updateChanges = {
        workshops: publishedWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(updateChanges));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(publishedWorkshop));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.emergencyUpdate(
        "w-001",
        emergencyDto as any
      );

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.update).toHaveBeenCalledWith("w-001", {
        roomId: "r-002",
      });
      expect(notificationPublisher.publishEmergencyUpdate).toHaveBeenCalled();
    });

    it("fails when workshop is not PUBLISHED", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));

      const result = await service.emergencyUpdate(
        "w-001",
        emergencyDto as any
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("re-checks room conflict and excludes self", async () => {
      const updateChanges = {
        workshops: publishedWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(updateChanges));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(publishedWorkshop));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.emergencyUpdate("w-001", emergencyDto as any);

      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-002",
        publishedWorkshop.startsAt,
        publishedWorkshop.endsAt,
        "w-001"
      );
    });

    it("fails on room conflict (FR-F02-002)", async () => {
      const updateChanges = {
        workshops: publishedWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(updateChanges));
      roomConflictService.checkConflict.mockResolvedValue(
        Result.fail(workshopErrors.roomConflict("r-002", "09:00", "11:00"))
      );

      const result = await service.emergencyUpdate(
        "w-001",
        emergencyDto as any
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
    });

    it("publishes notification event for async dispatch (FR-F02-005)", async () => {
      const updateChanges = {
        workshops: publishedWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(updateChanges));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(publishedWorkshop));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.emergencyUpdate("w-001", emergencyDto as any);

      expect(notificationPublisher.publishEmergencyUpdate).toHaveBeenCalledWith(
        publishedWorkshop,
        { roomId: "r-002" }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // cancelWorkshop
  // ---------------------------------------------------------------------------
  describe("cancelWorkshop", () => {
    it("cancels a PUBLISHED workshop and deletes Redis seat key (FR-F02-004)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok(cancelledWorkshop)
      );
      seatCounterService.delete.mockResolvedValue();
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.cancelWorkshop("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("CANCELLED");
      }
      expect(workshopsRepo.updateStatus).toHaveBeenCalledWith(
        "w-001",
        "CANCELLED"
      );
      expect(seatCounterService.delete).toHaveBeenCalledWith("w-001");
      expect(notificationPublisher.publishCancelled).toHaveBeenCalled();
    });

    it("fails when workshop is already CANCELLED", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockCancelledRow));

      const result = await service.cancelWorkshop("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_CANCELLED");
    });

    it("does not delete Redis seat counter for DRAFT workshops", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...baseWorkshop, status: "CANCELLED" })
      );
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.cancelWorkshop("w-001");

      expect(seatCounterService.delete).not.toHaveBeenCalled();
      expect(notificationPublisher.publishCancelled).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // listPublished
  // ---------------------------------------------------------------------------
  describe("listPublished", () => {
    const query = { page: 1, limit: 20 };

    it("returns published workshops with seat counts (FR-F02-006)", async () => {
      // Service accesses workshop.workshopId / workshop.speakers?.fullName,
      // so items must expose Workshop fields at top level (WorkshopWithSpeakerRoom).
      const flatItem = {
        ...publishedWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      workshopsRepo.findPublished.mockResolvedValue(
        Result.ok({
          items: [flatItem],
          total: 1,
        })
      );
      seatCounterService.getAvailable.mockResolvedValue(25);

      const result = await service.listPublished(query as any);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].workshop_id).toBe("w-001");
        expect(result.data.items[0].available_seats).toBe(25);
      }
    });

    it("applies filters from query", async () => {
      const filteredQuery = {
        page: 1,
        limit: 10,
        dateFrom: new Date("2026-06-01"),
        dateTo: new Date("2026-06-30"),
        isPaid: false,
      };
      workshopsRepo.findPublished.mockResolvedValue(
        Result.ok({ items: [], total: 0 })
      );

      const result = await service.listPublished(filteredQuery as any);

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.findPublished).toHaveBeenCalledWith(filteredQuery);
    });
  });

  // ---------------------------------------------------------------------------
  // getPublicDetail
  // ---------------------------------------------------------------------------
  describe("getPublicDetail", () => {
    it("returns detail for a published workshop with AI summary (FR-F02-007)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));
      seatCounterService.getAvailable.mockResolvedValue(25);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.ok([mockAiSummary])
      );

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshop_id).toBe("w-001");
        expect(result.data.available_seats).toBe(25);
        expect(result.data.speaker_name).toBe("John Doe");
        expect(result.data.room_name).toBe("Room A");
      }
    });

    it("fails when workshop is not PUBLISHED", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));

      const result = await service.getPublicDetail("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("fails when workshop is not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getPublicDetail("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });

    it("returns detail without AI summary when none exists", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));
      seatCounterService.getAvailable.mockResolvedValue(25);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getAdminDetail
  // ---------------------------------------------------------------------------
  describe("getAdminDetail", () => {
    it("returns admin detail with slot counters", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.ok({
          workshops: baseWorkshop,
          speakers: mockSpeaker,
          rooms: mockRoom,
        })
      );
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));

      const result = await service.getAdminDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshop_id).toBe("w-001");
        expect(result.data.confirmed_count).toBe(10);
        expect(result.data.locked_count).toBe(2);
        expect(result.data.status).toBe("DRAFT");
        expect(result.data.created_by).toBe("u-001");
      }
    });

    it("fails when workshop not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getAdminDetail("w-001");

      expect(result.isFailure).toBe(true);
    });

    it("uses 0 for slot counters when slot is null", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.ok({
          workshops: baseWorkshop,
          speakers: mockSpeaker,
          rooms: mockRoom,
        })
      );
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));

      const result = await service.getAdminDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.confirmed_count).toBe(0);
        expect(result.data.locked_count).toBe(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // listAdmin
  // ---------------------------------------------------------------------------
  describe("listAdmin", () => {
    const query = { page: 1, limit: 20 };

    it("returns paginated admin workshop list", async () => {
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.ok({
          items: [
            {
              workshops: baseWorkshop,
              workshopSlots: mockSlot,
              speakers: mockSpeaker,
              rooms: mockRoom,
            },
          ],
          total: 1,
        })
      );

      const result = await service.listAdmin(query as any);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].confirmed_count).toBe(10);
      }
    });

    it("filters by status when provided", async () => {
      const filteredQuery = { status: "DRAFT", page: 1, limit: 20 };
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.ok({ items: [], total: 0 })
      );

      const result = await service.listAdmin(filteredQuery as any);

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.listAdmin).toHaveBeenCalledWith(filteredQuery);
    });

    it("proxies repository failure", async () => {
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.listAdmin(query as any);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------
  describe("getStats", () => {
    it("returns stats from slot and Redis", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(mockSlot));
      seatCounterService.getAvailable.mockResolvedValue(18);

      const result = await service.getStats("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.confirmed_count).toBe(10);
        expect(result.data.locked_count).toBe(2);
        expect(result.data.available_seats).toBe(18);
        expect(result.data.total_capacity).toBe(30);
      }
    });

    it("uses 0 for slot counters when slot is null", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));
      seatCounterService.getAvailable.mockResolvedValue(30);

      const result = await service.getStats("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.confirmed_count).toBe(0);
        expect(result.data.locked_count).toBe(0);
      }
    });

    it("fails when workshop not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getStats("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getPublishedById (cross-module)
  // ---------------------------------------------------------------------------
  describe("getPublishedById", () => {
    it("returns workshop entity when published (cross-module)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockPublishedRow));

      const result = await service.getPublishedById("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshopId).toBe("w-001");
      }
    });

    it("fails with WORKSHOP_NOT_PUBLISHED when status is not PUBLISHED", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));

      const result = await service.getPublishedById("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("fails with WORKSHOP_NOT_FOUND when workshop does not exist", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getPublishedById("nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // completePastWorkshops (cron)
  // ---------------------------------------------------------------------------
  describe("completePastWorkshops", () => {
    it("completes past published workshops and returns count (FR-F10-005)", async () => {
      workshopsRepo.completePastPublished.mockResolvedValue(Result.ok(5));

      const result = await service.completePastWorkshops();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(5);
      }
    });

    it("returns 0 when no workshops to complete", async () => {
      workshopsRepo.completePastPublished.mockResolvedValue(Result.ok(0));

      const result = await service.completePastWorkshops();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(0);
      }
    });

    it("proxies repository failure", async () => {
      workshopsRepo.completePastPublished.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.completePastWorkshops();

      expect(result.isFailure).toBe(true);
    });
  });
});
