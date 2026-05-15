import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { IdempotencyMechanic } from "./idempotency.mechanic";
import { IdempotencyKeysRepository } from "../repositories/idempotency-keys.repository";

describe("IdempotencyMechanic", () => {
  let mechanic: IdempotencyMechanic;
  let repo: jest.Mocked<IdempotencyKeysRepository>;

  const IDEMPOTENCY_KEY = "idem-key-001";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyMechanic,
        {
          provide: IdempotencyKeysRepository,
          useValue: {
            createOrGetExisting: jest.fn(),
            markCompleted: jest.fn(),
            markUnresolved: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<IdempotencyMechanic>(IdempotencyMechanic);
    repo = module.get(IdempotencyKeysRepository);
  });

  describe("check — PostgreSQL 3-State Idempotency", () => {
    it("should return proceed:true for a new key (isNew)", async () => {
      repo.createOrGetExisting.mockResolvedValue(
        Result.ok({ isNew: true, status: "IN_PROGRESS" })
      );

      const result = await mechanic.check(IDEMPOTENCY_KEY, "PAYMENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ proceed: true });
    });

    it("should return proceed:true for UNRESOLVED key (retry)", async () => {
      repo.createOrGetExisting.mockResolvedValue(
        Result.ok({ isNew: false, status: "UNRESOLVED" })
      );

      const result = await mechanic.check(IDEMPOTENCY_KEY, "PAYMENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ proceed: true });
    });

    it("should return proceed:false with cachedResponse for COMPLETED key", async () => {
      const cachedBody = { payment_id: "pay-001" };
      repo.createOrGetExisting.mockResolvedValue(
        Result.ok({
          isNew: false,
          status: "COMPLETED",
          responseBody: cachedBody,
          statusCode: 201,
        })
      );

      const result = await mechanic.check(IDEMPOTENCY_KEY, "PAYMENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        proceed: false,
        cachedResponse: { body: cachedBody, statusCode: 201 },
      });
    });

    it("should return IDEMPOTENCY_CONFLICT for IN_PROGRESS key", async () => {
      repo.createOrGetExisting.mockResolvedValue(
        Result.ok({ isNew: false, status: "IN_PROGRESS" })
      );

      const result = await mechanic.check(IDEMPOTENCY_KEY, "PAYMENT");

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("IDEMPOTENCY_CONFLICT");
    });
  });

  describe("markCompleted / markUnresolved", () => {
    it("should delegate to repository on markCompleted", async () => {
      repo.markCompleted.mockResolvedValue(Result.ok());

      const result = await mechanic.markCompleted(
        IDEMPOTENCY_KEY,
        { payment_id: "pay-001" },
        201
      );

      expect(result.isSuccess).toBe(true);
      expect(repo.markCompleted).toHaveBeenCalledWith(
        expect.any(String),
        { payment_id: "pay-001" },
        201
      );
    });

    it("should delegate to repository on markUnresolved", async () => {
      repo.markUnresolved.mockResolvedValue(Result.ok());

      const result = await mechanic.markUnresolved(IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      expect(repo.markUnresolved).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
