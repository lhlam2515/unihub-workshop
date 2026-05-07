import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";

import { TicketsRepository } from "./tickets.repository";

const createMockDb = () => {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  };
  return chainable;
};

const mockSchema = {
  tickets: {},
};

describe("TicketsRepository", () => {
  let repo: TicketsRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    const dbInstance = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsRepository,
        { provide: DATABASE_CONNECTION, useValue: dbInstance },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<TicketsRepository>(TicketsRepository);
    db = module.get(DATABASE_CONNECTION);
  });

  const mockTicket = {
    ticketId: "tkt-001",
    registrationId: "reg-001",
    qrToken: "qr-abc-123",
    status: "ACTIVE",
    issuedAt: new Date(),
    voidedAt: null,
  };

  describe("create", () => {
    it("should insert and return the created ticket", async () => {
      db.returning.mockResolvedValue([mockTicket]);

      const result = await repo.create({
        registrationId: "reg-001",
        qrToken: "qr-abc-123",
        status: "ACTIVE",
      } as any);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicket);
    });

    it("should use transaction client when tx is provided", async () => {
      const tx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockTicket]),
      } as any;

      const result = await repo.create({} as any, tx);

      expect(result.isSuccess).toBe(true);
      expect(tx.insert).toHaveBeenCalled();
    });

    it("should return FailResult on DB error", async () => {
      db.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create({} as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("findByRegistrationId", () => {
    it("should return ticket when found", async () => {
      db.limit.mockResolvedValue([mockTicket]);

      const result = await repo.findByRegistrationId("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicket);
    });

    it("should return null when not found", async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findByRegistrationId("reg-999");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return FailResult on DB error", async () => {
      db.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByRegistrationId("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("updateStatusByRegistrationId", () => {
    it("should update ticket status by registration ID", async () => {
      db.set.mockReturnThis();
      db.where.mockResolvedValue(undefined);

      const result = await repo.updateStatusByRegistrationId("reg-001", "VOID");

      expect(result.isSuccess).toBe(true);
    });

    it("should set voidedAt when status is VOID", async () => {
      db.set.mockReturnThis();
      db.where.mockResolvedValue(undefined);

      await repo.updateStatusByRegistrationId("reg-001", "VOID");

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "VOID", voidedAt: expect.any(Date) })
      );
    });

    it("should return FailResult on DB error", async () => {
      db.set.mockReturnThis();
      db.where.mockRejectedValue(new Error("Update failed"));

      const result = await repo.updateStatusByRegistrationId("reg-001", "VOID");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("updateStatus (by ticket ID)", () => {
    it("should update and return the updated ticket", async () => {
      const updated = { ...mockTicket, status: "VOID", voidedAt: new Date() };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("tkt-001", "VOID");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("should set voidedAt when status is VOID", async () => {
      const updated = { ...mockTicket, status: "VOID", voidedAt: new Date() };
      db.set.mockReturnThis();
      db.returning.mockResolvedValue([updated]);

      await repo.updateStatus("tkt-001", "VOID");

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "VOID", voidedAt: expect.any(Date) })
      );
    });

    it("should return FailResult on DB error", async () => {
      db.returning.mockRejectedValue(new Error("Update failed"));

      const result = await repo.updateStatus("tkt-001", "VOID");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
