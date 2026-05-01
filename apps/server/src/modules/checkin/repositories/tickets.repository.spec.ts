import { Test, type TestingModule } from "@nestjs/testing";
import { desc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { TicketsRepository } from "./tickets.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };

  const db: any = {
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
    select: jest.fn().mockReturnValue(chainable),
    query: {
      tickets: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };

  return { db, chainable };
}

const mockRegistration = {
  registrationId: "reg-001",
  studentId: "stu-001",
  workshopId: "w-001",
  workshop: {
    workshopId: "w-001",
    title: "Intro to Testing",
    startsAt: new Date("2026-06-01T09:00:00Z"),
    endsAt: new Date("2026-06-01T11:00:00Z"),
  },
  student: {
    studentId: "stu-001",
    fullName: "John Doe",
    studentCode: "STU001",
  },
};

const mockTicket = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-abc-123",
  status: "ACTIVE",
  issuedAt: new Date("2026-06-01T08:00:00Z"),
  voidedAt: null,
  createdAt: new Date("2026-06-01T08:00:00Z"),
  updatedAt: new Date("2026-06-01T08:00:00Z"),
  registration: mockRegistration,
};

const mockTicketWithoutRelations = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-abc-123",
  status: "ACTIVE",
  issuedAt: new Date("2026-06-01T08:00:00Z"),
  voidedAt: null,
  createdAt: new Date("2026-06-01T08:00:00Z"),
  updatedAt: new Date("2026-06-01T08:00:00Z"),
};

const mockSchema: any = {
  tickets: {
    ticketId: "ticketId",
    qrToken: "qrToken",
    status: "status",
    registrationId: "registrationId",
    issuedAt: "issuedAt",
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("TicketsRepository (checkin)", () => {
  let repo: TicketsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<TicketsRepository>(TicketsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // findByQRToken
  // -----------------------------------------------------------------------
  describe("findByQRToken", () => {
    it("returns ticket with relations when found", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(mockTicket);

      const result = await repo.findByQRToken("qr-abc-123");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicket);
      expect(mockDb.query.tickets.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
          with: expect.objectContaining({
            registration: expect.objectContaining({
              with: { workshop: true, student: true },
            }),
          }),
        })
      );
    });

    it("returns null when ticket is not found", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(null);

      const result = await repo.findByQRToken("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.tickets.findFirst.mockRejectedValue(new Error("DB down"));

      const result = await repo.findByQRToken("qr-abc-123");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------
  describe("findById", () => {
    it("returns ticket with relations when found", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(mockTicket);

      const result = await repo.findById("tkt-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicket);
    });

    it("returns null when ticket is not found", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(null);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.tickets.findFirst.mockRejectedValue(new Error("DB down"));

      const result = await repo.findById("tkt-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByStudentIdAndStatus
  // -----------------------------------------------------------------------
  describe("findByStudentIdAndStatus", () => {
    it("returns only tickets belonging to the student with matching status", async () => {
      const ownTicket = { ...mockTicket };
      const otherTicket = {
        ...mockTicket,
        ticketId: "tkt-002",
        registration: {
          ...mockRegistration,
          studentId: "stu-other",
          student: {
            studentId: "stu-other",
            fullName: "Jane",
            studentCode: "STU002",
          },
        },
      };
      mockDb.query.tickets.findMany.mockResolvedValue([ownTicket, otherTicket]);

      const result = await repo.findByStudentIdAndStatus("stu-001", "ACTIVE");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticketId).toBe("tkt-001");
    });

    it("returns empty array when student has no matching tickets", async () => {
      mockDb.query.tickets.findMany.mockResolvedValue([]);

      const result = await repo.findByStudentIdAndStatus("stu-001", "ACTIVE");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.tickets.findMany.mockRejectedValue(new Error("DB down"));

      const result = await repo.findByStudentIdAndStatus("stu-001", "ACTIVE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByWorkshopIdAndStatus
  // -----------------------------------------------------------------------
  describe("findByWorkshopIdAndStatus", () => {
    it("returns only tickets for the workshop with matching status", async () => {
      const matchingTicket = { ...mockTicket };
      const wrongWSTicket = {
        ...mockTicket,
        ticketId: "tkt-002",
        registration: {
          ...mockRegistration,
          workshopId: "w-other",
          workshop: {
            ...mockRegistration.workshop,
            workshopId: "w-other",
          },
        },
      };
      mockDb.query.tickets.findMany.mockResolvedValue([
        matchingTicket,
        wrongWSTicket,
      ]);

      const result = await repo.findByWorkshopIdAndStatus("w-001", "ACTIVE");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticketId).toBe("tkt-001");
    });

    it("returns empty array when workshop has no matching tickets", async () => {
      mockDb.query.tickets.findMany.mockResolvedValue([]);

      const result = await repo.findByWorkshopIdAndStatus("w-001", "ACTIVE");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.tickets.findMany.mockRejectedValue(new Error("DB down"));

      const result = await repo.findByWorkshopIdAndStatus("w-001", "ACTIVE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByRegistrationId
  // -----------------------------------------------------------------------
  describe("findByRegistrationId", () => {
    it("returns ticket when found for the registration", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(
        mockTicketWithoutRelations
      );

      const result = await repo.findByRegistrationId("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicketWithoutRelations);
    });

    it("returns null when no ticket exists for the registration", async () => {
      mockDb.query.tickets.findFirst.mockResolvedValue(null);

      const result = await repo.findByRegistrationId("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.tickets.findFirst.mockRejectedValue(new Error("DB down"));

      const result = await repo.findByRegistrationId("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("inserts a new ticket and returns it (FR-F06-001)", async () => {
      mockChain.returning.mockResolvedValue([mockTicketWithoutRelations]);

      const result = await repo.create({
        registrationId: "reg-001",
        qrToken: "qr-abc-123",
        status: "ACTIVE",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockTicketWithoutRelations);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.tickets);
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create({
        registrationId: "reg-001",
        qrToken: "qr-abc-123",
        status: "ACTIVE",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates ticket status and returns the updated ticket", async () => {
      const voidedTicket = {
        ...mockTicketWithoutRelations,
        status: "VOID",
        voidedAt: expect.any(Date),
      };
      mockChain.returning.mockResolvedValue([voidedTicket]);

      const result = await repo.updateStatus("tkt-001", "VOID");

      expect(result.isSuccess).toBe(true);
      expect(mockDb.update).toHaveBeenCalledWith(mockSchema.tickets);
      expect(mockChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "VOID" })
      );
      expect(mockChain.where).toHaveBeenCalled();
    });

    it("returns FailResult when DB update throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("Update failed"));

      const result = await repo.updateStatus("tkt-001", "ACTIVE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
