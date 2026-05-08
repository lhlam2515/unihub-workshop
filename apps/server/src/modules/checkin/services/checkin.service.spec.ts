import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { CheckinService } from "./checkin.service";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { RegistrationsRepository } from "../repositories/registrations.repository";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRegistrationsRepo = {
  findByQRCode: jest.fn(),
};

const mockCheckinRecordsRepo = {
  create: jest.fn(),
  findFirstByRegistrationId: jest.fn(),
  countConfirmedRegistrationsByWorkshopId: jest.fn(),
  countByWorkshopId: jest.fn(),
  findByWorkshopId: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validRegistration = {
  registrationId: "reg-001",
  qrCode: "550e8400-e29b-41d4-a716-446655440001",
  workshopId: "w-001",
  studentId: "stu-001",
  status: "CONFIRMED",
  workshop: {
    workshopId: "w-001",
    title: "Workshop",
    status: "PUBLISHED",
    startsAt: new Date(),
    endsAt: new Date(),
  },
  student: {
    studentId: "stu-001",
    fullName: "John Doe",
  },
};

const paidRegistration = {
  ...validRegistration,
  registrationId: "reg-paid",
  status: "PAID",
};

const pendingRegistration = {
  ...validRegistration,
  registrationId: "reg-pending",
  status: "PENDING",
};

const cancelledWorkshopReg = {
  ...validRegistration,
  registrationId: "reg-cancelled",
  workshop: { ...validRegistration.workshop, status: "CANCELLED" },
};

const wrongWorkshopReg = {
  ...validRegistration,
  registrationId: "reg-other",
  workshopId: "w-other",
};

const checkinRecord = {
  checkinId: "ci-001",
  checkedInAt: new Date("2026-06-01T10:00:00Z"),
};

const existingCheckin = {
  checkinId: "ci-001",
  checkedInAt: new Date("2026-06-01T09:00:00Z"),
  staffName: "Staff One",
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
        { provide: RegistrationsRepository, useValue: mockRegistrationsRepo },
        { provide: CheckinRecordsRepository, useValue: mockCheckinRecordsRepo },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  // -----------------------------------------------------------------------
  // scanQR — FR-F07-002 (online QR validation + check-in)
  // -----------------------------------------------------------------------
  describe("scanQR — FR-F07-002", () => {
    it("creates a checkin for a valid CONFIRMED registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440001",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isSuccess).toBe(true);
      expect(mockCheckinRecordsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-001",
          workshopId: "w-001",
          checkedInBy: "staff-001",
          source: "ONLINE",
        })
      );
    });

    it("creates a checkin for a valid PAID registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(paidRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440001",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isSuccess).toBe(true);
    });

    it("returns QR_INVALID when QR code does not match any registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(Result.ok(null));

      const result = await service.scanQR(
        "00000000-0000-0000-0000-000000000000",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("QR_INVALID");
    });

    it("returns REGISTRATION_NOT_ACTIVE when registration status is PENDING", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(pendingRegistration)
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440002",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REGISTRATION_NOT_ACTIVE");
    });

    it("returns REGISTRATION_NOT_ACTIVE when workshop is CANCELLED", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(cancelledWorkshopReg)
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440003",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
    });

    it("returns WRONG_WORKSHOP when registration belongs to a different workshop", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(wrongWorkshopReg)
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440004",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("WRONG_WORKSHOP");
    });

    it("returns duplicate=true when registration is already checked in", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(null));
      mockCheckinRecordsRepo.findFirstByRegistrationId.mockResolvedValue(
        Result.ok(existingCheckin)
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440001",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.duplicate).toBe(true);
    });

    it("propagates repo failure from registration lookup", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440001",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("propagates repo failure from checkin creation", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB down",
        })
      );

      const result = await service.scanQR(
        "550e8400-e29b-41d4-a716-446655440001",
        "w-001",
        "staff-001",
        new Date()
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getWorkshopCheckinStatus
  // -----------------------------------------------------------------------
  describe("getWorkshopCheckinStatus", () => {
    it("returns checkin status with counts and recent activity", async () => {
      const recentCheckins = [
        {
          checkinId: "ci-001",
          checkedInAt: new Date(),
          source: "ONLINE",
          student: {
            fullName: "John Doe",
            studentId: "stu-001",
          },
        },
      ];

      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.ok(50)
      );
      mockCheckinRecordsRepo.countByWorkshopId.mockResolvedValue(Result.ok(30));
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
  });
});
