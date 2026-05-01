import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { RedisService } from "@/shared/redis/redis.service";
import { SystemMonitorService } from "./system-monitor.service";

// ---------------------------------------------------------------------------
// Factory: creates a chainable that resolves to a given value when awaited
// ---------------------------------------------------------------------------

function chainableResolving(resolveValue: unknown) {
  const chain: any = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: (resolve: any) => resolve(resolveValue),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const mockSchema: any = {
  payments: { status: "status", timeoutAt: "timeoutAt" },
  workshops: {
    workshopId: "workshopId",
    capacity: "capacity",
    status: "status",
  },
  workshopSlots: { workshopId: "workshopId" },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SystemMonitorService", () => {
  let service: SystemMonitorService;
  let mockDb: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockDb = { select: jest.fn() };
    mockRedisService = { get: jest.fn(), hGetAll: jest.fn(), hSet: jest.fn() };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemMonitorService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
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
      mockDb.select
        .mockReturnValueOnce(chainableResolving([{ count: 10 }]))
        .mockReturnValueOnce(chainableResolving([{ count: 3 }]));

      const result = await service.getPaymentTimeoutJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.pending_count).toBe(10);
      expect(result.data.timeout_count).toBe(3);
      expect(result.data.job_status).toBe("IDLE");
    });

    it("returns FailResult when DB query throws", async () => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: (_resolve: any, reject: any) => reject(new Error("DB down")),
      };
      mockDb.select.mockReturnValueOnce(chain);

      const result = await service.getPaymentTimeoutJobStatus();

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getReconciliationJobStatus
  // -----------------------------------------------------------------------
  describe("getReconciliationJobStatus", () => {
    it("returns reconciliation status with discrepancy count", async () => {
      // Call 1: workshop select — returns 2 workshops
      mockDb.select.mockReturnValueOnce(
        chainableResolving([
          { workshopId: "w-001", capacity: 30 },
          { workshopId: "w-002", capacity: 50 },
        ])
      );

      // Call 2 + 3: slot queries in the loop (one per workshop)
      // w-001: confirmed=10, locked=2 => expected = 30-10-2 = 18
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ confirmedCount: 10, lockedCount: 2 }])
      );
      // w-002: confirmed=5, locked=3 => expected = 50-5-3 = 42
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ confirmedCount: 5, lockedCount: 3 }])
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
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ workshopId: "w-001", capacity: 30 }])
      );
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ confirmedCount: 10, lockedCount: 2 }])
      );

      // Redis says 0 but expected is 18 (diff = 18 > 5 threshold)
      mockRedisService.get.mockResolvedValueOnce("0");

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.total_workshops).toBe(1);
      expect(result.data.discrepancies_found).toBe(1);
    });

    it("uses capacity when Redis key is missing (null)", async () => {
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ workshopId: "w-001", capacity: 30 }])
      );
      mockDb.select.mockReturnValueOnce(
        chainableResolving([{ confirmedCount: 0, lockedCount: 0 }])
      );

      // Redis key doesn't exist → fall back to capacity (30)
      mockRedisService.get.mockResolvedValueOnce(null);

      const result = await service.getReconciliationJobStatus();

      expect(result.isSuccess).toBe(true);
      expect(result.data.total_workshops).toBe(1);
      // expected = 30 - 0 - 0 = 30, redis = 30 (from capacity fallback), diff = 0
      expect(result.data.discrepancies_found).toBe(0);
    });

    it("returns FailResult when DB query throws", async () => {
      const rejectChain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (_resolve: any, reject: any) => reject(new Error("DB down")),
      };
      mockDb.select.mockReturnValueOnce(rejectChain);

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
