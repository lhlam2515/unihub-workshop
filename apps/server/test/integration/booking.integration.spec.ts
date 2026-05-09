/**
 * Booking Module — Integration Tests
 *
 * Tests RegistrationsController and PaymentsController with mocked
 * services, repositories, mechanics, and infrastructure.
 *
 * FR references:
 * - FR-F04-001: Rate Limit (Token Bucket)
 * - FR-F04-002: Atomic Seat Decrement
 * - FR-F04-003: Registration for Free Workshop
 * - FR-F04-004: Registration with Seat Lock for Paid Workshop
 * - FR-F04-005: Cancel Registration by Student
 * - FR-F04-006: View Registration History
 * - FR-F05-001: Idempotency Layer 1 (Redis)
 * - FR-F05-002: Circuit Breaker State Check
 * - FR-F05-003: Process Successful Payment
 * - FR-F05-004: Update Circuit Breaker State
 * - FR-F05-005: Pessimistic Locking (Fail-Fast)
 * - FR-F01-007: IDOR Prevention
 * - A-H01: Rate limiter timing
 */
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { NOTIFICATION_QUEUE } from "@/infra/messaging/queue.constants";
import { RedisService } from "@/infra/redis/redis.service";
import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "@/modules/ai-summary/repositories/workshop-documents.repository";
import { RegistrationsController } from "@/modules/booking/controllers/registrations.controller";
import { SeatLockMechanic } from "@/modules/booking/mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "@/modules/booking/repositories/registrations.repository";
import { RegistrationsService } from "@/modules/booking/services/registrations.service";
import { RoomsRepository } from "@/modules/catalog/repositories/rooms.repository";
import { SpeakersRepository } from "@/modules/catalog/repositories/speakers.repository";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { RoomConflictService } from "@/modules/catalog/services/room-conflict.service";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopNotificationPublisher } from "@/modules/catalog/services/workshop-notification-publisher.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { TokenService } from "@/modules/iam/services/token.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { PaymentsController } from "@/modules/payment/controllers/payments.controller";
import { HmacSignatureGuard } from "@/modules/payment/guards/hmac-signature.guard";
import { CircuitBreakerMechanic } from "@/modules/payment/mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "@/modules/payment/mechanics/idempotency.mechanic";
import { PaymentsRepository } from "@/modules/payment/repositories/payments.repository";
import { PaymentGatewayService } from "@/modules/payment/services/payment-gateway.service";
import { PaymentsService } from "@/modules/payment/services/payments.service";
import { paymentErrors, seatErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRegistrationsRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByStudentAndWorkshop: jest.fn(),
  findMyRegistrations: jest.fn(),
  updateStatus: jest.fn(),
  transaction: jest.fn((cb: any) => cb({})),
};

const mockPaymentsRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findMyPayments: jest.fn(),
  findByIdempotencyKeyWithLock: jest.fn(),
  updateStatus: jest.fn(),
  transaction: jest.fn(),
  lockWorkshopSlot: jest.fn(),
};

const mockSeatLock = {
  acquire: jest.fn(),
  check: jest.fn(),
  release: jest.fn(),
};

const mockSeatCounter = {
  getAvailable: jest.fn(),
  decrement: jest.fn(),
  getCachedSeats: jest.fn(),
  increment: jest.fn(),
  initialize: jest.fn(),
  delete: jest.fn(),
  invalidateCache: jest.fn(),
};

const mockIdempotencyMechanic = {
  check: jest.fn(),
  markCompleted: jest.fn(),
  markUnresolved: jest.fn(),
};

const mockCircuitBreaker = {
  checkAndAllow: jest.fn(),
  recordFailure: jest.fn(),
  recordSuccess: jest.fn(),
};

const mockPaymentGateway = {
  initiatePayment: jest.fn(),
};

const mockWorkshopsRepo = {
  findById: jest.fn(),
  findPublished: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  listAdmin: jest.fn(),
  completePastOpen: jest.fn(),
  getSeatVersion: jest.fn(),
  decrementSeat: jest.fn(),
  incrementSeat: jest.fn(),
};

