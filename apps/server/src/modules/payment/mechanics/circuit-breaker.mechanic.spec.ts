import { Test, type TestingModule } from "@nestjs/testing";

import { CircuitBreakerMechanic } from "./circuit-breaker.mechanic";

describe("CircuitBreakerMechanic", () => {
  let mechanic: CircuitBreakerMechanic;
  const GATEWAY = "MOCK";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerMechanic],
    }).compile();

    mechanic = module.get<CircuitBreakerMechanic>(CircuitBreakerMechanic);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // checkAndAllow — FR-F05-002 (circuit breaker)
  // -----------------------------------------------------------------------
  describe("checkAndAllow — FR-F05-002 (circuit breaker)", () => {
    it("allows request when state is CLOSED", async () => {
      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
    });

    it("rejects with PAYMENT_GATEWAY_OPEN when state is OPEN and cooldown not expired", async () => {
      // 3 consecutive failures triggers OPEN via rate check (3/3=100% >= 50%)
      for (let i = 0; i < 3; i++) {
        await mechanic.recordFailure(GATEWAY);
      }

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });

    it("allows canary when OPEN + cooldown expired (>=30s) and transitions to HALF_OPEN", async () => {
      // Trigger OPEN via 3 consecutive failures (rate check)
      for (let i = 0; i < 3; i++) {
        await mechanic.recordFailure(GATEWAY);
      }

      const state = mechanic.getGatewayState(GATEWAY);
      // Advance time past 30s cooldown
      jest.spyOn(Date, "now").mockReturnValue(state.openedAt + 31_000);

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);

      // Should have transitioned to HALF_OPEN — subsequent call rejects
      jest.restoreAllMocks();
      const secondResult = await mechanic.checkAndAllow(GATEWAY);
      expect(secondResult.isFailure).toBe(true);
      expect(secondResult.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });

    it("rejects with PAYMENT_GATEWAY_OPEN when state is HALF_OPEN (only one canary allowed)", async () => {
      // Trigger OPEN → advance time → HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await mechanic.recordFailure(GATEWAY);
      }
      const state = mechanic.getGatewayState(GATEWAY);
      jest.spyOn(Date, "now").mockReturnValue(state.openedAt + 31_000);
      await mechanic.checkAndAllow(GATEWAY); // Transitions to HALF_OPEN
      jest.restoreAllMocks();

      const result = await mechanic.checkAndAllow(GATEWAY);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_OPEN");
    });
  });

  // -----------------------------------------------------------------------
  // recordSuccess — FR-F05-004 (state transition on success)
  // -----------------------------------------------------------------------
  describe("recordSuccess — FR-F05-004 (state transition on success)", () => {
    it("resets failureCount and stays in CLOSED when already CLOSED", async () => {
      // 2 failures keeps totalCount=2 (<3, rate check not applicable)
      await mechanic.recordFailure(GATEWAY);
      await mechanic.recordFailure(GATEWAY);

      let state = mechanic.getGatewayState(GATEWAY);
      expect(state.failureCount).toBe(2);

      await mechanic.recordSuccess(GATEWAY);

      state = mechanic.getGatewayState(GATEWAY);
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe("CLOSED");
    });

    it("transitions HALF_OPEN to CLOSED after 2 successful canaries", async () => {
      // Trigger OPEN → HALF_OPEN via cooldown
      for (let i = 0; i < 3; i++) {
        await mechanic.recordFailure(GATEWAY);
      }
      const state = mechanic.getGatewayState(GATEWAY);
      jest.spyOn(Date, "now").mockReturnValue(state.openedAt + 31_000);
      await mechanic.checkAndAllow(GATEWAY); // Now HALF_OPEN
      jest.restoreAllMocks();

      // 1st success: still HALF_OPEN, halfOpenSuccessCount=1
      await mechanic.recordSuccess(GATEWAY);
      let current = mechanic.getGatewayState(GATEWAY);
      expect(current.state).toBe("HALF_OPEN");
      expect(current.halfOpenSuccessCount).toBe(1);

      // 2nd success: CLOSED
      await mechanic.recordSuccess(GATEWAY);
      current = mechanic.getGatewayState(GATEWAY);
      expect(current.state).toBe("CLOSED");
      expect(current.failureCount).toBe(0);
    });

    it("handles default CLOSED state for unknown gateway", async () => {
      await mechanic.recordSuccess("UNKNOWN_GATEWAY");
      const state = mechanic.getGatewayState("UNKNOWN_GATEWAY");
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe("CLOSED");
    });
  });

  // -----------------------------------------------------------------------
  // recordFailure — FR-F05-004, BR-025
  // -----------------------------------------------------------------------
  describe("recordFailure — FR-F05-004, BR-025", () => {
    it("transitions HALF_OPEN back to OPEN on canary failure", async () => {
      // Trigger OPEN → HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await mechanic.recordFailure(GATEWAY);
      }
      const state = mechanic.getGatewayState(GATEWAY);
      jest.spyOn(Date, "now").mockReturnValue(state.openedAt + 31_000);
      await mechanic.checkAndAllow(GATEWAY); // Now HALF_OPEN
      jest.restoreAllMocks();

      // Canary fails → back to OPEN
      await mechanic.recordFailure(GATEWAY);
      const current = mechanic.getGatewayState(GATEWAY);
      expect(current.state).toBe("OPEN");
      expect(current.halfOpenSuccessCount).toBe(0);
    });

    it("transitions CLOSED to OPEN after 5 failures (hard threshold)", async () => {
      // Pre-load successes to keep failure rate below 50%,
      // otherwise rate check (>=50% with total>=3) opens earlier.
      for (let i = 0; i < 6; i++) {
        await mechanic.recordSuccess(GATEWAY);
      }

      for (let i = 0; i < 4; i++) {
        await mechanic.recordFailure(GATEWAY);
      }

      let state = mechanic.getGatewayState(GATEWAY);
      expect(state.state).toBe("CLOSED");
      expect(state.failureCount).toBe(4);

      // 5th failure triggers the hard threshold (failureCount >= 5)
      await mechanic.recordFailure(GATEWAY);
      state = mechanic.getGatewayState(GATEWAY);
      expect(state.state).toBe("OPEN");
      expect(state.failureCount).toBe(5);
    });

    it("increments failureCount without opening at 4 failures", async () => {
      // Pre-load successes to keep rate below 50%
      for (let i = 0; i < 6; i++) {
        await mechanic.recordSuccess(GATEWAY);
      }

      for (let i = 0; i < 4; i++) {
        await mechanic.recordFailure(GATEWAY);
      }

      const state = mechanic.getGatewayState(GATEWAY);
      expect(state.state).toBe("CLOSED");
      expect(state.failureCount).toBe(4);
    });

    it("resets failure count after rolling window of 60s", async () => {
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      // Pre-load successes so 4 failures stay below rate threshold
      for (let i = 0; i < 6; i++) {
        await mechanic.recordSuccess(GATEWAY);
      }

      await mechanic.recordFailure(GATEWAY);
      await mechanic.recordFailure(GATEWAY);
      await mechanic.recordFailure(GATEWAY);
      await mechanic.recordFailure(GATEWAY);

      let state = mechanic.getGatewayState(GATEWAY);
      expect(state.failureCount).toBe(4);
      expect(state.state).toBe("CLOSED");

      // Advance past 60s window — next failure resets counters
      jest.spyOn(Date, "now").mockReturnValue(now + 61_000);
      await mechanic.recordFailure(GATEWAY);
      jest.restoreAllMocks();

      state = mechanic.getGatewayState(GATEWAY);
      // failureCount reset to 0 then incremented to 1 — not enough to open
      expect(state.failureCount).toBe(1);
      expect(state.totalCount).toBe(1);
      expect(state.state).toBe("CLOSED");
    });
  });
});
