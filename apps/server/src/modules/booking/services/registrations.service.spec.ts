import { Test, type TestingModule } from "@nestjs/testing";

import type { Registration } from "@/database/types/transaction.types";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NotificationPublisher } from "@/shared/queues/notification-publisher";
import { registrationErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RegistrationsService } from "./registrations.service";
import { TicketsService } from "./tickets.service";
import { GlobalRateLimitMechanic } from "../mechanics/global-rate-limit.mechanic";
import { RateLimiterMechanic } from "../mechanics/rate-limiter.mechanic";
import { SeatLockMechanic } from "../mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "../repositories/registrations.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

describe("RegistrationsService", () => {
  let service: RegistrationsService;

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  let registrationsRepo: jest.Mocked<RegistrationsRepository>;
  let ticketsRepo: jest.Mocked<TicketsRepository>;
  let rateLimiter: jest.Mocked<RateLimiterMechanic>;
  let globalRateLimit: jest.Mocked<GlobalRateLimitMechanic>;
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
    registeredAt: new Date(),
    confirmedAt: new Date(),
    cancelledAt: null,
    cancellationReason: null,
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
          provide: TicketsRepository,
          useValue: {
            create: jest.fn(),
            updateStatusByRegistrationId: jest.fn(),
            findByRegistrationId: jest.fn(),
            updateQrToken: jest.fn(),
          },
        },
        {
          provide: RateLimiterMechanic,
          useValue: { consumeToken: jest.fn() },
        },
        {
          provide: GlobalRateLimitMechanic,
          useValue: { check: jest.fn() },
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
          provide: TicketsService,
          useValue: {
            signAndUpdateQrToken: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationPublisher,
          useValue: {
            fire: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
    registrationsRepo = module.get(RegistrationsRepository);
    ticketsRepo = module.get(TicketsRepository);
    rateLimiter = module.get(RateLimiterMechanic);
    globalRateLimit = module.get(GlobalRateLimitMechanic);
    seatLock = module.get(SeatLockMechanic);
    seatCounter = module.get(SeatCounterService);
    workshopsService = module.get(WorkshopsService);
  });

  describe("register", () => {
    const dto = { workshop_id: WORKSHOP_ID };

    function setupPassThrough() {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CONFIRMED" })
      );
      ticketsRepo.create.mockResolvedValue(Result.ok({} as any));
      ticketsRepo.findByRegistrationId.mockResolvedValue(
        Result.ok({ ticketId: "tkt-001" } as any)
      );
      ticketsRepo.updateQrToken.mockResolvedValue(Result.ok({} as any));
    }

    // FR-F04-003: free workshop → CONFIRMED
    it("should register for a free workshop and issue ticket immediately (FR-F04-003)", async () => {
      setupPassThrough();

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("CONFIRMED");
      }
      expect(seatCounter.decrement).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(ticketsRepo.create).toHaveBeenCalled();
    });

    // FR-F04-004: paid workshop → PENDING_PAYMENT + seat lock
    it("should register for a paid workshop with PENDING_PAYMENT and seat lock (FR-F04-004)", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING_PAYMENT" })
      );
      seatLock.acquire.mockResolvedValue(Result.ok(true));

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("PENDING_PAYMENT");
        expect(result.data.amount).toBe(50000);
        expect(result.data.payment_deadline).toBeDefined();
      }
      expect(seatLock.acquire).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID,
        STUDENT_ID,
        50000
      );
      // No ticket issued for paid workshops
      expect(ticketsRepo.create).not.toHaveBeenCalled();
    });

    // FR-F04-001: rate limited
    it("should fail when workshop is not found", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail(registrationErrors.notFound(WORKSHOP_ID))
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });

    it("should fail when global rate limit exceeded (FR-F04-001)", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(
        Result.fail({ code: "RATE_LIMIT_EXCEEDED" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should fail when per-user rate limit exceeded (FR-F04-001)", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(
        Result.fail({ code: "RATE_LIMIT_EXCEEDED" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should return SEAT_UNAVAILABLE with seat rollback when sold out", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(
        Result.fail({ code: "SEAT_UNAVAILABLE" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_UNAVAILABLE");
    });

    it("should return REGISTRATION_DUPLICATE with seat rollback (FR-F04-005)", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(mockRegistration)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_DUPLICATE");
      // Seat must be rolled back
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should return REGISTRATION_DUPLICATE when find returns failure with seat rollback", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should return CANCELLED with seat rollback when seat lock fails for paid workshop", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockPaidWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "PENDING_PAYMENT" })
      );
      seatLock.acquire.mockResolvedValue(
        Result.fail({ code: "SEAT_LOCK_EXPIRED" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
      // Compensation: registration cancelled, seat incremented
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CANCELLED"
      );
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should continue even when ticket creation fails (non-fatal)", async () => {
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockFreeWorkshop)
      );
      globalRateLimit.check.mockResolvedValue(Result.ok(true));
      rateLimiter.consumeToken.mockResolvedValue(Result.ok(true));
      seatCounter.decrement.mockResolvedValue(Result.ok());
      registrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
        Result.ok(null)
      );
      registrationsRepo.create.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CONFIRMED" })
      );
      ticketsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.register(STUDENT_ID, dto);

      // Ticket failure is non-fatal
      expect(result.isSuccess).toBe(true);
    });
  });

  describe("cancelRegistration", () => {
    const mockConfirmedRegistration: Registration = {
      registrationId: REGISTRATION_ID,
      studentId: STUDENT_ID,
      workshopId: WORKSHOP_ID,
      status: "CONFIRMED",
      registeredAt: new Date(),
      confirmedAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      updatedAt: new Date(),
    };

    const mockPendingPaymentRegistration: Registration = {
      ...mockConfirmedRegistration,
      status: "PENDING_PAYMENT",
      confirmedAt: null,
      cancellationReason: null,
    };

    function setupConfirmed() {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockConfirmedRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockConfirmedRegistration, status: "CANCELLED" })
      );
      ticketsRepo.updateStatusByRegistrationId.mockResolvedValue(Result.ok());
      seatCounter.increment.mockResolvedValue(1);
    }

    // FR-F04-005: cancel registration
    it("should cancel a CONFIRMED registration — release seat and void ticket (FR-F04-005)", async () => {
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
      expect(ticketsRepo.updateStatusByRegistrationId).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "VOID"
      );
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
    });

    it("should release seat lock when cancelling a PENDING_PAYMENT registration", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockPendingPaymentRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockPendingPaymentRegistration, status: "CANCELLED" })
      );
      ticketsRepo.updateStatusByRegistrationId.mockResolvedValue(Result.ok());
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

      // Confirm registration was not PENDING_PAYMENT, so no seatLock.release
      expect(seatLock.release).not.toHaveBeenCalled();
    });

    // FR-F04-005: IDOR
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

    // FR-F04-005: already cancelled
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

    it("should return failure when findById fails", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
    });

    it("should return failure when updateStatus fails", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok(mockConfirmedRegistration)
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
    });

    it("should return REGISTRATION_NOT_FOUND when registration is null (IDOR probe)", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.cancelRegistration(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
    });
  });

  describe("getMyRegistrations — FR-F04-006 (view history)", () => {
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
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].registration_id).toBe(REGISTRATION_ID);
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

    it("should return failure on DB error", async () => {
      registrationsRepo.findMyRegistrations.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
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
        expect(result.data.registration_id).toBe(REGISTRATION_ID);
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

    it("should return failure when findById fails", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getRegistrationDetail(
        STUDENT_ID,
        REGISTRATION_ID
      );

      expect(result.isFailure).toBe(true);
    });
  });
});