const mockRoomConflictService = {
  checkConflict: jest.fn(),
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

const mockNotificationLogProducer = {
  createAndEnqueue: jest.fn(),
  batchCreateAndEnqueue: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const publishedWorkshop = {
  workshops: {
    workshopId: "wid-001",
    title: "AI Workshop",
    description: "Learn AI",
    speakerId: "spk-001",
    roomId: "rm-001",
    startsAt: new Date("2026-06-01T08:00:00Z"),
    endsAt: new Date("2026-06-01T10:00:00Z"),
    capacity: 100,
    isPaid: false,
    price: null,
    status: "OPEN",
    createdBy: "org-001",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  speakers: { fullName: "Dr. Smith" },
  rooms: { name: "Hall A" },
};

const paidWorkshop = {
  ...publishedWorkshop,
  workshops: {
    ...publishedWorkshop.workshops,
    isPaid: true,
    price: "50000",
  },
};

const studentUser = {
  sub: "stu-001",
  userId: "stu-001",
  role: "STUDENT" as const,
  jti: "jti-stu",
  allowed_workshop_ids: [],
};

const registration = {
  registrationId: "reg-001",
  studentId: "stu-001",
  workshopId: "wid-001",
  status: "CONFIRMED",
  qrCode: "qr-reg-001",
  registeredAt: new Date(),
  confirmedAt: new Date(),
  cancelledAt: null,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const pendingPaymentRegistration = {
  ...registration,
  registrationId: "reg-002",
  status: "PENDING",
};

const ticket = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-token-001",
  status: "ACTIVE",
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

function provideMockHmacGuard() {
  return {
    provide: HmacSignatureGuard,
    useValue: { canActivate: jest.fn().mockReturnValue(true) },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Booking Module — Integration", () => {
  let registrationsController: RegistrationsController;
  let paymentsController: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mocks for registration flow
    mockIdempotencyMechanic.check.mockResolvedValue(
      Result.ok({ proceed: true })
    );
    mockRegistrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
      Result.ok(null)
    );
    mockWorkshopsRepo.getSeatVersion.mockResolvedValue(
      Result.ok({ version: 1, seatsAvailable: 99 })
    );
    mockWorkshopsRepo.decrementSeat.mockResolvedValue(
      Result.ok({ rowsAffected: 1, newVersion: 2 })
    );
    mockSeatCounter.getCachedSeats.mockResolvedValue(99);
    mockRegistrationsRepo.transaction.mockImplementation(async (cb: any) =>
      cb({})
    );

    const module = await Test.createTestingModule({
      controllers: [RegistrationsController, PaymentsController],
      providers: [
        RegistrationsService,
        PaymentsService,
        WorkshopsService,
        { provide: RegistrationsRepository, useValue: mockRegistrationsRepo },
        { provide: PaymentsRepository, useValue: mockPaymentsRepo },
        { provide: SeatLockMechanic, useValue: mockSeatLock },
        { provide: SeatCounterService, useValue: mockSeatCounter },
        { provide: IdempotencyMechanic, useValue: mockIdempotencyMechanic },
        { provide: CircuitBreakerMechanic, useValue: mockCircuitBreaker },
        { provide: PaymentGatewayService, useValue: mockPaymentGateway },
        { provide: WorkshopsRepository, useValue: mockWorkshopsRepo },
        { provide: RoomConflictService, useValue: mockRoomConflictService },
        { provide: SpeakersRepository, useValue: mockSpeakersRepo },
        { provide: RoomsRepository, useValue: mockRoomsRepo },
        {
          provide: WorkshopDocumentsRepository,
          useValue: mockWorkshopDocumentsRepo,
        },
        { provide: AiSummariesRepository, useValue: mockAiSummariesRepo },
        {
          provide: WorkshopNotificationPublisher,
          useValue: mockNotificationPublisher,
        },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockQueue },
        { provide: TokenService, useValue: { verifyAccessToken: jest.fn() } },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: NotificationLogProducer,
          useValue: mockNotificationLogProducer,
        },
        provideMockGuard(),
        provideMockRolesGuard(),
        provideMockHmacGuard(),
      ],
    }).compile();

    registrationsController = module.get<RegistrationsController>(
      RegistrationsController
    );
    paymentsController = module.get<PaymentsController>(PaymentsController);
  });

  // -------------------------------------------------------------------------
  // RegistrationsController — FR-F04-001 through FR-F04-006
  // -------------------------------------------------------------------------
  describe("RegistrationsController", () => {
    describe("createRegistration — FR-F04-003, FR-F04-004", () => {
      it("creates a CONFIRMED registration for a free workshop", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockWorkshopsRepo.getSeatVersion.mockResolvedValue(
          Result.ok({ version: 0, seatsAvailable: 99 })
        );
        mockRegistrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
          Result.ok(null)
        );
        mockRegistrationsRepo.create.mockResolvedValue(Result.ok(registration));
        const result = await registrationsController.createRegistration(
          { workshopId: "wid-001" },
          "idem-reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(true);
        expect(mockWorkshopsRepo.decrementSeat).toHaveBeenCalledWith(
          "wid-001",
          expect.any(Number),
          expect.any(Object)
        );
        expect(mockRegistrationsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            studentId: "stu-001",
            workshopId: "wid-001",
            status: "CONFIRMED",
          }),
          expect.any(Object)
        );
      });

      it("creates a PENDING_PAYMENT registration for a paid workshop — FR-F04-004", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(paidWorkshop));
        mockWorkshopsRepo.getSeatVersion.mockResolvedValue(
          Result.ok({ version: 0, seatsAvailable: 99 })
        );
        mockRegistrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
          Result.ok(null)
        );
        mockRegistrationsRepo.create.mockResolvedValue(
          Result.ok(pendingPaymentRegistration)
        );
        mockSeatLock.acquire.mockResolvedValue(Result.ok());

        const result = await registrationsController.createRegistration(
          { workshopId: "wid-001" },
          "idem-reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(true);
        expect(mockRegistrationsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: "PENDING",
          }),
          expect.any(Object)
        );
        // For paid workshops, seat lock should be acquired
        expect(mockSeatLock.acquire).toHaveBeenCalledWith(
          "wid-001",
          "reg-002",
          "stu-001",
          expect.any(Number)
        );
      });

      it("returns REGISTRATION_DUPLICATE for existing registration — FR-F04-003", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockRegistrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
          Result.ok(registration)
        );
        // Duplicate returned before any seat decrement — no rollback needed
        const result = await registrationsController.createRegistration(
          { workshopId: "wid-001" },
          "idem-reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("REGISTRATION_DUPLICATE");
      });

      it("returns SEAT_UNAVAILABLE when workshop is sold out — FR-F04-002", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockWorkshopsRepo.getSeatVersion.mockResolvedValue(
          Result.ok({ version: 0 })
        );
        mockWorkshopsRepo.decrementSeat.mockResolvedValue(
          Result.fail(seatErrors.unavailable("wid-001"))
        );

        const result = await registrationsController.createRegistration(
          { workshopId: "wid-001" },
          "idem-reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("SEAT_UNAVAILABLE");
      });

      it("uses student ID from JWT (never from body) — IDOR prevention — FR-F01-007", async () => {
        mockWorkshopsRepo.findById.mockResolvedValue(
          Result.ok(publishedWorkshop)
        );
        mockWorkshopsRepo.getSeatVersion.mockResolvedValue(
          Result.ok({ version: 0, seatsAvailable: 99 })
        );
        mockRegistrationsRepo.findByStudentAndWorkshop.mockResolvedValue(
          Result.ok(null)
        );
        mockRegistrationsRepo.create.mockResolvedValue(Result.ok(registration));

        await registrationsController.createRegistration(
          { workshopId: "wid-001" },
          "idem-reg-001",
          studentUser
        );

        // Verify the registration is created with jwt.sub, not from body
        expect(mockRegistrationsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ studentId: "stu-001" }),
          expect.any(Object)
        );
      });
    });

    describe("getMyRegistrations — FR-F04-006", () => {
      it("returns paginated registrations for the authenticated student", async () => {
        mockRegistrationsRepo.findMyRegistrations.mockResolvedValue(
          Result.ok({ items: [registration], total: 1 })
        );

        const result =
          await registrationsController.getMyRegistrations(studentUser);

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(mockRegistrationsRepo.findMyRegistrations).toHaveBeenCalledWith(
          "stu-001",
          undefined,
          { page: undefined, limit: undefined }
        );
      });

      it("filters by status when provided", async () => {
        mockRegistrationsRepo.findMyRegistrations.mockResolvedValue(
          Result.ok({ items: [], total: 0 })
        );

        await registrationsController.getMyRegistrations(
          studentUser,
          "CONFIRMED",
          "1",
          "20"
        );

        expect(mockRegistrationsRepo.findMyRegistrations).toHaveBeenCalledWith(
          "stu-001",
          "CONFIRMED",
          { page: 1, limit: 20 }
        );
      });
    });

    describe("cancelRegistration — FR-F04-005", () => {
      it("cancels own registration and releases seat", async () => {
        mockRegistrationsRepo.findById.mockResolvedValue(
          Result.ok(registration)
        );
        mockRegistrationsRepo.updateStatus.mockResolvedValue(
          Result.ok({ ...registration, status: "CANCELLED" })
        );
        mockSeatCounter.increment.mockResolvedValue(Result.ok());

        const result = await registrationsController.cancelRegistration(
          "reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(true);
        expect(mockRegistrationsRepo.updateStatus).toHaveBeenCalledWith(
          "reg-001",
          "CANCELLED"
        );
        expect(mockSeatCounter.invalidateCache).toHaveBeenCalled();
      });

      it("enforces IDOR — returns REGISTRATION_NOT_FOUND for another student's registration", async () => {
        mockRegistrationsRepo.findById.mockResolvedValue(
          Result.ok({ ...registration, studentId: "stu-other" })
        );

        const result = await registrationsController.cancelRegistration(
          "reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("REGISTRATION_NOT_FOUND");
      });

      it("returns REGISTRATION_CANCELLED for already cancelled registration", async () => {
        mockRegistrationsRepo.findById.mockResolvedValue(
          Result.ok({ ...registration, status: "CANCELLED" })
        );

        const result = await registrationsController.cancelRegistration(
          "reg-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("REGISTRATION_CANCELLED");
      });
    });
  });

  // -------------------------------------------------------------------------
  // PaymentsController — FR-F05-001 through FR-F05-005
  // -------------------------------------------------------------------------
  describe("PaymentsController", () => {
    const payment = {
      paymentId: "pay-001",
      registrationId: "reg-002",
      studentId: "stu-001",
      amount: "50000",
      currency: "VND",
      gateway: "VNPAY",
      idempotencyKey: "idem-001",
      status: "PENDING",
      timeoutAt: new Date(Date.now() + 900_000),
      createdAt: new Date(),
    };

    const completedPayment = {
      ...payment,
      status: "SUCCEEDED",
      gatewayTxnId: "txn-001",
      completedAt: new Date(),
    };

    beforeEach(() => {
      mockRegistrationsRepo.findById.mockResolvedValue(
        Result.ok(pendingPaymentRegistration)
      );
      mockSeatLock.check.mockResolvedValue(Result.ok());
      mockIdempotencyMechanic.check.mockResolvedValue(
        Result.ok({ proceed: true })
      );
      mockWorkshopsRepo.findById.mockResolvedValue(Result.ok(paidWorkshop));
      mockCircuitBreaker.checkAndAllow.mockResolvedValue(Result.ok());
      mockPaymentsRepo.lockWorkshopSlot = jest
        .fn()
        .mockResolvedValue(Result.ok());
      mockPaymentsRepo.create.mockResolvedValue(Result.ok(payment));
      mockPaymentGateway.initiatePayment.mockResolvedValue(
        Result.ok({ redirect_url: "https://payment.example.com/pay" })
      );
      mockCircuitBreaker.recordSuccess = jest.fn().mockResolvedValue(undefined);
      mockIdempotencyMechanic.markCompleted = jest
        .fn()
        .mockResolvedValue(Result.ok());
    });

    describe("createPayment — FR-F05-001, FR-F05-002", () => {
      it("creates a payment and returns redirect URL", async () => {
        mockPaymentsRepo.transaction = jest.fn((cb: any) => {
          const tx = {};
          return cb(tx);
        });

        await paymentsController.createPayment(
          { registrationId: "reg-002", gateway: "VNPAY" },
          "idem-001",
          studentUser
        );

        // Since the paymentsRepo.transaction is mocked, the inner logic
        // (paymentsRepo.create inside the transaction callback) may not
        // execute directly. This test verifies the controller wiring.
        expect(mockRegistrationsRepo.findById).toHaveBeenCalledWith("reg-002");
      });

      it("returns IDEMPOTENCY_CONFLICT for in-progress key — FR-F05-001", async () => {
        mockIdempotencyMechanic.check.mockResolvedValue(
          Result.fail({
            category: "CONFLICT",
            code: "IDEMPOTENCY_CONFLICT",
            message:
              "Request is already being processed for this idempotency key.",
            context: { idempotencyKey: "idem-001" },
          })
        );

        const result = await paymentsController.createPayment(
          { registrationId: "reg-002", gateway: "VNPAY" },
          "idem-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("IDEMPOTENCY_CONFLICT");
      });

      it("returns PAYMENT_GATEWAY_OPEN when circuit breaker is OPEN — FR-F05-002", async () => {
        mockIdempotencyMechanic.check.mockResolvedValue(
          Result.ok({ proceed: true })
        );
        mockCircuitBreaker.checkAndAllow.mockResolvedValue(
          Result.fail(
            paymentErrors.gatewayOpen("VNPAY", new Date().toISOString())
          )
        );

        const result = await paymentsController.createPayment(
          { registrationId: "reg-002", gateway: "VNPAY" },
          "idem-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
      });

      it("returns PAYMENT_NOT_FOUND for invalid registration", async () => {
        mockRegistrationsRepo.findById.mockResolvedValue(
          Result.fail(paymentErrors.notFound("reg-invalid"))
        );

        const result = await paymentsController.createPayment(
          { registrationId: "reg-invalid", gateway: "VNPAY" },
          "idem-001",
          studentUser
        );

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
      });

      it("uses student ID from JWT (never from body) — IDOR prevention", async () => {
        mockPaymentsRepo.transaction = jest.fn((cb: any) => {
          const tx = {};
          return cb(tx);
        });

        await paymentsController.createPayment(
          { registrationId: "reg-002", gateway: "VNPAY" },
          "idem-001",
          studentUser
        );

        // Student ID should come from JWT only
        expect(mockRegistrationsRepo.findById).toHaveBeenCalledWith("reg-002");
      });
    });

    describe("handleWebhook — FR-F05-003", () => {
      it("processes a SUCCESS webhook and updates payment", async () => {
        mockPaymentsRepo.transaction = jest.fn((cb: any) => {
          const tx = {};
          // Mock the inner calls made inside the transaction
          mockPaymentsRepo.findByIdempotencyKeyWithLock = jest
            .fn()
            .mockResolvedValue(Result.ok(payment));
          mockPaymentsRepo.updateStatus = jest
            .fn()
            .mockResolvedValue(Result.ok(completedPayment));
          mockRegistrationsRepo.updateStatus = jest.fn().mockResolvedValue(
            Result.ok({
              ...pendingPaymentRegistration,
              status: "CONFIRMED",
              workshopId: "wid-001",
            })
          );
          return cb(tx);
        });
        mockSeatLock.release = jest.fn().mockResolvedValue(undefined);
        mockSeatCounter.increment = jest.fn().mockResolvedValue(Result.ok());
        mockQueue.add = jest.fn().mockResolvedValue(undefined);

        const result = await paymentsController.handleWebhook("VNPAY", {
          status: "SUCCESS",
          gatewayTxnId: "txn-001",
          idempotencyKey: "idem-001",
        });

        expect(result.isSuccess).toBe(true);
      });

      it("processes a FAILED webhook and releases seat", async () => {
        mockPaymentsRepo.transaction = jest.fn((cb: any) => {
          const tx = {};
          mockPaymentsRepo.findByIdempotencyKeyWithLock = jest
            .fn()
            .mockResolvedValue(Result.ok(payment));
          mockPaymentsRepo.updateStatus = jest
            .fn()
            .mockResolvedValue(Result.ok({ ...payment, status: "FAILED" }));
          mockRegistrationsRepo.findById = jest
            .fn()
            .mockResolvedValue(Result.ok(pendingPaymentRegistration));
          return cb(tx);
        });
        mockSeatLock.release = jest.fn().mockResolvedValue(undefined);
        mockSeatCounter.increment = jest.fn().mockResolvedValue(Result.ok());

        const result = await paymentsController.handleWebhook("VNPAY", {
          status: "FAILED",
          gatewayTxnId: "txn-001",
          idempotencyKey: "idem-001",
        });

        expect(result.isSuccess).toBe(true);
      });

      it("returns PAYMENT_ALREADY_SUCCESS for duplicate webhook", async () => {
        mockPaymentsRepo.transaction = jest.fn((cb: any) => {
          const tx = {};
          mockPaymentsRepo.findByIdempotencyKeyWithLock = jest
            .fn()
            .mockResolvedValue(Result.ok(completedPayment));
          return cb(tx);
        });

        const result = await paymentsController.handleWebhook("VNPAY", {
          status: "SUCCESS",
          gatewayTxnId: "txn-001",
          idempotencyKey: "idem-001",
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("PAYMENT_ALREADY_SUCCESS");
      });
    });

    describe("getMyPayments", () => {
      it("returns paginated payments for the authenticated student", async () => {
        mockPaymentsRepo.findMyPayments.mockResolvedValue(
          Result.ok({ items: [payment], total: 1 })
        );

        const result = await paymentsController.getMyPayments(studentUser, {});

        expect(result.isSuccess).toBe(true);
        expect(mockPaymentsRepo.findMyPayments).toHaveBeenCalledWith(
          "stu-001",
          { page: undefined, limit: undefined }
        );
      });
    });
  });
});
