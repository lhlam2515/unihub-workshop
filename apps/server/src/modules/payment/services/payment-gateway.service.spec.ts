import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { PaymentGatewayService } from "./payment-gateway.service";
import { PaymentGatewayFactory } from "../gateways/payment-gateway.factory";

import type { IGatewayAdapter } from "../gateways/gateway-adapter.interface";

describe("PaymentGatewayService", () => {
  let service: PaymentGatewayService;

  const mockAdapter: IGatewayAdapter = {
    gatewayName: "MOCK",
    initiatePayment: jest.fn().mockResolvedValue(
      Result.ok({
        redirect_url: "https://mock-gateway.test/pay/demo-txn-123",
        gateway_txn_id: "mock_txn_123_abc123",
      })
    ),
    verifyHmacSignature: jest.fn().mockResolvedValue(Result.ok(true)),
    checkPaymentStatus: jest
      .fn()
      .mockResolvedValue(Result.ok({ status: "SUCCEEDED" })),
  };

  const vnpayAdapter: IGatewayAdapter = {
    gatewayName: "VNPAY",
    initiatePayment: jest.fn().mockResolvedValue(
      Result.fail({
        category: "EXTERNAL",
        code: "PAYMENT_GATEWAY_ERROR",
        message: "Payment gateway returned an error. Please try again.",
        context: { gateway: "VNPAY" },
      })
    ),
    verifyHmacSignature: jest.fn().mockResolvedValue(
      Result.fail({
        category: "EXTERNAL",
        code: "PAYMENT_GATEWAY_ERROR",
        message: "Payment gateway returned an error. Please try again.",
        context: { gateway: "VNPAY" },
      })
    ),
    checkPaymentStatus: jest.fn().mockResolvedValue(
      Result.fail({
        category: "EXTERNAL",
        code: "PAYMENT_GATEWAY_ERROR",
        message: "Payment gateway returned an error. Please try again.",
        context: { gateway: "VNPAY" },
      })
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentGatewayService,
        {
          provide: PaymentGatewayFactory,
          useFactory: () =>
            new PaymentGatewayFactory([mockAdapter, vnpayAdapter]),
        },
      ],
    }).compile();

    service = module.get<PaymentGatewayService>(PaymentGatewayService);
  });

  describe("initiatePayment — FR-F05-003 (gateway call)", () => {
    it("should return redirect_url and gateway_txn_id for MOCK gateway", async () => {
      const result = await service.initiatePayment("MOCK", 50000, {
        registration_id: "reg-001",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.redirect_url).toContain("mock-gateway.test/pay/");
      expect(result.data.gateway_txn_id).toContain("mock_txn_");
    });

    it("should return PAYMENT_GATEWAY_ERROR for VNPAY (not yet implemented)", async () => {
      const result = await service.initiatePayment("VNPAY", 50000, {});

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_ERROR");
    });

    it("should return PAYMENT_GATEWAY_ERROR for unknown gateway", async () => {
      const result = await service.initiatePayment("UNKNOWN", 50000, {});

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_ERROR");
    });
  });

  describe("verifyHmacSignature", () => {
    it("should return true for MOCK gateway", async () => {
      const result = await service.verifyHmacSignature(
        "MOCK",
        { test: "payload" },
        "signature"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
    });

    it("should return PAYMENT_GATEWAY_ERROR for unsupported gateways", async () => {
      const result = await service.verifyHmacSignature(
        "VNPAY",
        { test: "payload" },
        "signature"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_ERROR");
    });
  });
});
