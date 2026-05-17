import { Test, type TestingModule } from "@nestjs/testing";

import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomConflictService } from "./room-conflict.service";
import { SeatCounterService } from "./seat-counter.service";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";
import { WorkshopsService } from "./workshops.service";
import { RoomsRepository } from "../repositories/rooms.repository";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";

// ---------------------------------------------------------------------------
// Mock data — matches the Workshop schema from event-core.schema.ts
// ---------------------------------------------------------------------------

const baseWorkshop = {
  workshopId: "w-001",
  title: "Intro to Testing",
  description: "Learn testing" as string | null,
  speakerId: "s-001",
  roomId: "r-001",
  startsAt: new Date("2026-06-01T09:00:00Z"),
  endsAt: new Date("2026-06-01T11:00:00Z"),
  seatsTotal: 30,
  seatsAvailable: 30,
  price: null as string | null,
  status: "DRAFT" as const,
  createdBy: "u-001",
  version: 1,
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

const openWorkshop = { ...baseWorkshop, status: "OPEN" as const };
const cancelledWorkshop = { ...baseWorkshop, status: "CANCELLED" as const };

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

const mockWorkshopRow = {
  workshops: baseWorkshop,
  speakers: mockSpeaker,
  rooms: mockRoom,
};

const mockOpenRow = {
  workshops: openWorkshop,
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
  let notificationPublisher: jest.Mocked<WorkshopNotificationPublisher>;
  let notificationLogProducer: jest.Mocked<NotificationLogProducer>;
  let aiSummariesRepo: jest.Mocked<AiSummariesRepository>;

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
            completePastOpen: jest.fn(),
            findOpenBasic: jest.fn(),
            decrementSeat: jest.fn(),
            incrementSeat: jest.fn(),
            getSeatVersion: jest.fn(),
            countConfirmedRegistrations: jest.fn(),
            countRegistrationsByStatus: jest.fn(),
            countCheckinsByWorkshopId: jest.fn(),
            sumPaidRevenueByWorkshop: jest.fn(),
          },
        },
        {
          provide: RoomConflictService,
          useValue: { checkConflict: jest.fn() },
        },
        {
          provide: SeatCounterService,
          useValue: {
            getCachedSeats: jest.fn(),
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
          provide: WorkshopNotificationPublisher,
          useValue: {
            publishEmergencyUpdate: jest.fn(),
            publishCancelled: jest.fn(),
          },
        },
        {
          provide: NotificationLogProducer,
          useValue: {
            createAndEnqueue: jest.fn(),
          },
        },
        {
          provide: AiSummariesRepository,
          useValue: {
            findByWorkshopId: jest.fn(),
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
    notificationPublisher = module.get(WorkshopNotificationPublisher);
    notificationLogProducer = module.get(NotificationLogProducer);
    aiSummariesRepo = module.get(AiSummariesRepository);
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
      speakerId: "s-001",
      roomId: "r-001",
      startsAt: new Date("2026-06-01T09:00:00Z"),
      endsAt: new Date("2026-06-01T11:00:00Z"),
      seatsTotal: 30,
      price: 0,
    };

    it("creates a workshop in DRAFT status with speaker and room (FR-F02-001)", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(
        Result.ok({ ...baseWorkshop, title: "New Workshop" })
      );
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe("w-001");
        expect(result.data.title).toBe("New Workshop");
        expect(result.data.status).toBe("DRAFT");
        expect(result.data.speaker?.fullName).toBe("John Doe");
        expect(result.data.room?.name).toBe("Room A");
      }
      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-001",
        createDto.startsAt,
        createDto.endsAt
      );
      expect(workshopsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Workshop",
          status: "DRAFT",
          seatsTotal: 30,
          seatsAvailable: 30,
          createdBy: "u-001",
        })
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

    it("handles missing speaker gracefully", async () => {
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      speakersRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("s-001"))
      );
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.createWorkshop(createDto, "u-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.speaker).toBeNull();
      }
    });

    it("passes price as string to repository", async () => {
      const paidDto = { ...createDto, price: 50 };
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.create.mockResolvedValue(
        Result.ok({ ...baseWorkshop, price: "50" })
      );
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.createWorkshop(paidDto, "u-001");

      expect(workshopsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: "50",
          seatsTotal: 30,
          seatsAvailable: 30,
        })
      );
    });

    it("skips room conflict check when no roomId provided", async () => {
      const noRoomDto = { ...createDto, roomId: undefined };
      workshopsRepo.create.mockResolvedValue(Result.ok(baseWorkshop));
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.createWorkshop(noRoomDto, "u-001");

      expect(result.isSuccess).toBe(true);
      expect(roomConflictService.checkConflict).not.toHaveBeenCalled();
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
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.updateWorkshop("w-001", updateDto, 1);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe("w-001");
        expect(result.data.title).toBe("Updated Title");
      }
      expect(workshopsRepo.update).toHaveBeenCalledWith(
        "w-001",
        {
          title: "Updated Title",
        },
        1
      );
    });

    it("fails when workshop is not DRAFT", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));

      const result = await service.updateWorkshop("w-001", updateDto, 1);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("re-checks room conflict when room/time changes", async () => {
      const dtoWithRoom = {
        roomId: "r-002",
        startsAt: new Date("2026-07-01T09:00:00Z"),
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(baseWorkshop));
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeaker));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.updateWorkshop("w-001", dtoWithRoom, 1);

      expect(result.isSuccess).toBe(true);
      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-002",
        dtoWithRoom.startsAt,
        baseWorkshop.endsAt,
        "w-001"
      );
    });

    it("fails on room conflict when updating (FR-F02-002)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      roomConflictService.checkConflict.mockResolvedValue(
        Result.fail(workshopErrors.roomConflict("r-002", "09:00", "11:00"))
      );

      const result = await service.updateWorkshop(
        "w-001",
        { roomId: "r-002" },
        1
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
    });

    it("fails on findById error", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateWorkshop("w-001", updateDto, 1);

      expect(result.isFailure).toBe(true);
    });

    it("fails on version mismatch (concurrent modification)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.update.mockResolvedValue(Result.ok(null));

      const result = await service.updateWorkshop("w-001", updateDto, 999);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("CONCURRENT_MODIFICATION");
    });
  });

  // ---------------------------------------------------------------------------
  // publishWorkshop
  // ---------------------------------------------------------------------------
  describe("publishWorkshop", () => {
    it("publishes a DRAFT workshop initializing Redis (FR-F02-003)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.updateStatus.mockResolvedValue(Result.ok(openWorkshop));
      seatCounterService.initialize.mockResolvedValue();
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.publishWorkshop("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("OPEN");
      }
      expect(workshopsRepo.updateStatus).toHaveBeenCalledWith("w-001", "OPEN");
      expect(seatCounterService.initialize).toHaveBeenCalledWith("w-001", 30);
    });

    it("fails when workshop is already OPEN", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));

      const result = await service.publishWorkshop("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_ALREADY_PUBLISHED");
    });

    it("fails with WORKSHOP_NOT_PUBLISHED for CANCELLED workshops", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockCancelledRow));

      const result = await service.publishWorkshop("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
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
    const emergencyDto = { roomId: "r-002" };

    it("updates scheduling fields on an OPEN workshop (FR-F02-005)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(openWorkshop));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.emergencyUpdate("w-001", emergencyDto, 1);

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.update).toHaveBeenCalledWith(
        "w-001",
        { roomId: "r-002" },
        1
      );
      expect(notificationPublisher.publishEmergencyUpdate).toHaveBeenCalled();
    });

    it("fails when workshop is not OPEN", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));

      const result = await service.emergencyUpdate("w-001", emergencyDto, 1);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("re-checks room conflict and excludes self", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(openWorkshop));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.emergencyUpdate("w-001", emergencyDto, 1);

      expect(roomConflictService.checkConflict).toHaveBeenCalledWith(
        "r-002",
        openWorkshop.startsAt,
        openWorkshop.endsAt,
        "w-001"
      );
    });

    it("fails on room conflict (FR-F02-002)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      roomConflictService.checkConflict.mockResolvedValue(
        Result.fail(workshopErrors.roomConflict("r-002", "09:00", "11:00"))
      );

      const result = await service.emergencyUpdate("w-001", emergencyDto, 1);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_TIME_CONFLICT");
    });

    it("publishes notification event for async dispatch (FR-F02-005)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(openWorkshop));
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.emergencyUpdate("w-001", emergencyDto, 1);

      expect(notificationPublisher.publishEmergencyUpdate).toHaveBeenCalledWith(
        openWorkshop,
        { roomId: "r-002" }
      );
    });

    it("fails on version mismatch (concurrent modification)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      roomConflictService.checkConflict.mockResolvedValue(Result.ok());
      workshopsRepo.update.mockResolvedValue(Result.ok(null));

      const result = await service.emergencyUpdate("w-001", emergencyDto, 999);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("CONCURRENT_MODIFICATION");
    });
  });

  // ---------------------------------------------------------------------------
  // cancelWorkshop
  // ---------------------------------------------------------------------------
  describe("cancelWorkshop", () => {
    it("cancels an OPEN workshop and deletes Redis seat key (FR-F02-004)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok(cancelledWorkshop)
      );
      seatCounterService.delete.mockResolvedValue();
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      const result = await service.cancelWorkshop("w-001", {
        reason: "Test cancellation reason for testing",
        notifyRegistered: true,
      });

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

      const result = await service.cancelWorkshop("w-001", {
        reason: "Test cancellation reason for testing",
        notifyRegistered: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_CANCELLED");
    });

    it("does not delete Redis seat counter for DRAFT workshops", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...baseWorkshop, status: "CANCELLED" })
      );
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.cancelWorkshop("w-001", {
        reason: "Test cancellation reason for testing",
        notifyRegistered: true,
      });

      expect(seatCounterService.delete).not.toHaveBeenCalled();
      expect(notificationPublisher.publishCancelled).toHaveBeenCalled();
    });

    it("creates notification log for workshop owner on cancel", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      workshopsRepo.updateStatus.mockResolvedValue(
        Result.ok(cancelledWorkshop)
      );
      seatCounterService.delete.mockResolvedValue();
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoom));

      await service.cancelWorkshop("w-001", {
        reason: "Test cancellation reason for testing",
        notifyRegistered: true,
      });

      expect(notificationLogProducer.createAndEnqueue).toHaveBeenCalledWith({
        userId: "u-001",
        workshopId: "w-001",
        type: "WORKSHOP_CANCELLED",
        payload: {
          workshopTitle: "Intro to Testing",
          originalStartsAt: expect.any(String),
          reason: "Test cancellation reason for testing",
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listPublished
  // ---------------------------------------------------------------------------
  describe("listPublished", () => {
    const query: any = {
      cursor: undefined,
      limit: 20,
      sort: "startsAt",
    };

    it("returns open workshops with seat counts (FR-F02-006)", async () => {
      workshopsRepo.findPublished.mockResolvedValue(
        Result.ok({
          items: [mockOpenRow],
          nextCursor: null,
          hasMore: false,
          limit: 20,
        })
      );
      seatCounterService.getCachedSeats.mockResolvedValue(25);

      const result = await service.listPublished(query);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.hasMore).toBe(false);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].id).toBe("w-001");
        expect(result.data.items[0].seatsAvailable).toBe(25);
        expect(result.data.items[0].status).toBe("OPEN");
      }
    });

    it("applies date filters from query", async () => {
      const filteredQuery: any = {
        cursor: undefined,
        limit: 10,
        day: "2026-06-01",
      };
      workshopsRepo.findPublished.mockResolvedValue(
        Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 10 })
      );

      const result = await service.listPublished(filteredQuery);

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.findPublished).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
          cursor: undefined,
          limit: 10,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getPublicDetail
  // ---------------------------------------------------------------------------
  describe("getPublicDetail", () => {
    it("returns detail for an open workshop with AI summary (FR-F02-007)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      seatCounterService.getCachedSeats.mockResolvedValue(25);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.ok({
          summaryId: "sum-001",
          documentId: "doc-001",
          workshopId: "w-001",
          status: "DONE",
          summaryText: "AI generated summary content",
          rawText: null,
          modelUsed: "deepseek-v4-pro",
          errorMessage: null,
          generatedAt: new Date("2026-05-16T10:00:00Z"),
          createdAt: new Date("2026-05-16T09:00:00Z"),
        })
      );

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe("w-001");
        expect(result.data.seatsAvailable).toBe(25);
        expect(result.data.speaker?.fullName).toBe("John Doe");
        expect(result.data.room?.name).toBe("Room A");
        expect(result.data.summary).not.toBeNull();
        expect(result.data.summary?.status).toBe("DONE");
        expect(result.data.summary?.text).toBe("AI generated summary content");
      }
      expect(aiSummariesRepo.findByWorkshopId).toHaveBeenCalledWith("w-001");
    });

    it("returns summary=null when no summary exists", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      seatCounterService.getCachedSeats.mockResolvedValue(25);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.summary).toBeNull();
      }
    });

    it("returns summary=null when repository fails", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      seatCounterService.getCachedSeats.mockResolvedValue(25);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as never)
      );

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.summary).toBeNull();
      }
    });

    it("fails when workshop is not OPEN", async () => {
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

    it("returns detail with speaker=null and room=null when not set", async () => {
      const rowWithoutRefs = {
        workshops: { ...openWorkshop, speakerId: null, roomId: null },
        speakers: null,
        rooms: null,
      };
      workshopsRepo.findById.mockResolvedValue(Result.ok(rowWithoutRefs));
      seatCounterService.getCachedSeats.mockResolvedValue(30);
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));

      const result = await service.getPublicDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe("w-001");
        expect(result.data.speaker).toBeNull();
        expect(result.data.room).toBeNull();
        expect(result.data.summary).toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getAdminDetail
  // ---------------------------------------------------------------------------
  describe("getAdminDetail", () => {
    it("returns admin detail with version info", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));

      const result = await service.getAdminDetail("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe("w-001");
        expect(result.data.status).toBe("DRAFT");
        expect(result.data.version).toBe(1);
        expect(result.data.createdBy).toBe("u-001");
      }
    });

    it("fails when workshop not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getAdminDetail("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // listAdmin
  // ---------------------------------------------------------------------------
  describe("listAdmin", () => {
    const query: any = {
      cursor: undefined,
      limit: 20,
    };

    it("returns paginated admin workshop list", async () => {
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.ok({
          items: [mockWorkshopRow],
          nextCursor: null,
          hasMore: false,
          limit: 20,
        })
      );

      const result = await service.listAdmin(query);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.hasMore).toBe(false);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].id).toBe("w-001");
      }
    });

    it("filters by status when provided", async () => {
      const filteredQuery: any = {
        status: "DRAFT",
        cursor: undefined,
        limit: 20,
      };
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 20 })
      );

      const result = await service.listAdmin(filteredQuery);

      expect(result.isSuccess).toBe(true);
      expect(workshopsRepo.listAdmin).toHaveBeenCalledWith({
        status: "DRAFT",
        cursor: undefined,
        limit: 20,
      });
    });

    it("proxies repository failure", async () => {
      workshopsRepo.listAdmin.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.listAdmin(query);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getAvailability
  // ---------------------------------------------------------------------------
  describe("getAvailability", () => {
    it("returns real-time seat availability", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      seatCounterService.getCachedSeats.mockResolvedValue(25);

      const result = await service.getAvailability("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshopId).toBe("w-001");
        expect(result.data.seatsAvailable).toBe(25);
        expect(result.data.asOf).toBeDefined();
      }
    });

    it("fails when workshop not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getAvailability("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------
  describe("getStats", () => {
    beforeEach(() => {
      workshopsRepo.countRegistrationsByStatus.mockResolvedValue(
        Result.ok({ CONFIRMED: 12 })
      );
      workshopsRepo.countCheckinsByWorkshopId.mockResolvedValue(Result.ok(0));
      workshopsRepo.sumPaidRevenueByWorkshop.mockResolvedValue(Result.ok(0));
    });

    it("returns stats with registrations.total from confirmed count", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));
      workshopsRepo.countConfirmedRegistrations.mockResolvedValue(
        Result.ok(12)
      );
      seatCounterService.getCachedSeats.mockResolvedValue(18);

      const result = await service.getStats("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.registrations.total).toBe(12);
        expect(result.data.registrations.byStatus).toEqual({ CONFIRMED: 12 });
        expect(result.data.checkins).toEqual({ total: 0, rate: 0 });
        expect(result.data.revenue).toEqual({ amount: 0, currency: "VND" });
      }
    });

    it("returns zero registrations when confirmed count is 0", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockWorkshopRow));
      workshopsRepo.countRegistrationsByStatus.mockResolvedValue(Result.ok({}));
      workshopsRepo.countConfirmedRegistrations.mockResolvedValue(Result.ok(0));
      seatCounterService.getCachedSeats.mockResolvedValue(0);

      const result = await service.getStats("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.registrations.total).toBe(0);
      }
    });

    it("fails when workshop not found", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail(workshopErrors.notFound("w-001"))
      );

      const result = await service.getStats("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // getPublishedById (cross-module)
  // ---------------------------------------------------------------------------
  describe("getPublishedById", () => {
    it("returns workshop entity when open (cross-module)", async () => {
      workshopsRepo.findById.mockResolvedValue(Result.ok(mockOpenRow));

      const result = await service.getPublishedById("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.workshopId).toBe("w-001");
        expect(result.data.status).toBe("OPEN");
      }
    });

    it("fails with WORKSHOP_NOT_PUBLISHED when status is not OPEN", async () => {
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
    it("completes past open workshops and returns count (FR-F10-005)", async () => {
      workshopsRepo.completePastOpen.mockResolvedValue(Result.ok(5));

      const result = await service.completePastWorkshops();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(5);
      }
    });

    it("returns 0 when no workshops to complete", async () => {
      workshopsRepo.completePastOpen.mockResolvedValue(Result.ok(0));

      const result = await service.completePastWorkshops();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(0);
      }
    });

    it("proxies repository failure", async () => {
      workshopsRepo.completePastOpen.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.completePastWorkshops();

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getPublishedWorkshopsBasic (cron helper)
  // ---------------------------------------------------------------------------
  describe("getPublishedWorkshopsBasic", () => {
    it("returns basic open workshop data", async () => {
      workshopsRepo.findOpenBasic.mockResolvedValue(
        Result.ok([
          { workshopId: "w-001", seatsTotal: 30 },
          { workshopId: "w-002", seatsTotal: 25 },
        ])
      );

      const result = await service.getPublishedWorkshopsBasic();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].workshopId).toBe("w-001");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Seat atomic operations (used by booking module)
  // ---------------------------------------------------------------------------
  describe("decrementSeat", () => {
    it("decrements seat count with optimistic locking", async () => {
      workshopsRepo.decrementSeat.mockResolvedValue(
        Result.ok({ rowsAffected: 1, newVersion: 2 })
      );

      const result = await service.decrementSeat("w-001", 1);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.rowsAffected).toBe(1);
        expect(result.data.newVersion).toBe(2);
      }
    });
  });

  describe("incrementSeat", () => {
    it("increments seat count", async () => {
      workshopsRepo.incrementSeat.mockResolvedValue(Result.ok());

      const result = await service.incrementSeat("w-001");

      expect(result.isSuccess).toBe(true);
    });
  });

  describe("getSeatVersion", () => {
    it("returns current version and seats available", async () => {
      workshopsRepo.getSeatVersion.mockResolvedValue(
        Result.ok({ version: 1, seatsAvailable: 30 })
      );

      const result = await service.getSeatVersion("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data?.version).toBe(1);
        expect(result.data?.seatsAvailable).toBe(30);
      }
    });
  });
});
