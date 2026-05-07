import { Test, type TestingModule } from "@nestjs/testing";

import type { Payment } from "@/infra/database/types/transaction.types";
import { NotificationPublisher } from "@/infra/messaging/notification-publisher";
import { SeatLockMechanic } from "@/modules/booking/mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "@/modules/booking/repositories/registrations.repository";
import { TicketsRepository } from "@/modules/booking/repositories/tickets.repository";
import { TicketsService } from "@/modules/booking/services/tickets.service";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { PaymentGatewayService } from "./payment-gateway.service";
import { PaymentsService } from "./payments.service";
import { CircuitBreakerMechanic } from "../mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "../mechanics/idempotency.mechanic";
import { PaymentsRepository } from "../repositories/payments.repository";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let paymentsRepo: jest.Mocked<PaymentsRepository>;

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  let registrationsRepo: jest.Mocked<RegistrationsRepository>;
  let ticketsRepo: jest.Mocked<TicketsRepository>;
  let seatLock: jest.Mocked<SeatLockMechanic>;
  let idempotencyMechanic: jest.Mocked<IdempotencyMechanic>;
  let circuitBreaker: jest.Mocked<CircuitBreakerMechanic>;
  let paymentGatewayService: jest.Mocked<PaymentGatewayService>;
  let workshopsService: jest.Mocked<WorkshopsService>;
  let seatCounter: jest.Mocked<SeatCounterService>;
  let notificationPublisher: jest.Mocked<NotificationPublisher>;

  const STUDENT_ID = "stu-001";
  const WORKSHOP_ID = "ws-001";
  const REGISTRATION_ID = "reg-001";
  const PAYMENT_ID = "pay-001";
  const IDEMPOTENCY_KEY = "idem-001";
  const GATEWAY = "MOCK";
  const AMOUNT = 50000;

  const mockRegistration = {
    registrationId: REGISTRATION_ID,
    studentId: STUDENT_ID,
    workshopId: WORKSHOP_ID,
    status: "PENDING_PAYMENT",
    registeredAt: new Date(),
    confirmedAt: null,
    cancelledAt: null,
    updatedAt: new Date(),
  } as any;

  const mockPayment: Payment = {
    paymentId: PAYMENT_ID,
    registrationId: REGISTRATION_ID,
    studentId: STUDENT_ID,
    amount: String(AMOUNT),
    currency: "VND",
    gateway: GATEWAY,
    status: "PENDING",
    idempotencyKey: IDEMPOTENCY_KEY,
    gatewayTxnId: null,
    timeoutAt: new Date(Date.now() + 900_000),
    initiatedAt: new Date(),
    completedAt: null,
  };

  const mockWorkshop = {
    workshopId: WORKSHOP_ID,
    title: "Test Workshop",
    isPaid: true,
    status: "PUBLISHED",
    price: String(AMOUNT),
  } as any;

  const mockRegistrationUpdated = {
    ...mockRegistration,
    status: "CONFIRMED",
    confirmedAt: new Date(),
    workshopId: WORKSHOP_ID,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PaymentsRepository,
          useValue: {
            findById: jest.fn(),
            findByIdempotencyKeyWithLock: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
            findMyPayments: jest.fn(),
            findPendingOverdue: jest.fn(),
            lockWorkshopSlot: jest.fn(),
            transaction: jest.fn(),
          },
        },
        {
          provide: RegistrationsRepository,
          useValue: {
            findById: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: TicketsRepository,
          useValue: {
            create: jest.fn(),
            findByRegistrationId: jest.fn(),
            updateQrToken: jest.fn(),
          },
        },
        {
          provide: SeatLockMechanic,
          useValue: {
            check: jest.fn(),
            release: jest.fn(),
          },
        },
        {
          provide: IdempotencyMechanic,
          useValue: {
            check: jest.fn(),
            setPaymentId: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerMechanic,
          useValue: {
            checkAndAllow: jest.fn(),
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
          },
        },
        {
          provide: PaymentGatewayService,
          useValue: {
            initiatePayment: jest.fn(),
          },
        },
        {
          provide: WorkshopsService,
          useValue: {
            getPublishedById: jest.fn(),
          },
        },
        {
          provide: SeatCounterService,
          useValue: {
            increment: jest.fn(),
          },
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

    service = module.get<PaymentsService>(PaymentsService);
    paymentsRepo = module.get(PaymentsRepository);
    registrationsRepo = module.get(RegistrationsRepository);
    ticketsRepo = module.get(TicketsRepository);
    seatLock = module.get(SeatLockMechanic);
    idempotencyMechanic = module.get(IdempotencyMechanic);
    circuitBreaker = module.get(CircuitBreakerMechanic);
    paymentGatewayService = module.get(PaymentGatewayService);
    workshopsService = module.get(WorkshopsService);
    seatCounter = module.get(SeatCounterService);
    notificationPublisher = module.get(NotificationPublisher);
  });

  // ==================== initiate ====================
  describe("initiate — 5-stage pipeline (FR-F05-001, FR-F05-002, FR-F05-003)", () => {
    const dto = { registration_id: REGISTRATION_ID, gateway: GATEWAY as any };

    function setupInitiateSuccess() {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.ok({ valid: true, remainingSeconds: 500 })
      );
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockWorkshop)
      );
      circuitBreaker.checkAndAllow.mockResolvedValue(Result.ok(true));
      paymentsRepo.transaction.mockImplementation((cb: any) => cb({}));
      paymentsRepo.lockWorkshopSlot.mockResolvedValue(Result.ok());
      paymentsRepo.create.mockResolvedValue(Result.ok(mockPayment));
      paymentGatewayService.initiatePayment.mockResolvedValue(
        Result.ok({
          redirect_url: "https://mock-gateway.test/pay/abc",
          gateway_txn_id: "txn-001",
        })
      );
      circuitBreaker.recordSuccess.mockResolvedValue();
      idempotencyMechanic.setPaymentId.mockResolvedValue();
    }

    // FR-F05-001, FR-F05-002, FR-F05-003: full success path
    it("should run full 5-stage pipeline and return redirect URL", async () => {
      setupInitiateSuccess();

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.payment_id).toBe(PAYMENT_ID);
        expect(result.data.redirect_url).toBe(
          "https://mock-gateway.test/pay/abc"
        );
        expect(result.data.payment_deadline).toBeDefined();
      }
      // Verify pipeline stages
      expect(registrationsRepo.findById).toHaveBeenCalledWith(REGISTRATION_ID);
      expect(seatLock.check).toHaveBeenCalledWith(WORKSHOP_ID, REGISTRATION_ID);
      expect(idempotencyMechanic.check).toHaveBeenCalledWith(IDEMPOTENCY_KEY);
      expect(workshopsService.getPublishedById).toHaveBeenCalledWith(
        WORKSHOP_ID
      );
      expect(circuitBreaker.checkAndAllow).toHaveBeenCalledWith(GATEWAY);
      expect(paymentsRepo.transaction).toHaveBeenCalled();
      expect(paymentsRepo.lockWorkshopSlot).toHaveBeenCalled();
      expect(paymentsRepo.create).toHaveBeenCalled();
      expect(paymentGatewayService.initiatePayment).toHaveBeenCalledWith(
        GATEWAY,
        AMOUNT,
        { registration_id: REGISTRATION_ID }
      );
      // Post-gateway
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith(GATEWAY);
      expect(idempotencyMechanic.setPaymentId).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        PAYMENT_ID
      );
    });

    // FR-F05-001: idempotency duplicate
    it("should return PAYMENT_DUPLICATE on idempotency hit (FR-F05-001)", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.ok({ valid: true, remainingSeconds: 500 })
      );
      idempotencyMechanic.check.mockResolvedValue(
        Result.ok({ proceed: false, existingPaymentId: "existing-pay" })
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_DUPLICATE");
      expect(circuitBreaker.checkAndAllow).not.toHaveBeenCalled();
    });

    // FR-F05-002: circuit OPEN
    it("should return PAYMENT_GATEWAY_OPEN when circuit breaker rejects (FR-F05-002)", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.ok({ valid: true, remainingSeconds: 500 })
      );
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockWorkshop)
      );
      circuitBreaker.checkAndAllow.mockResolvedValue(
        Result.fail(
          paymentErrors.gatewayOpen(GATEWAY, new Date().toISOString())
        )
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });

    it("should return REGISTRATION_NOT_FOUND for missing registration", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return REGISTRATION_NOT_FOUND for non-owned registration (IDOR)", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockRegistration, studentId: "other-user" })
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return REGISTRATION_NOT_FOUND for non-PENDING_PAYMENT status", async () => {
      registrationsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockRegistration, status: "CONFIRMED" })
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return failure when seat lock expired", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.fail(paymentErrors.gatewayError("MOCK")) // just any fail
      );

      // Override to return seat-lock-like error
      seatLock.check.mockResolvedValue(
        Result.fail({ code: "SEAT_LOCK_EXPIRED" } as any)
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
    });

    it("should return failure when workshop lookup fails", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.ok({ valid: true, remainingSeconds: 500 })
      );
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));
      workshopsService.getPublishedById.mockResolvedValue(
        Result.fail({ code: "WORKSHOP_NOT_FOUND" } as any)
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WORKSHOP_NOT_FOUND");
    });

    // FR-F05-003: gateway failure
    it("should record circuit breaker failure when gateway call fails", async () => {
      setupInitiateSuccess();
      paymentGatewayService.initiatePayment.mockResolvedValue(
        Result.fail(paymentErrors.gatewayError(GATEWAY))
      );

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_ERROR");
      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith(GATEWAY);
    });

    it("should fail when DB transaction lock fails", async () => {
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.check.mockResolvedValue(
        Result.ok({ valid: true, remainingSeconds: 500 })
      );
      idempotencyMechanic.check.mockResolvedValue(Result.ok({ proceed: true }));
      workshopsService.getPublishedById.mockResolvedValue(
        Result.ok(mockWorkshop)
      );
      circuitBreaker.checkAndAllow.mockResolvedValue(Result.ok(true));
      paymentsRepo.transaction.mockRejectedValue(new Error("Lock timeout"));

      const result = await service.initiate(STUDENT_ID, dto, IDEMPOTENCY_KEY);

      expect(result.isFailure).toBe(true);
    });
  });

  // ==================== handleWebhook ====================
  describe("handleWebhook — FR-F05-003, BR-027", () => {
    const webhookDto = {
      status: "SUCCESS" as const,
      gateway_txn_id: "txn-001",
      idempotency_key: IDEMPOTENCY_KEY,
    };

    function setupWebhookSuccess() {
      paymentsRepo.transaction.mockImplementation((cb: any) =>
        cb({
          select: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          for: jest.fn().mockReturnThis(),
          limit: jest.fn(),
        } as any)
      );
      paymentsRepo.findByIdempotencyKeyWithLock.mockResolvedValue(
        Result.ok(mockPayment)
      );
      paymentsRepo.updateStatus.mockResolvedValue(
        Result.ok({
          ...mockPayment,
          status: "SUCCESS",
          completedAt: new Date(),
        })
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockRegistrationUpdated)
      );
      ticketsRepo.create.mockResolvedValue(
        Result.ok({ ticketId: "tkt-001" } as any)
      );
      ticketsRepo.findByRegistrationId.mockResolvedValue(
        Result.ok({
          ticketId: "tkt-001",
          registrationId: REGISTRATION_ID,
        } as any)
      );
      ticketsRepo.updateQrToken.mockResolvedValue(Result.ok({} as any));
      seatLock.release.mockResolvedValue(Result.ok(true));
      seatCounter.increment.mockResolvedValue(1);
    }

    it("should process SUCCESS webhook with ACID transaction (BR-027)", async () => {
      setupWebhookSuccess();

      const result = await service.handleWebhook(GATEWAY, webhookDto);

      expect(result.isSuccess).toBe(true);
      // Verify DB writes inside transaction
      expect(paymentsRepo.findByIdempotencyKeyWithLock).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        expect.anything()
      );
      expect(paymentsRepo.updateStatus).toHaveBeenCalledWith(
        PAYMENT_ID,
        "SUCCESS",
        "txn-001",
        expect.anything()
      );
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CONFIRMED",
        expect.anything()
      );
      expect(ticketsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: REGISTRATION_ID,
          status: "ACTIVE",
        }),
        expect.anything()
      );
      // Post-tx: Redis + event
      expect(seatLock.release).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID
      );
      expect(notificationPublisher.fire).toHaveBeenCalled();
    });

    it("should process FAILED webhook — payment FAILED, seat released, event fired", async () => {
      const failedDto = { ...webhookDto, status: "FAILED" as const };
      paymentsRepo.transaction.mockImplementation((cb: any) => cb({} as any));
      paymentsRepo.findByIdempotencyKeyWithLock.mockResolvedValue(
        Result.ok(mockPayment)
      );
      paymentsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockPayment, status: "FAILED", completedAt: new Date() })
      );
      // On failure path, registrationsRepo.findById is called (not updateStatus)
      registrationsRepo.findById.mockResolvedValue(Result.ok(mockRegistration));
      seatLock.release.mockResolvedValue(Result.ok(true));
      seatCounter.increment.mockResolvedValue(1);

      const result = await service.handleWebhook(GATEWAY, failedDto);

      expect(result.isSuccess).toBe(true);
      expect(paymentsRepo.updateStatus).toHaveBeenCalledWith(
        PAYMENT_ID,
        "FAILED",
        undefined,
        expect.anything()
      );
      // Post-tx: seat released AND counter incremented (failure path)
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(seatLock.release).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID
      );
      // event type should be payment.failed
      expect(notificationPublisher.fire).toHaveBeenCalledWith(
        "payment.failed",
        expect.objectContaining({ eventType: "payment.failed" })
      );
    });

    it("should return PAYMENT_ALREADY_SUCCESS for already processed payment", async () => {
      paymentsRepo.transaction.mockImplementation(() => {
        throw paymentErrors.alreadySuccess(PAYMENT_ID);
      });

      const result = await service.handleWebhook(GATEWAY, webhookDto);

      // The error is caught by tryCatch and re-wrapped with passthroughOrInternal
      // which preserves AppError codes
      expect(result.isFailure).toBe(true);
    });

    it("should return PAYMENT_NOT_FOUND when idempotency key has no payment", async () => {
      paymentsRepo.transaction.mockImplementation(() => {
        throw paymentErrors.notFound(IDEMPOTENCY_KEY);
      });

      const result = await service.handleWebhook(GATEWAY, webhookDto);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should not increment seat counter on SUCCESS webhook", async () => {
      setupWebhookSuccess();

      await service.handleWebhook(GATEWAY, webhookDto);

      // Seat counter only incremented on failure/timeout, not success
      expect(seatCounter.increment).not.toHaveBeenCalled();
    });

    it("should fire payment.success event after SUCCESS webhook", async () => {
      setupWebhookSuccess();

      await service.handleWebhook(GATEWAY, webhookDto);

      expect(notificationPublisher.fire).toHaveBeenCalledWith(
        "payment.success",
        expect.objectContaining({
          paymentId: PAYMENT_ID,
          registrationId: REGISTRATION_ID,
          eventType: "payment.success",
        })
      );
    });
  });

  // ==================== expirePayment ====================
  describe("expirePayment", () => {
    it("should expire a PENDING payment → TIMEOUT + CANCELLED + seat released", async () => {
      paymentsRepo.findById.mockResolvedValue(Result.ok(mockPayment));
      paymentsRepo.transaction.mockImplementation((cb: any) => cb({} as any));
      paymentsRepo.updateStatus.mockResolvedValue(
        Result.ok({
          ...mockPayment,
          status: "TIMEOUT",
          completedAt: new Date(),
        })
      );
      registrationsRepo.updateStatus.mockResolvedValue(
        Result.ok({
          ...mockRegistration,
          status: "CANCELLED",
          workshopId: WORKSHOP_ID,
        })
      );
      seatLock.release.mockResolvedValue(Result.ok(true));
      seatCounter.increment.mockResolvedValue(1);

      const result = await service.expirePayment(PAYMENT_ID);

      expect(result.isSuccess).toBe(true);
      expect(paymentsRepo.updateStatus).toHaveBeenCalledWith(
        PAYMENT_ID,
        "TIMEOUT",
        undefined,
        expect.anything()
      );
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith(
        REGISTRATION_ID,
        "CANCELLED",
        expect.anything()
      );
      // Post-tx
      expect(seatLock.release).toHaveBeenCalledWith(
        WORKSHOP_ID,
        REGISTRATION_ID
      );
      expect(seatCounter.increment).toHaveBeenCalledWith(WORKSHOP_ID);
      expect(notificationPublisher.fire).toHaveBeenCalledWith(
        "payment.failed",
        expect.objectContaining({ eventType: "payment.failed" })
      );
    });

    it("should return PAYMENT_NOT_FOUND for non-existent payment", async () => {
      paymentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.expirePayment("pay-999");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return PAYMENT_ALREADY_SUCCESS for a SUCCESS payment", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockPayment, status: "SUCCESS" })
      );

      const result = await service.expirePayment(PAYMENT_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_ALREADY_SUCCESS");
    });

    it("should return Ok (no-op) for already terminal payments (FAILED)", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockPayment, status: "FAILED" })
      );

      const result = await service.expirePayment(PAYMENT_ID);

      expect(result.isSuccess).toBe(true);
      // No transaction or side effects
      expect(paymentsRepo.transaction).not.toHaveBeenCalled();
      expect(seatLock.release).not.toHaveBeenCalled();
      expect(seatCounter.increment).not.toHaveBeenCalled();
    });

    it("should return Ok (no-op) for TIMEOUT payments", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockPayment, status: "TIMEOUT" })
      );

      const result = await service.expirePayment(PAYMENT_ID);

      expect(result.isSuccess).toBe(true);
      expect(paymentsRepo.transaction).not.toHaveBeenCalled();
    });

    it("should return failure when findById fails", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.expirePayment(PAYMENT_ID);

      expect(result.isFailure).toBe(true);
    });
  });

  // ==================== getMyPayments ====================
  describe("getMyPayments", () => {
    it("should return paginated payments", async () => {
      paymentsRepo.findMyPayments.mockResolvedValue(
        Result.ok({ items: [mockPayment], total: 1 })
      );

      const result = await service.getMyPayments(STUDENT_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.items[0].payment_id).toBe(PAYMENT_ID);
      }
    });

    it("should pass pagination params", async () => {
      paymentsRepo.findMyPayments.mockResolvedValue(
        Result.ok({ items: [], total: 0 })
      );

      await service.getMyPayments(STUDENT_ID, { page: 2, limit: 10 });

      expect(paymentsRepo.findMyPayments).toHaveBeenCalledWith(STUDENT_ID, {
        page: 2,
        limit: 10,
      });
    });

    it("should return failure on DB error", async () => {
      paymentsRepo.findMyPayments.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getMyPayments(STUDENT_ID);

      expect(result.isFailure).toBe(true);
    });
  });

  // ==================== getPaymentDetail ====================
  describe("getPaymentDetail (+ IDOR)", () => {
    it("should return payment detail when owned by student", async () => {
      paymentsRepo.findById.mockResolvedValue(Result.ok(mockPayment));

      const result = await service.getPaymentDetail(STUDENT_ID, PAYMENT_ID);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.payment_id).toBe(PAYMENT_ID);
      }
    });

    it("should return PAYMENT_NOT_FOUND for non-owned payment (IDOR)", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockPayment, studentId: "other-user" })
      );

      const result = await service.getPaymentDetail(STUDENT_ID, PAYMENT_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return PAYMENT_NOT_FOUND when payment does not exist", async () => {
      paymentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getPaymentDetail(STUDENT_ID, PAYMENT_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return failure when findById fails", async () => {
      paymentsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getPaymentDetail(STUDENT_ID, PAYMENT_ID);

      expect(result.isFailure).toBe(true);
    });
  });
});
