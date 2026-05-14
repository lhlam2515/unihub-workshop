import { AiSummaryResponseBuilder } from "@/modules/ai-summary/dto/ai-summary-response.dto";
import {
  CircuitBreakerStatusSchema,
  PaymentTimeoutJobStatusSchema,
} from "@/modules/background/dto/system-monitor-response.dto";
import {
  PaymentResponseBuilder,
  type CreatePaymentResponseDto,
} from "@/modules/payment/dto/payment-response.dto";

import { RoomResponseBuilder } from "./room-response.dto";

describe("contract response builders", () => {
  it("maps rooms with object facilities and non-null createdAt", () => {
    const room = RoomResponseBuilder.from({
      roomId: "room-1",
      name: "Main Hall",
      building: null,
      floor: null,
      capacity: 120,
      floorPlanUrl: null,
      facilities: { projector: true },
      createdAt: new Date("2026-05-01T00:00:00Z"),
    } as any);

    expect(room.facilities).toEqual({ projector: true });
    expect(room.createdAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("maps AI summaries to the public AiSummary contract", () => {
    expect(AiSummaryResponseBuilder.empty()).toEqual({
      status: "NONE",
      text: null,
      updatedAt: null,
      errorDetail: null,
    });

    expect(
      AiSummaryResponseBuilder.fromPublic({
        summaryId: "summary-1",
        workshopId: "workshop-1",
        status: "FAILED",
        summaryText: null,
        generatedAt: null,
        errorMessage: "LLM timeout",
      } as any)
    ).toEqual({
      status: "FAILED",
      text: null,
      updatedAt: null,
      errorDetail: "LLM timeout",
    });
  });

  it("maps payment nullable gateway charge and ISO deadline", () => {
    const payment = {
      paymentId: "payment-1",
      registrationId: "registration-1",
      amount: "50000",
      currency: "VND",
      status: "PENDING",
      gateway: "MOCK",
      gatewayTxnId: null,
      initiatedAt: new Date("2026-05-01T00:00:00Z"),
      completedAt: null,
    } as any;

    expect(PaymentResponseBuilder.from(payment).gatewayChargeId).toBeNull();

    const createResponse: CreatePaymentResponseDto =
      PaymentResponseBuilder.fromCreate(
        payment,
        "https://pay.test",
        new Date("2026-05-01T00:15:00Z")
      );

    expect(createResponse.paymentDeadline).toBe("2026-05-01T00:15:00.000Z");
  });

  it("accepts ISO timestamp strings in system monitor response schemas", () => {
    expect(() =>
      PaymentTimeoutJobStatusSchema.parse({
        pendingCount: 1,
        timeoutCount: 0,
        lastRun: "2026-05-01T00:00:00.000Z",
        nextRun: "2026-05-01T00:05:00.000Z",
        jobStatus: "IDLE",
      })
    ).not.toThrow();

    expect(() =>
      CircuitBreakerStatusSchema.parse({
        gateway: "MOCK",
        state: "OPEN",
        failureCount: 2,
        openedAt: null,
        lastAttempt: "2026-05-01T00:00:00.000Z",
        autoCloseAt: null,
      })
    ).not.toThrow();
  });
});
