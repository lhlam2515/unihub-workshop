import { Test, type TestingModule } from "@nestjs/testing";

import { PaymentGatewayService } from "./payment-gateway.service";

describe("PaymentGatewayService", () => {
  let service: PaymentGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentGatewayService],
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

    it("should return PAYMENT_GATEWAY_ERROR for STRIPE (not yet implemented)", async () => {
      const result = await service.initiatePayment("STRIPE", 50000, {});

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PAYMENT_GATEWAY_ERROR");
    });

    it("should return PAYMENT_GATEWAY_ERROR for MOMO (not yet implemented)", async () => {
      const result = await service.initiatePayment("MOMO", 50000, {});

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
