import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";

import { PaymentsRepository } from "./payments.repository";

const createMockDb = () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  for: jest.fn().mockReturnThis(),
  transaction: jest.fn(),
});

const mockSchema = {
  payments: {},
  workshopSlots: {},
};

describe("PaymentsRepository", () => {
  let repo: PaymentsRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<PaymentsRepository>(PaymentsRepository);
  });

  const mockPayment = {
    paymentId: "pay-001",
    registrationId: "reg-001",
    studentId: "stu-001",
    amount: "50000",
    currency: "VND",
    gateway: "MOCK",
    status: "INITIATED",
    idempotencyKey: "idem-001",
    timeoutAt: new Date(),
    initiatedAt: new Date(),
    completedAt: null,
    gatewayTxnId: null,
    rawGatewayResponse: null,
  };

  describe("findById", () => {
    it("should return payment when found", async () => {
      mockDb.returning.mockReset();

      // We need to wire the chain: select → from → where → limit → [result]
      // Use mockImplementationOnce on the chain
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([mockPayment]);

      const result = await repo.findById("pay-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockPayment);
    });

    it("should return null when payment not found", async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      const result = await repo.findById("pay-999");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return FailResult on DB error", async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.limit.mockRejectedValue(new Error("DB connection lost"));

      const result = await repo.findById("pay-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("findByIdempotencyKeyWithLock", () => {
    it("should return payment with FOR UPDATE NOWAIT lock", async () => {
      const tx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        for: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPayment]),
      };

      const result = await repo.findByIdempotencyKeyWithLock("idem-001", tx);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockPayment);
      expect(tx.for).toHaveBeenCalledWith("update", { noWait: true });
    });

    it("should return null when no payment matches", async () => {
      const tx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        for: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      const result = await repo.findByIdempotencyKeyWithLock("idem-999", tx);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return DB_LOCK_TIMEOUT on lock conflict", async () => {
      const tx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        for: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockRejectedValue(new Error("could not obtain lock on row")),
      };

      const result = await repo.findByIdempotencyKeyWithLock("idem-001", tx);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("DB_LOCK_TIMEOUT");
    });
  });

  describe("create", () => {
    it("should insert and return the created payment", async () => {
      mockDb.insert.mockReturnThis();
      mockDb.values.mockReturnThis();
      mockDb.returning.mockResolvedValue([mockPayment]);

      const result = await repo.create(mockPayment as any);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockPayment);
    });

    it("should use transaction client when tx is provided", async () => {
      const tx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockPayment]),
      };

      const result = await repo.create(mockPayment as any, tx);

      expect(result.isSuccess).toBe(true);
      expect(tx.insert).toHaveBeenCalled();
    });

    it("should return FailResult on DB error", async () => {
      mockDb.insert.mockReturnThis();
      mockDb.values.mockReturnThis();
      mockDb.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create(mockPayment as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("updateStatus", () => {
    it("should update status and set completedAt for SUCCESS", async () => {
      const updated = {
        ...mockPayment,
        status: "SUCCESS",
        completedAt: new Date(),
      };
      mockDb.update.mockReturnThis();
      mockDb.set.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("pay-001", "SUCCESS", "txn-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("should omit gateway_txn_id when not provided", async () => {
      mockDb.update.mockReturnThis();
      mockDb.set.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.returning.mockResolvedValue([mockPayment]);

      const result = await repo.updateStatus("pay-001", "FAILED");

      expect(result.isSuccess).toBe(true);
    });

    it("should use transaction client when tx is provided", async () => {
      const tx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockPayment]),
      };

      const result = await repo.updateStatus(
        "pay-001",
        "SUCCESS",
        undefined,
        tx
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  describe("findMyPayments", () => {
    it("should return paginated payments for a student", async () => {
      const items = [mockPayment];
      // First where() is terminal for count → resolve once
      // Subsequent where() in items chain → default mockReturnThis
      mockDb.where.mockResolvedValueOnce([{ total: 1 }]);
      // offset is terminal for items query → resolve
      mockDb.offset.mockResolvedValueOnce(items);

      const result = await repo.findMyPayments("stu-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toEqual(items);
        expect(result.data.total).toBe(1);
      }
    });

    it("should return FailResult on DB error", async () => {
      mockDb.where.mockRejectedValue(new Error("DB error"));

      const result = await repo.findMyPayments("stu-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("findPendingOverdue", () => {
    it("should return overdue INITIATED payments", async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockResolvedValue([mockPayment]);

      const result = await repo.findPendingOverdue();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual(mockPayment);
      }
    });
  });

  describe("transaction", () => {
    it("should execute callback within a transaction", async () => {
      const tx = {};
      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<any>) =>
        cb(tx)
      );

      const result = await repo.transaction((t) => {
        expect(t).toBe(tx);
        return "ok";
      });

      expect(result).toBe("ok");
    });
  });
});
