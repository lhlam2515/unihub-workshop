import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { CircuitBreakerMechanic } from "@/modules/payment/mechanics/circuit-breaker.mechanic";
import { PaymentsService } from "@/modules/payment/services/payments.service";
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
  let mockCircuitBreaker: any;

  beforeEach(async () => {
    mockPaymentsService = { countPending: jest.fn(), countOverdue: jest.fn() };
    mockWorkshopsService = {
      getPublishedWorkshopsBasic: jest.fn(),
      getPublishedById: jest.fn(),
    };
    mockRedisService = { get: jest.fn(), scanKeys: jest.fn() };
    mockCircuitBreaker = {
      getGatewayState: jest.fn(),
      reset: jest.fn(),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemMonitorService,
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: WorkshopsService, useValue: mockWorkshopsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CircuitBreakerMechanic, useValue: mockCircuitBreaker },
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
      expect(result.data.pendingCount).toBe(10);
      expect(result.data.timeoutCount).toBe(3);
      expect(result.data.jobStatus).toBe("IDLE");
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
          { workshopId: "w-001", seatsTotal: 30 },
          { workshopId: "w-002", seatsTotal: 50 },
        ])
      );

      // w-001: redis seat=28, published ok, 2 locks => expected=30-2=28, |28-28|=0
      // w-002: redis seat=45, published ok, 5 locks => expected=50-5=45, |45-45|=0
      mockRedisService.get
        .mockResolvedValueOnce("28")
        .mockResolvedValueOnce("45")
        .mockResolvedValueOnce(null); // cron:last_run:reconciliation

      mockWorkshopsService.getPublishedById
        .mockResolvedValueOnce(Result.ok({ workshopId: "w-001" }))
        .mockResolvedValueOnce(Result.ok({ workshopId: "w-002" }));

      mockRedisService.scanKeys
        .mockResolvedValueOnce(["lock:1", "lock:2"])
        .mockResolvedValueOnce([
          "lock:1",
          "lock:2",
          "lock:3",
          "lock:4",
          "lock:5",
        ]);

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.totalWorkshops).toBe(2);
      expect(result.data.discrepanciesFound).toBe(0);
    });

    it("detects discrepancies when Redis value deviates beyond threshold", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.ok([{ workshopId: "w-001", seatsTotal: 30 }])
      );

      // redis seat=0, published ok, 2 locks => expected=30-2=28, |0-28|=28 > 5
      mockRedisService.get
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce(null); // cron:last_run:reconciliation

      mockWorkshopsService.getPublishedById.mockResolvedValue(
        Result.ok({ workshopId: "w-001" })
      );

      mockRedisService.scanKeys.mockResolvedValueOnce(["lock:1", "lock:2"]);

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.totalWorkshops).toBe(1);
      expect(result.data.discrepanciesFound).toBe(1);
    });

    it("uses seatsTotal when Redis key is missing (null)", async () => {
      mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
        Result.ok([{ workshopId: "w-001", seatsTotal: 30 }])
      );

      // redis seat=null => fallback to seatsTotal=30, 0 locks => expected=30, diff=0
      mockRedisService.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null); // cron:last_run:reconciliation

      mockWorkshopsService.getPublishedById.mockResolvedValue(
        Result.ok({ workshopId: "w-001" })
      );

      mockRedisService.scanKeys.mockResolvedValueOnce([]);

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.totalWorkshops).toBe(1);
      expect(result.data.discrepanciesFound).toBe(0);
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
    it("returns CLOSED state for all gateways when circuit is healthy", async () => {
      mockCircuitBreaker.getGatewayState.mockReturnValue({
        state: "CLOSED",
        failureCount: 0,
        totalCount: 0,
        windowStart: 0,
        openedAt: 0,
        lastAttempt: 0,
        lastFailureAt: 0,
        halfOpenSuccessCount: 0,
      });

      const result = await service.getCircuitBreakerStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data[0].gateway).toBe("VNPAY");
      expect(result.data[0].state).toBe("CLOSED");
      expect(result.data[0].failureCount).toBe(0);
      expect(result.data[1].gateway).toBe("MOMO");
      expect(result.data[2].gateway).toBe("STRIPE");
    });

    it("returns OPEN state with recovery deadline when circuit is open", async () => {
      const openedAt = Date.now() - 15000; // 15 seconds ago
      mockCircuitBreaker.getGatewayState.mockImplementation(
        (gateway: string) => {
          if (gateway === "VNPAY") {
            return {
              state: "OPEN",
              failureCount: 5,
              totalCount: 5,
              windowStart: 0,
              openedAt,
              lastAttempt: openedAt,
              lastFailureAt: openedAt,
              halfOpenSuccessCount: 0,
            };
          }
          return {
            state: "CLOSED",
            failureCount: 0,
            totalCount: 0,
            windowStart: 0,
            openedAt: 0,
            lastAttempt: 0,
            lastFailureAt: 0,
            halfOpenSuccessCount: 0,
          };
        }
      );

      const result = await service.getCircuitBreakerStatus();

      expect(result.isSuccess).toBe(true);
      const vnpay = result.data.find((d) => d.gateway === "VNPAY")!;
      expect(vnpay.state).toBe("OPEN");
      expect(vnpay.failureCount).toBe(5);
      expect(vnpay.recoveryDeadline).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // resetCircuitBreaker
  // -----------------------------------------------------------------------
  describe("resetCircuitBreaker", () => {
    it("resets circuit breaker to CLOSED for a valid gateway", async () => {
      const result = await service.resetCircuitBreaker("VNPAY");

      expect(result.isSuccess).toBe(true);
      expect(result.data.state).toBe("CLOSED");
      expect(result.data.failureCount).toBe(0);
      expect(mockCircuitBreaker.reset).toHaveBeenCalledWith("VNPAY");
    });

    it("returns FailResult for unknown gateway", async () => {
      const result = await service.resetCircuitBreaker("UNKNOWN");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockCircuitBreaker.reset).not.toHaveBeenCalled();
    });
  });
});
