import { Test, type TestingModule } from "@nestjs/testing";

import type { Registration } from "@/infra/database/types/transaction.types";
import { NotificationPublisher } from "@/infra/messaging/notification-publisher";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { IdempotencyMechanic } from "@/modules/payment/mechanics/idempotency.mechanic";
import { registrationErrors } from "@/shared/response/errors";
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

  const STUDENT_ID = "stu-001";
  const WORKSHOP_ID = "ws-001";
  const REGISTRATION_ID = "reg-001";

  const mockFreeWorkshop = {
    workshopId: WORKSHOP_ID,
    title: "Free Workshop",
    isPaid: false,
    status: "PUBLISHED",
    price: null,
  } as any;

  const mockPaidWorkshop = {
    workshopId: WORKSHOP_ID,
    title: "Paid Workshop",
    isPaid: true,
    status: "PUBLISHED",
    price: "50000",
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
          },
        },
        {
          provide: SeatLockMechanic,
          useValue: { acquire: jest.fn(), release: jest.fn() },
        },
        {
          provide: SeatCounterService,
          useValue: { decrement: jest.fn(), increment: jest.fn() },
        },
        {
          provide: WorkshopsService,
          useValue: { getPublishedById: jest.fn() },
        },
        {
          provide: NotificationPublisher,
          useValue: { fire: jest.fn() },
        },
        {
          provide: IdempotencyMechanic,
          useValue: {
            check: jest
              .fn()
              .mockResolvedValue(
                Result.ok({ proceed: true, cachedResponse: null })
              ),
            markCompleted: jest.fn().mockResolvedValue(undefined),
            markUnresolved: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
    registrationsRepo = module.get(RegistrationsRepository);
    seatLock = module.get(SeatLockMechanic);
    seatCounter = module.get(SeatCounterService);
    workshopsService = module.get(WorkshopsService);
  });

  describe("register", () => {
    const dto = { workshop_id: WORKSHOP_ID };

    function setupFreeWorkshop() {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CONFIRMED" })
      );
    }

    it("should register for a free workshop with CONFIRMED status and qrCode", async () => {
      setupFreeWorkshop();

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("CONFIRMED");
        expect(result.data.qrCode).toBeTruthy();
        expect(result.data.nextStep).toBeNull();
      }
      expect(seatCounter.decrement).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should register for a paid workshop with PENDING status and nextStep", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING" })
      );
      seatLock.acquire.mockResolvedValue(Result.ok(true));

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("PENDING");
        expect(result.data.qrCode).toBeNull();
        expect(result.data.nextStep).toBeDefined();
        expect(result.data.nextStep!.action).toBe("CREATE_PAYMENT");
        expect(result.data.nextStep!.amount).toBe(50000);
      }
      expect(seatLock.acquire).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID,
        STUDENT_ID,
        50000
      );
    });

    it("should fail when workshop is not found", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail(registrationErrors.notFound(WORKSHOP_ID))
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });

    it("should return SEAT_UNAVAILABLE with seat rollback when sold out", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.decrement.mockResolvedValue(
        Result.fail({ code: "SEAT_UNAVAILABLE" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_UNAVAILABLE");
    });

    it("should return REGISTRATION_DUPLICATE with seat rollback", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(mockRegistration)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_DUPLICATE");
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should return SEAT_LOCK_EXPIRED with compensation when seat lock fails for paid workshop", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING" })
      );
      seatLock.acquire.mockResolvedValue(
        Result.fail({ code: "SEAT_LOCK_EXPIRED" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CANCELLED"
      );
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
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
      seatCounter.increment.mockResolvedValue(1);
    }

    it("should cancel a CONFIRMED registration — release seat, no ticket voiding", async () => {
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
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should release seat lock when cancelling a PENDING (paid) registration", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockPendingRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockPendingRegistration, status: "CANCELLED" })
      );
      seatCounter.increment.mockResolvedValue(1);

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isSuccess).toBe(true);
      expect(seatLock.release).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID
      );
    });

    it("should not release seat lock for CONFIRMED (free) registrations", async () => {
      setupConfirmed();

      await service.cancelRegistration(STUDENT_ID, REGISTRATION_ID);

      expect(seatLock.release).not.toHaveBeenCalled();
    });

    it("should return REGISTRATION_NOT_FOUND for non-owned registration (IDOR)", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockConfirmedRegistration, studentId: "other-user" })
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
        workshop_title: "Workshop Title",
      };
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.ok({ items: [mockReg], total: 1 })
      );

      const result = await service.getMyRegistrations(STUDENT_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(result.data.items[0].id).toBe(REGISTRATION_ID);
      }
    });

    it("should pass status filter and pagination", async () => {
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], total: 0 })
      );

      await service.getMyRegistrations(STUDENT_ID, {
        status: "CONFIRMED",
        page: 2,
        limit: 10,
      });

      expect(registrationsRepo.findMyRegistrations).toHaveBeenCalledWith(
        STUDENT_ID,
        "CONFIRMED",
        { page: 2, limit: 10 }
      );
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
  });
});
