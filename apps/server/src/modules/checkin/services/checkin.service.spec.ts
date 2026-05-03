import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { CheckinService } from "./checkin.service";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTicketsRepo = {
  findByQRToken: jest.fn(),
};

const mockCheckinRecordsRepo = {
  create: jest.fn(),
  countConfirmedRegistrationsByWorkshopId: jest.fn(),
  countByWorkshopId: jest.fn(),
  findByWorkshopId: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validTicket = {
  ticketId: "tkt-001",
  registrationId: "reg-001",
  qrToken: "qr-valid-123",
  status: "ACTIVE",
  registration: {
    registrationId: "reg-001",
    studentId: "stu-001",
    workshopId: "w-001",
    workshop: {
      workshopId: "w-001",
      title: "Workshop",
      startsAt: new Date(),
      endsAt: new Date(),
    },
    student: {
      studentId: "stu-001",
      fullName: "John Doe",
      studentCode: "STU001",
    },
  },
};

const voidTicket = {
  ...validTicket,
  ticketId: "tkt-void",
  status: "VOID",
};

const wrongWorkshopTicket = {
  ...validTicket,
  ticketId: "tkt-other",
  registration: {
    ...validTicket.registration,
    workshopId: "w-other",
  },
};

const checkinRecord = {
  checkinId: "ci-001",
  checkedInAt: new Date("2026-06-01T10:00:00Z"),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("CheckinService", () => {
  let service: CheckinService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: TicketsRepository, useValue: mockTicketsRepo },
        { provide: CheckinRecordsRepository, useValue: mockCheckinRecordsRepo },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  // -----------------------------------------------------------------------
  // scanQR — FR-F07-002 (online QR validation + check-in)
  // -----------------------------------------------------------------------
  describe("scanQR — FR-F07-002", () => {
    it("creates a checkin for a valid ACTIVE ticket", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(validTicket));
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = await service.scanQR("qr-valid-123", "w-001", "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        checkinId: "ci-001",
        checkedInAt: checkinRecord.checkedInAt,
      });
      expect(mockCheckinRecordsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-001",
          ticketId: "tkt-001",
          workshopId: "w-001",
          checkedInBy: "staff-001",
          source: "ONLINE",
        })
      );
    });

    it("returns TICKET_NOT_FOUND when QR token does not match any ticket", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(null));

      const result = await service.scanQR(
        "qr-nonexistent",
        "w-001",
        "staff-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_NOT_FOUND");
    });

    it("returns TICKET_VOID when ticket status is VOID", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(voidTicket));

      const result = await service.scanQR("qr-void", "w-001", "staff-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_VOID");
    });

    it("returns TICKET_NOT_FOUND when ticket belongs to a different workshop", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(
        Result.ok(wrongWorkshopTicket)
      );

      const result = await service.scanQR("qr-wrong", "w-001", "staff-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_NOT_FOUND");
    });

    it("returns ALREADY_CHECKED_IN when create returns null (duplicate)", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(validTicket));
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(null));

      const result = await service.scanQR("qr-valid-123", "w-001", "staff-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("TICKET_ALREADY_CHECKEDIN");
    });

    it("propagates repo failure from ticket lookup", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.scanQR("qr-any", "w-001", "staff-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("propagates repo failure from checkin creation", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(validTicket));
      mockCheckinRecordsRepo.create.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.scanQR("qr-valid-123", "w-001", "staff-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getWorkshopCheckinStatus
  // -----------------------------------------------------------------------
  describe("getWorkshopCheckinStatus", () => {
    it("returns checkin status with counts and recent activity", async () => {
      const confirmedCount = 50;
      const checkedInCount = 30;
      const recentCheckins = [
        {
          checkinId: "ci-001",
          checkedInAt: new Date(),
          source: "ONLINE",
          student: {
            fullName: "John Doe",
            studentCode: "STU001",
          },
        },
      ];

      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.ok(confirmedCount)
      );
      mockCheckinRecordsRepo.countByWorkshopId.mockResolvedValue(
        Result.ok(checkedInCount)
      );
      mockCheckinRecordsRepo.findByWorkshopId.mockResolvedValue(
        Result.ok(recentCheckins)
      );

      const result = await service.getWorkshopCheckinStatus("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.confirmed_count).toBe(50);
      expect(result.data.checked_in_count).toBe(30);
      expect(result.data.pending_count).toBe(20);
      expect(result.data.recent_checkins).toHaveLength(1);
    });

    it("returns FailResult when confirmed count query fails", async () => {
      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.getWorkshopCheckinStatus("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when checked-in count query fails", async () => {
      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.ok(50)
      );
      mockCheckinRecordsRepo.countByWorkshopId.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.getWorkshopCheckinStatus("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when recent checkins query fails", async () => {
      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.ok(50)
      );
      mockCheckinRecordsRepo.countByWorkshopId.mockResolvedValue(Result.ok(30));
      mockCheckinRecordsRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.getWorkshopCheckinStatus("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
