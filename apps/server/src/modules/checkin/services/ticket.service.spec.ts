import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";
import { TicketsRepository } from "../repositories/tickets.repository";
import { TicketService } from "./ticket.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTicketsRepo = {
  create: jest.fn(),
  findByRegistrationId: jest.fn(),
  updateStatus: jest.fn(),
  findByStudentIdAndStatus: jest.fn(),
  findById: jest.fn(),
  findByWorkshopIdAndStatus: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTicket = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-abc-123",
  status: "ACTIVE",
  issuedAt: new Date("2026-06-01T08:00:00Z"),
  voidedAt: null,
  createdAt: new Date("2026-06-01T08:00:00Z"),
  updatedAt: new Date("2026-06-01T08:00:00Z"),
  registration: {
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
  },
};

const mockTicketFlat = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-abc-123",
  status: "ACTIVE",
  issuedAt: new Date("2026-06-01T08:00:00Z"),
  voidedAt: null,
  createdAt: new Date("2026-06-01T08:00:00Z"),
  updatedAt: new Date("2026-06-01T08:00:00Z"),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("TicketService", () => {
  let service: TicketService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TicketsRepository, useValue: mockTicketsRepo },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
  });

  // -----------------------------------------------------------------------
  // issueTicket — FR-F06-001
  // -----------------------------------------------------------------------
  describe("issueTicket — FR-F06-001", () => {
    it("creates an ACTIVE ticket with a qrToken", async () => {
      mockTicketsRepo.create.mockResolvedValue(
        Result.ok({ ticketId: "tkt-001", qrToken: "qr-abc-123" })
      );

      const result = await service.issueTicket("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.ticketId).toBe("tkt-001");
      expect(result.data.qrToken).toBe("qr-abc-123");
      expect(mockTicketsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-001",
          status: "ACTIVE",
          qrToken: expect.any(String),
        })
      );
    });

    it("returns FailResult when repo create fails", async () => {
      mockTicketsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.issueTicket("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // voidTicket — FR-F06-003
  // -----------------------------------------------------------------------
  describe("voidTicket — FR-F06-003", () => {
    it("voids an ACTIVE ticket", async () => {
      mockTicketsRepo.findByRegistrationId.mockResolvedValue(
        Result.ok(mockTicketFlat)
      );
      mockTicketsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockTicketFlat, status: "VOID" })
      );

      const result = await service.voidTicket("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(mockTicketsRepo.updateStatus).toHaveBeenCalledWith(
        "tkt-001",
        "VOID"
      );
    });

    it("is idempotent when no ticket exists for the registration", async () => {
      mockTicketsRepo.findByRegistrationId.mockResolvedValue(Result.ok(null));

      const result = await service.voidTicket("reg-001");

      expect(result.isSuccess).toBe(true);
      expect(mockTicketsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("returns FailResult when find fails", async () => {
      mockTicketsRepo.findByRegistrationId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.voidTicket("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when updateStatus fails", async () => {
      mockTicketsRepo.findByRegistrationId.mockResolvedValue(
        Result.ok(mockTicketFlat)
      );
      mockTicketsRepo.updateStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.voidTicket("reg-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getMyTickets — FR-F06-002
  // -----------------------------------------------------------------------
  describe("getMyTickets — FR-F06-002", () => {
    it("returns only ACTIVE tickets scoped to the student", async () => {
      mockTicketsRepo.findByStudentIdAndStatus.mockResolvedValue(
        Result.ok([mockTicket])
      );

      const result = await service.getMyTickets("stu-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticket_id).toBe("tkt-001");
      expect(mockTicketsRepo.findByStudentIdAndStatus).toHaveBeenCalledWith(
        "stu-001",
        "ACTIVE"
      );
    });

    it("returns empty array when student has no tickets", async () => {
      mockTicketsRepo.findByStudentIdAndStatus.mockResolvedValue(Result.ok([]));

      const result = await service.getMyTickets("stu-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when repo query fails", async () => {
      mockTicketsRepo.findByStudentIdAndStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.getMyTickets("stu-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getTicketDetail — IDOR protection
  // -----------------------------------------------------------------------
  describe("getTicketDetail — IDOR protection", () => {
    it("returns ticket detail when ticket belongs to the student", async () => {
      mockTicketsRepo.findById.mockResolvedValue(Result.ok(mockTicket));

      const result = await service.getTicketDetail("stu-001", "tkt-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.ticket_id).toBe("tkt-001");
    });

    it("returns 404 when ticket belongs to another student (IDOR)", async () => {
      const otherStudentTicket = {
        ...mockTicket,
        registration: { ...mockTicket.registration, studentId: "stu-other" },
      };
      mockTicketsRepo.findById.mockResolvedValue(Result.ok(otherStudentTicket));

      const result = await service.getTicketDetail("stu-001", "tkt-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_NOT_FOUND");
    });

    it("returns 404 when ticket is not found", async () => {
      mockTicketsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getTicketDetail("stu-001", "tkt-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_NOT_FOUND");
    });

    it("returns FailResult when repo query fails", async () => {
      mockTicketsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.getTicketDetail("stu-001", "tkt-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // preloadActiveTickets — FR-F07-001
  // -----------------------------------------------------------------------
  describe("preloadActiveTickets — FR-F07-001", () => {
    it("returns active tickets for the workshop scope", async () => {
      mockTicketsRepo.findByWorkshopIdAndStatus.mockResolvedValue(
        Result.ok([mockTicket])
      );

      const result = await service.preloadActiveTickets("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticket_id).toBe("tkt-001");
      expect(mockTicketsRepo.findByWorkshopIdAndStatus).toHaveBeenCalledWith(
        "w-001",
        "ACTIVE"
      );
    });

    it("returns empty array when workshop has no active tickets", async () => {
      mockTicketsRepo.findByWorkshopIdAndStatus.mockResolvedValue(
        Result.ok([])
      );

      const result = await service.preloadActiveTickets("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when repo query fails", async () => {
      mockTicketsRepo.findByWorkshopIdAndStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.preloadActiveTickets("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
