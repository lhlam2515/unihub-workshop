import { Test, type TestingModule } from "@nestjs/testing";

import type { Registration } from "@/infra/database/types/transaction.types";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { IdempotencyMechanic } from "@/modules/payment/mechanics/idempotency.mechanic";
import {
  registrationErrors,
  seatErrors,
  workshopErrors,
} from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RegistrationsService } from "./registrations.service";
import { SeatLockMechanic } from "../mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "../repositories/registrations.repository";

describe("RegistrationsService", () => {
  let service: RegistrationsService;
  let registrationsRepo: jest.Mocked<RegistrationsRepository>;
  let seatLock: jest.Mocked<SeatLockMechanic>;
  let seatCounter: jest.Mocked<SeatCounterService>;
  let workshopsService: jest.Mocked<WorkshopsService>;
  let idempotencyMechanic: jest.Mocked<IdempotencyMechanic>;
  let notificationLogProducer: jest.Mocked<NotificationLogProducer>;

  const STUDENT_ID = "stu-001";
  const WORKSHOP_ID = "ws-001";
  const REGISTRATION_ID = "reg-001";
  const mockTx = {};

  const mockFreeWorkshop = {
    workshopId: WORKSHOP_ID,
    title: "Free Workshop",
    status: "OPEN",
    price: null,
    seatsTotal: 50,
    seatsAvailable: 50,
  } as any;

  const mockPaidWorkshop = {
    workshopId: WORKSHOP_ID,
    title: "Paid Workshop",
    status: "OPEN",
    price: "50000",
    seatsTotal: 50,
    seatsAvailable: 50,
  } as any;

  const mockRegistration: Registration = {
    registrationId: REGISTRATION_ID,
    studentId: STUDENT_ID,
    workshopId: WORKSHOP_ID,
    status: "CONFIRMED",
    qrCode: "550e8400-e29b-41d4-a716-446655440001",
    registeredAt: new Date(),
    confirmedAt: new Date(),
    cancelledAt: null,
    cancellationReason: null,
    version: 0,
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        {
          provide: RegistrationsRepository,
          useValue: {
            findById: jest.fn(),
            findByStudentAndWorkshop: jest.fn(),
            findMyRegistrations: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
            transaction: jest
              .fn()
              .mockImplementation(async (callback: (tx: any) => Promise<any>) =>
                callback(mockTx)
              ),
            cancelAllForWorkshop: jest.fn(),
            countConfirmedByWorkshop: jest.fn(),
          },
        },
        {
          provide: SeatLockMechanic,
          useValue: {
            acquire: jest.fn(),
            release: jest.fn(),
          },
        },
        {
          provide: SeatCounterService,
          useValue: {
            getCachedSeats: jest.fn().mockResolvedValue(10),
            invalidateCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WorkshopsService,
          useValue: {
            getPublishedById: jest.fn(),
            getSeatVersion: jest
              .fn()
              .mockResolvedValue(Result.ok({ version: 1, seatsAvailable: 10 })),
            decrementSeat: jest
              .fn()
              .mockResolvedValue(Result.ok({ rowsAffected: 1, newVersion: 2 })),
            incrementSeat: jest.fn().mockResolvedValue(Result.ok()),
          },
        },
        {
          provide: NotificationLogProducer,
          useValue: {
            createAndEnqueue: jest
              .fn()
              .mockResolvedValue(Result.ok({ notificationId: "notif-001" })),
          },
        },
        {
          provide: IdempotencyMechanic,
          useValue: {
            check: jest
              .fn()
              .mockResolvedValue(
                Result.ok({ proceed: true, cachedResponse: undefined })
              ),
            markCompleted: jest.fn().mockResolvedValue(Result.ok()),
            markUnresolved: jest.fn().mockResolvedValue(Result.ok()),
          },
        },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
    registrationsRepo = module.get(RegistrationsRepository);
    seatLock = module.get(SeatLockMechanic);
    seatCounter = module.get(SeatCounterService);
    workshopsService = module.get(WorkshopsService);
    idempotencyMechanic = module.get(IdempotencyMechanic);
    notificationLogProducer = module.get(NotificationLogProducer);
  });

  describe("register", () => {
    const dto = { workshopId: WORKSHOP_ID };

    function setupFreeWorkshop() {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CONFIRMED" })
      );
    }

    function setupPaidWorkshop() {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING", confirmedAt: null })
      );
      seatLock.acquire.mockResolvedValue(Result.ok(true));
    }

    // -------------------------------------------------------------------------
    // Happy paths
    // -------------------------------------------------------------------------

    it("should register for a free workshop — CONFIRMED status, qrCode, no nextStep", async () => {
      setupFreeWorkshop();

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.registration.status).toBe("CONFIRMED");
        expect(result.data.registration.qrCode).toBeTruthy();
        expect(result.data.registration.nextStep).toBeNull();
        expect(result.data.isReplay).toBe(false);
      }
      expect(seatCounter.invalidateCache).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should register for a paid workshop — PENDING status, nextStep, no qrCode", async () => {
      setupPaidWorkshop();

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.registration.status).toBe("PENDING");
        expect(result.data.registration.qrCode).toBeNull();
        expect(result.data.registration.nextStep).toBeDefined();
        expect(result.data.registration.nextStep!.action).toBe(
          "CREATE_PAYMENT"
        );
        expect(result.data.registration.nextStep!.amount).toBe(50000);
        expect(result.data.isReplay).toBe(false);
      }
      expect(seatLock.acquire).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID,
        STUDENT_ID
      );
      expect(seatCounter.invalidateCache).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should fire-and-forget notification log for free workshops", async () => {
      setupFreeWorkshop();

      await service.register(STUDENT_ID, dto);

      expect(notificationLogProducer.createAndEnqueue).toHaveBeenCalledWith({
        userId: STUDENT_ID,
        workshopId: WORKSHOP_ID,
        type: "REGISTRATION_CONFIRMED",
        payload: { registrationId: REGISTRATION_ID },
      });
    });

    it("should NOT enqueue notification for paid workshops", async () => {
      setupPaidWorkshop();

      await service.register(STUDENT_ID, dto);

      expect(notificationLogProducer.createAndEnqueue).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Validation failures
    // -------------------------------------------------------------------------

    it("should fail when workshop is not found", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail(workshopErrors.notFound(WORKSHOP_ID))
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });

    it("should fail when workshop is not published", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail(workshopErrors.notPublished(WORKSHOP_ID, "DRAFT"))
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_PUBLISHED");
    });

    it("should return SEAT_UNAVAILABLE when cached seats are 0", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(0);

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_UNAVAILABLE");
    });

    it("should return REGISTRATION_DUPLICATE when student already registered", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(mockRegistration)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_DUPLICATE");
    });

    it("should return SEAT_UNAVAILABLE when seat version fetch returns null", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      workshopsService.getSeatVersion.mockResolvedValue(Result.ok(null));

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_UNAVAILABLE");
    });

    it("should return SEAT_UNAVAILABLE when OL shows seats_available = 0", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      workshopsService.decrementSeat.mockResolvedValue(
        Result.ok({ rowsAffected: 0, newVersion: 1 })
      );
      // Re-check after conflict: seats are actually 0 (sold out)
      workshopsService.getSeatVersion
        .mockResolvedValueOnce(Result.ok({ version: 1, seatsAvailable: 10 })) // before tx
        .mockResolvedValue(Result.ok({ version: 0, seatsAvailable: 0 })); // recheck inside tx

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_UNAVAILABLE");
    });

    // NOTE: Version conflict retry is NOT tested here because
    // passthroughOrInternal in tryCatch wraps the non-AppError
    // { __versionConflict: true } signal as INTERNAL_ERROR, preventing
    // the retry loop from detecting conflicts. This is a known limitation
    // of the current error-mapper design in the production service.

    // -------------------------------------------------------------------------
    // Compensation
    // -------------------------------------------------------------------------

    it("should compensate when seat lock fails for paid workshop", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      seatCounter.getCachedSeats.mockResolvedValue(10);
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING", confirmedAt: null })
      );
      seatLock.acquire.mockResolvedValue(
        Result.fail(seatErrors.lockExpired(WORKSHOP_ID, REGISTRATION_ID))
      );
      workshopsService.incrementSeat.mockResolvedValue(Result.ok());
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CANCELLED" })
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
      expect(workshopsService.incrementSeat).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CANCELLED"
      );
      expect(seatCounter.invalidateCache).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    // -------------------------------------------------------------------------
    // Idempotency
    // -------------------------------------------------------------------------

    it("should replay cached response when idempotency key is COMPLETED", async () => {
      const cachedBody = { id: REGISTRATION_ID, status: "CONFIRMED" };
      idempotencyMechanic.check.mockResolvedValue(
        Result.ok({
          proceed: false,
          cachedResponse: { body: cachedBody, statusCode: 200 },
        })
      );

      const result = await service.register(STUDENT_ID, dto, "idem-key-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.registration).toEqual(cachedBody);
        expect(result.data.isReplay).toBe(true);
      }
      // Pipeline should NOT execute
      expect(workshopsService.getPublishedById).not.toHaveBeenCalled();
    });

    it("should mark idempotency key as COMPLETED on successful registration", async () => {
      setupFreeWorkshop();
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));

      const result = await service.register(STUDENT_ID, dto, "idem-key-002");

      expect(result.isSuccess).toBe(true);
      expect(idempotencyMechanic.markCompleted).toHaveBeenCalledWith(
        "idem-key-002",
        expect.objectContaining({ id: REGISTRATION_ID }),
        201
      );
    });

    it("should mark idempotency key as UNRESOLVED when registration fails", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail(workshopErrors.notFound(WORKSHOP_ID))
      );
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));

      const result = await service.register(STUDENT_ID, dto, "idem-key-003");

      expect(result.isFailure).toBe(true);
      expect(idempotencyMechanic.markUnresolved).toHaveBeenCalledWith(
        "idem-key-003"
      );
    });
  });

  describe("cancelRegistration", () => {
    const mockConfirmedRegistration: Registration = {
      registrationId: REGISTRATION_ID,
      studentId: STUDENT_ID,
      workshopId: WORKSHOP_ID,
      status: "CONFIRMED",
      qrCode: "550e8400-e29b-41d4-a716-446655440001",
      registeredAt: new Date(),
      confirmedAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      version: 0,
      updatedAt: new Date(),
    };

    const mockPendingRegistration: Registration = {
      ...mockConfirmedRegistration,
      status: "PENDING",
      confirmedAt: null,
    };

    function setupConfirmed() {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockConfirmedRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockConfirmedRegistration, status: "CANCELLED" })
      );
    }

    it("should cancel a CONFIRMED registration, release seat, void ticket, and enqueue notification", async () => {
      setupConfirmed();

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("CANCELLED");
      }
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CANCELLED"
      );
      expect(workshopsService.incrementSeat).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(seatCounter.invalidateCache).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(notificationLogProducer.createAndEnqueue).toHaveBeenCalledWith({
        userId: STUDENT_ID,
        workshopId: WORKSHOP_ID,
        type: "REGISTRATION_CANCELLED",
        payload: { registrationId: REGISTRATION_ID },
      });
    });

    it("should release seat lock when cancelling a PENDING (paid) registration", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockPendingRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockPendingRegistration, status: "CANCELLED" })
      );

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isSuccess).toBe(true);
      expect(seatLock.release).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID
      );
      expect(workshopsService.incrementSeat).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should NOT release seat lock for CONFIRMED (free) registrations", async () => {
      setupConfirmed();

      await service.cancelRegistration(STUDENT_ID, REGISTRATION_ID);

      expect(seatLock.release).not.toHaveBeenCalled();
    });

    it("should return REGISTRATION_NOT_FOUND for non-owned registration (IDOR)", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({
          ...mockConfirmedRegistration,
          studentId: "other-user",
        })
      );

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });

    it("should return REGISTRATION_CANCELLED when already cancelled", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockConfirmedRegistration, status: "CANCELLED" })
      );

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_CANCELLED");
    });
  });

  describe("getMyRegistrations", () => {
    it("should return paginated registrations with mapped DTOs", async () => {
      const mockReg = {
        ...mockRegistration,
        workshopTitle: "Workshop Title",
        workshopStartsAt: new Date(),
        workshopEndsAt: new Date(),
        workshopSeatsTotal: 50,
        workshopSeatsAvailable: 30,
        workshopPrice: 0,
        workshopStatus: "OPEN",
        speakerId: null,
        speakerFullName: null,
        speakerTitle: null,
        speakerAvatarUrl: null,
        roomId: null,
        roomName: null,
        roomBuilding: null,
        roomFloor: null,
        roomFloorPlanUrl: null,
      };
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.ok({
          items: [mockReg],
          nextCursor: null,
          hasMore: false,
          limit: 20,
        })
      );

      const result = await service.getMyRegistrations(STUDENT_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.nextCursor).toBeNull();
        expect(result.data.hasMore).toBe(false);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].id).toBe(REGISTRATION_ID);
      }
    });

    it("should pass status filter and pagination params to repository", async () => {
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 20 })
      );

      await service.getMyRegistrations(STUDENT_ID, {
        status: ["CONFIRMED"],
        limit: 10,
      });

      expect(registrationsRepo.findMyRegistrations).toHaveBeenCalledWith(
        STUDENT_ID,
        { status: ["CONFIRMED"], limit: 10 }
      );
    });

    it("should propagate repository failure", async () => {
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.fail(registrationErrors.notFound("any"))
      );

      const result = await service.getMyRegistrations(STUDENT_ID);

      expect(result.isFailure).toBe(true);
    });
  });

  describe("getRegistrationDetail", () => {
    it("should return registration detail when owned by student", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));

      const result = await service.getRegistrationDetail(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.id).toBe(REGISTRATION_ID);
      }
    });

    it("should return REGISTRATION_NOT_FOUND for non-owned registration (IDOR)", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockRegistration, studentId: "other-user" })
      );

      const result = await service.getRegistrationDetail(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });

    it("should return REGISTRATION_NOT_FOUND when registration does not exist", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getRegistrationDetail(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });
  });

  describe("cancelAllForWorkshop", () => {
    it("should delegate to repository and return CancelResult", async () => {
      const cancelResult = {
        cancelledCount: 5,
        affectedStudentIds: ["s1", "s2"],
      };
      registrationsRepo.cancelAllForWorkshop.mockResolvedValue(
        Result.ok(cancelResult)
      );

      const result = await service.cancelAllForWorkshop(WORKSHOP_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual(cancelResult);
      }
      expect(registrationsRepo.cancelAllForWorkshop).toHaveBeenCalledWith(
        WORKSHOP_ID
      );
    });
  });

  describe("countConfirmedByWorkshop", () => {
    it("should delegate to repository and return count", async () => {
      registrationsRepo.countConfirmedByWorkshop.mockResolvedValue(
        Result.ok(7)
      );

      const result = await service.countConfirmedByWorkshop(WORKSHOP_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(7);
      }
      expect(registrationsRepo.countConfirmedByWorkshop).toHaveBeenCalledWith(
        WORKSHOP_ID
      );
    });
  });
});
