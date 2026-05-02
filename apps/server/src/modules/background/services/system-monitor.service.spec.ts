import { Test, type TestingModule } from "@nestjs/testing";

import { PaymentsService } from "@/modules/booking/services/payments.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { RedisService } from "@/shared/redis/redis.service";
import { Result } from "@/shared/response/result";

import { SystemMonitorService } from "./system-monitor.service";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SystemMonitorService", () => {
  let service: SystemMonitorService;
  let mockPaymentsService: any;
  let mockWorkshopsService: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockPaymentsService = { countPending: jest.fn(), countOverdue: jest.fn() };
    mockWorkshopsService = {
      getPublishedWorkshopsBasic: jest.fn(),
      getSlotByWorkshopId: jest.fn(),
    };
    mockRedisService = { get: jest.fn(), hGetAll: jest.fn(), hSet: jest.fn() };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemMonitorService,
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: WorkshopsService, useValue: mockWorkshopsService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SystemMonitorService>(SystemMonitorService);
  });

  // -----------------------------------------------------------------------
  // getPaymentTimeoutJobStatus
  // -----------------------------------------------------------------------
  describe("getPaymentTimeoutJobStatus", () => {
    it("returns payment timeout job status with counts", async () => {
      mockPaymentsService.countPending.mockResolvedValue(Result.ok(10));
      mockPaymentsService.countOverdue.mockResolvedValue(Result.ok(3));

      const result = await service.getPaymentTimeoutJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.pending_count).toBe(10);
      expect(result.data.timeout_count).toBe(3);
      expect(result.data.job_status).toBe("IDLE");
    });

    it("returns FailResult when payment query fails", async () => {
      mockPaymentsService.countPending.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.getPaymentTimeoutJobStatus();

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getReconciliationJobStatus
  // -----------------------------------------------------------------------
  describe("getReconciliationJobStatus", () => {
    it("returns reconciliation status with discrepancy count", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.ok([
          { workshopId: "w-001", capacity: 30 },
          { workshopId: "w-002", capacity: 50 },
        ])
      );

      // Slot queries — one per workshop
      // w-001: confirmed=10, locked=2 => expected = 30-10-2 = 18
      mockWorkshopsService.getSlotByWorkshopId
        .mockResolvedValueOnce(
          Result.ok({ confirmedCount: 10, lockedCount: 2 })
        )
        // w-002: confirmed=5, locked=3 => expected = 50-5-3 = 42
        .mockResolvedValueOnce(
          Result.ok({ confirmedCount: 5, lockedCount: 3 })
        );

      // Redis seat:available values match expected within threshold
      mockRedisService.get
        .mockResolvedValueOnce("18") // w-001: exact match
        .mockResolvedValueOnce("40"); // w-002: diff = |40-42| = 2 (below threshold 5)

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.total_workshops).toBe(2);
      expect(result.data.discrepancies_found).toBe(0);
    });

    it("detects discrepancies when Redis value deviates beyond threshold", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.ok([{ workshopId: "w-001", capacity: 30 }])
      );
      mockWorkshopsService.getSlotByWorkshopId.mockResolvedValue(
        Result.ok({ confirmedCount: 10, lockedCount: 2 })
      );

      // Redis says 0 but expected is 18 (diff = 18 > 5 threshold)
      mockRedisService.get.mockResolvedValueOnce("0");

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.total_workshops).toBe(1);
      expect(result.data.discrepancies_found).toBe(1);
    });

    it("uses capacity when Redis key is missing (null)", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.ok([{ workshopId: "w-001", capacity: 30 }])
      );
      mockWorkshopsService.getSlotByWorkshopId.mockResolvedValue(
        Result.ok({ confirmedCount: 0, lockedCount: 0 })
      );

      // Redis key doesn't exist → fall back to capacity (30)
      mockRedisService.get.mockResolvedValueOnce(null);

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.total_workshops).toBe(1);
      // expected = 30 - 0 - 0 = 30, redis = 30 (from capacity fallback), diff = 0
      expect(result.data.discrepancies_found).toBe(0);
    });

    it("returns FailResult when service returns failure", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "Service down",
        })
      );

      const result = await service.getReconciliationJobStatus();

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getCircuitBreakerStatus — FR-F10-003
  // -----------------------------------------------------------------------
  describe("getCircuitBreakerStatus — FR-F10-003", () => {
    it("returns CLOSED state for all gateways when Redis hash is empty", async () => {
      mockRedisService.hGetAll.mockResolvedValue({});

      const result = await service.getCircuitBreakerStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data[0].gateway).toBe("VNPAY");
      expect(result.data[0].state).toBe("CLOSED");
      expect(result.data[0].failure_count).toBe(0);
      expect(result.data[1].gateway).toBe("MOMO");
      expect(result.data[2].gateway).toBe("STRIPE");
    });

    it("returns OPEN state with recovery deadline when circuit is open", async () => {
      const openedAt = new Date(Date.now() - 15000); // 15 seconds ago
      mockRedisService.hGetAll.mockImplementation((key: string) => {
        if (key === "circuit:payment:VNPAY") {
          return Promise.resolve({
            state: "OPEN",
            failure_count: "5",
            opened_at: openedAt.toISOString(),
            last_attempt: openedAt.toISOString(),
          });
        }
        return Promise.resolve({});
      });

      const result = await service.getCircuitBreakerStatus();

      expect(result.isSuccess).toBe(true);
      const vnpay = result.data.find((d) => d.gateway === "VNPAY");
      expect(vnpay.state).toBe("OPEN");
      expect(vnpay.failure_count).toBe(5);
      expect(vnpay.recovery_deadline).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // resetCircuitBreaker
  // -----------------------------------------------------------------------
  describe("resetCircuitBreaker", () => {
    it("resets circuit breaker to CLOSED for a valid gateway", async () => {
      mockRedisService.hSet.mockResolvedValue(1);

      const result = await service.resetCircuitBreaker("VNPAY");

      expect(result.isSuccess).toBe(true);
      expect(result.data.state).toBe("CLOSED");
      expect(result.data.failure_count).toBe(0);
      expect(mockRedisService.hSet).toHaveBeenCalledTimes(4);
    });

    it("returns FailResult for unknown gateway", async () => {
      const result = await service.resetCircuitBreaker("UNKNOWN");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockRedisService.hSet).not.toHaveBeenCalled();
    });
  });
});
