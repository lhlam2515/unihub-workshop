import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/shared/redis/redis.service";

import { CircuitBreakerMechanic } from "./circuit-breaker.mechanic";

describe("CircuitBreakerMechanic", () => {
  let mechanic: CircuitBreakerMechanic;
  let redisService: jest.Mocked<RedisService>;

  const GATEWAY = "MOCK";
  const key = `circuit:payment:${GATEWAY}`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerMechanic,
        {
          provide: RedisService,
          useValue: {
            hGetAll: jest.fn(),
            hSet: jest.fn(),
            hGet: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<CircuitBreakerMechanic>(CircuitBreakerMechanic);
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe("checkAndAllow — FR-F05-002 (circuit breaker)", () => {
    it("should allow request when state is CLOSED", async () => {
      redisService.hGetAll.mockResolvedValue({
        state: "CLOSED",
        failure_count: "0",
        opened_at: "",
        last_attempt: "",
      });

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "last_attempt",
        expect.any(String)
      );
    });

    it("should allow CLOSED when hash is empty (default to CLOSED)", async () => {
      redisService.hGetAll.mockResolvedValue({});

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
    });

    it("should reject with PAYMENT_GATEWAY_OPEN when state is OPEN and cooldown not expired", async () => {
      const openedAt = new Date(Date.now() - 5_000).toISOString(); // 5s ago, < 30s
      redisService.hGetAll.mockResolvedValue({
        state: "OPEN",
        failure_count: "5",
        opened_at: openedAt,
        last_attempt: "",
      });

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });

    it("should allow canary (HALF_OPEN) when OPEN + cooldown expired (≥30s)", async () => {
      const openedAt = new Date(Date.now() - 35_000).toISOString(); // 35s ago, >= 30s
      redisService.hGetAll.mockResolvedValue({
        state: "OPEN",
        failure_count: "5",
        opened_at: openedAt,
        last_attempt: "",
      });

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      // Should transition to HALF_OPEN
      expect(redisService.hSet).toHaveBeenCalledWith(key, "state", "HALF_OPEN");
    });

    it("should reject with PAYMENT_GATEWAY_OPEN when state is HALF_OPEN (only canary allowed)", async () => {
      redisService.hGetAll.mockResolvedValue({
        state: "HALF_OPEN",
        failure_count: "5",
        opened_at: new Date().toISOString(),
        last_attempt: "",
      });

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });
  });

  describe("recordSuccess — FR-F05-004 (state transition on success)", () => {
    it("should reset failure_count and stay in CLOSED when already CLOSED", async () => {
      redisService.hGet.mockResolvedValue("CLOSED");

      await mechanic.recordSuccess(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(key, "failure_count", "0");
      // Should NOT transition state
      const stateCalls = redisService.hSet.mock.calls.filter(
        (call) => call[1] === "state"
      );
      expect(stateCalls).toHaveLength(0);
    });

    it("should transition HALF_OPEN to CLOSED and reset count", async () => {
      redisService.hGet.mockResolvedValue("HALF_OPEN");

      await mechanic.recordSuccess(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(key, "state", "CLOSED");
      expect(redisService.hSet).toHaveBeenCalledWith(key, "failure_count", "0");
    });

    it("should handle null state gracefully", async () => {
      redisService.hGet.mockResolvedValue(null);

      await mechanic.recordSuccess(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(key, "failure_count", "0");
    });
  });

  describe("recordFailure — FR-F05-004, BR-025", () => {
    it("should transition HALF_OPEN back to OPEN on canary failure", async () => {
      redisService.hGet.mockResolvedValue("HALF_OPEN");
      // No further Redis reads needed for HALF_OPEN path

      await mechanic.recordFailure(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(key, "state", "OPEN");
      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "opened_at",
        expect.any(String)
      );
    });

    it("should transition to OPEN after 5 failures (CLOSED→OPEN)", async () => {
      redisService.hGet
        .mockResolvedValueOnce("CLOSED") // state
        .mockResolvedValueOnce("4") // failure_count
        .mockResolvedValueOnce(new Date(Date.now() - 10_000).toISOString()); // last_failure_at
      redisService.hSet.mockResolvedValue(1);

      await mechanic.recordFailure(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(key, "state", "OPEN");
      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "opened_at",
        expect.any(String)
      );
    });

    it("should increment failure_count without opening at 4 failures", async () => {
      redisService.hGet
        .mockResolvedValueOnce("CLOSED") // state
        .mockResolvedValueOnce("3") // failure_count
        .mockResolvedValueOnce(new Date(Date.now() - 10_000).toISOString()); // last_failure_at

      await mechanic.recordFailure(GATEWAY);

      // State should NOT change to OPEN
      const stateSetCalls = redisService.hSet.mock.calls.filter(
        (call) => call[1] === "state"
      );
      expect(stateSetCalls).toHaveLength(0);
    });

    it("should reset failure count after rolling window of 60s", async () => {
      redisService.hGet
        .mockResolvedValueOnce("CLOSED") // state
        .mockResolvedValueOnce("4") // failure_count from 70s ago
        .mockResolvedValueOnce(new Date(Date.now() - 70_000).toISOString()); // last_failure_at

      await mechanic.recordFailure(GATEWAY);

      // Rolling window reset: old 4 + 1 = 5 = OPEN. But since >60s elapsed,
      // currentCount resets to 0, then becomes 1. So NOT open.
      // newCount = 0 + 1 = 1 — no OPEN transition
      const stateSetCalls = redisService.hSet.mock.calls.filter(
        (call) => call[1] === "state"
      );
      expect(stateSetCalls).toHaveLength(0);
      expect(redisService.hSet).toHaveBeenCalledWith(key, "failure_count", "1");
    });

    it("should set last_failure_at timestamp on each failure", async () => {
      redisService.hGet
        .mockResolvedValueOnce("CLOSED") // state
        .mockResolvedValueOnce("0") // failure_count
        .mockResolvedValueOnce(null); // last_failure_at (null → no reset)

      await mechanic.recordFailure(GATEWAY);

      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "last_failure_at",
        expect.any(String)
      );
    });
  });
});
