import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { RegistrationsRepository } from "./registrations.repository";

const createMockDb = () => {
  const chainable: any = {
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
    leftJoin: jest.fn().mockReturnThis(),
    $returning: jest.fn().mockReturnThis(),
    for: jest.fn().mockReturnThis(),
  };
  return chainable;
};

const mockSchema = {
  registrations: {},
  workshops: {},
};

describe("RegistrationsRepository", () => {
  let repo: RegistrationsRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    const dbInstance = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsRepository,
        { provide: DATABASE_CONNECTION, useValue: dbInstance },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<RegistrationsRepository>(RegistrationsRepository);
    db = module.get(DATABASE_CONNECTION);
  });

  const mockRegistration = {
    registrationId: "reg-001",
    studentId: "stu-001",
    workshopId: "ws-001",
    status: "CONFIRMED",
    registeredAt: new Date(),
    confirmedAt: new Date(),
    cancelledAt: null,
    updatedAt: new Date(),
  };

  describe("findById", () => {
    it("should return registration when found", async () => {
      db.limit.mockResolvedValue([mockRegistration]);

      const result = await repo.findById("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRegistration);
    });

    it("should return null when not found", async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findById("reg-999");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return FailResult on DB error", async () => {
      db.limit.mockRejectedValue(new Error("DB connection lost"));

      const result = await repo.findById("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("findByStudentAndWorkshop", () => {
    it("should return registration when active registration exists", async () => {
      db.limit.mockResolvedValue([mockRegistration]);

      const result = await repo.findByStudentAndWorkshop("stu-001", "ws-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRegistration);
    });

    it("should return null when no active registration exists", async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findByStudentAndWorkshop("stu-001", "ws-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return FailResult on DB error", async () => {
      db.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByStudentAndWorkshop("stu-001", "ws-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("create", () => {
    it("should insert and return the created registration", async () => {
      db.returning.mockResolvedValue([mockRegistration]);

      const result = await repo.create(mockRegistration as any);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRegistration);
    });

    it("should return FailResult on DB error", async () => {
      db.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create(mockRegistration as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("updateStatus", () => {
    it("should update status to CONFIRMED with confirmedAt", async () => {
      const updated = {
        ...mockRegistration,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("reg-001", "CONFIRMED");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("should update status to CANCELLED with cancelledAt", async () => {
      const updated = {
        ...mockRegistration,
        status: "CANCELLED",
        cancelledAt: new Date(),
      };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("reg-001", "CANCELLED");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("should use transaction client when tx is provided", async () => {
      const tx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockRegistration]),
      } as any;

      const result = await repo.updateStatus("reg-001", "CONFIRMED", tx);

      expect(result.isSuccess).toBe(true);
    });

    it("should return FailResult on DB error", async () => {
      db.returning.mockRejectedValue(new Error("Update failed"));

      const result = await repo.updateStatus("reg-001", "CONFIRMED");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("findMyRegistrations", () => {
    it("should return paginated registrations with workshop titles", async () => {
      // The items query returns rows with { registration, workshopTitle } shape
      const rows = [
        {
          registration: mockRegistration,
          workshopTitle: "Workshop 1",
        },
      ];
      // First where() call is terminal for count query → mockResolvedValueOnce
      // Second where() call is in middle of items chain → default mockReturnThis
      db.where.mockResolvedValueOnce([{ total: 1 }]);
      // offset is the terminal of the items chain → must resolve
      db.offset.mockResolvedValueOnce(rows);

      const result = await repo.findMyRegistrations("stu-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
        expect(result.data.items[0].workshop_title).toBe("Workshop 1");
      }
    });

    it("should filter by status when provided", async () => {
      db.where.mockResolvedValueOnce([{ total: 0 }]);
      db.offset.mockResolvedValueOnce([]);

      const result = await repo.findMyRegistrations("stu-001", "CONFIRMED");

      expect(result.isSuccess).toBe(true);
    });

    it("should return FailResult on DB error", async () => {
      db.where.mockRejectedValue(new Error("DB error"));

      const result = await repo.findMyRegistrations("stu-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("cancelAllForWorkshop", () => {
    it("should cancel active registrations and return count", async () => {
      db.returning.mockResolvedValue([
        mockRegistration,
        { ...mockRegistration, registrationId: "reg-002" },
      ]);

      const result = await repo.cancelAllForWorkshop("ws-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.cancelledCount).toBe(2);
      }
    });

    it("should return count 0 when no active registrations", async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.cancelAllForWorkshop("ws-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.cancelledCount).toBe(0);
      }
    });
  });
});
