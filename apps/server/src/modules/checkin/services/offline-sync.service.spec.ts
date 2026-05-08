import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { OfflineSyncService } from "./offline-sync.service";
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

const checkinRecord = {
  checkinId: "ci-001",
  checkedInAt: new Date(),
};

const existingCheckin = {
  checkinId: "ci-001",
  checkedInAt: new Date(),
  staffName: "Staff One",
};

const makeItem = (
  overrides: Partial<{
    localId: string;
    qrCode: string;
    workshopId: string;
    checkedInAt: Date;
  }> = {}
) => ({
  localId: "00000000-0000-0000-0000-000000000010",
  qrCode: "550e8400-e29b-41d4-a716-446655440001",
  workshopId: "w-001",
  checkedInAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("OfflineSyncService", () => {
  let service: OfflineSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfflineSyncService,
        { provide: RegistrationsRepository, useValue: mockRegistrationsRepo },
        { provide: CheckinRecordsRepository, useValue: mockCheckinRecordsRepo },
      ],
    }).compile();

    service = module.get<OfflineSyncService>(OfflineSyncService);
  });

  // -----------------------------------------------------------------------
  // processSyncBatch — FR-F07-004
  // -----------------------------------------------------------------------
  describe("processSyncBatch — FR-F07-004", () => {
    it("processes a mixed batch: OK for valid, DUPLICATE for repeat, REJECTED for invalid", async () => {
      mockRegistrationsRepo.findByQRCode
        .mockResolvedValueOnce(Result.ok(validRegistration))
        .mockResolvedValueOnce(Result.ok(validRegistration))
        .mockResolvedValueOnce(Result.ok(null))
        .mockResolvedValueOnce(Result.ok(pendingRegistration));

      mockCheckinRecordsRepo.create
        .mockResolvedValueOnce(Result.ok(checkinRecord))
        .mockResolvedValueOnce(Result.ok(null));

      mockCheckinRecordsRepo.findFirstByRegistrationId.mockResolvedValue(
        Result.ok(existingCheckin)
      );

      const items = [
        makeItem({ localId: "00000000-0000-0000-0000-000000000001" }),
        makeItem({ localId: "00000000-0000-0000-0000-000000000002" }),
        makeItem({
          localId: "00000000-0000-0000-0000-000000000003",
          qrCode: "00000000-0000-0000-0000-000000000000",
        }),
        makeItem({
          localId: "00000000-0000-0000-0000-000000000004",
          qrCode: "550e8400-e29b-41d4-a716-446655440002",
        }),
      ];

      const result = await service.processSyncBatch(items, "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results).toHaveLength(4);
      expect(result.data.results[0].result).toBe("OK");
      expect(result.data.results[1].result).toBe("DUPLICATE");
      expect(result.data.results[2].result).toBe("REJECTED");
      expect(result.data.results[3].result).toBe("REJECTED");
    });

    it("marks PENDING registration as REJECTED with NOT_PAID reason", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(pendingRegistration)
      );

      const result = await service.processSyncBatch([makeItem()], "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results[0].result).toBe("REJECTED");
      expect(result.data.results[0].reason).toBe("NOT_PAID");
      expect(mockCheckinRecordsRepo.create).not.toHaveBeenCalled();
    });

    it("marks CANCELLED workshop registration as REJECTED", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(cancelledWorkshopReg)
      );

      const result = await service.processSyncBatch([makeItem()], "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results[0].result).toBe("REJECTED");
      expect(result.data.results[0].reason).toBe("WORKSHOP_CANCELLED");
    });

    it("marks null registration (QR not found) as REJECTED", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(Result.ok(null));

      const result = await service.processSyncBatch([makeItem()], "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results[0].result).toBe("REJECTED");
      expect(result.data.results[0].reason).toBe("QR_INVALID");
    });

    it("handles empty batch gracefully", async () => {
      const result = await service.processSyncBatch([], "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results).toHaveLength(0);
    });

    it("continues processing after individual item failures (repo error)", async () => {
      mockRegistrationsRepo.findByQRCode
        .mockResolvedValueOnce(
          Result.fail({
            category: "INTERNAL",
            code: "INTERNAL_ERROR",
            message: "DB down",
          })
        )
        .mockResolvedValueOnce(Result.ok(validRegistration));

      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const items = [
        makeItem({ localId: "00000000-0000-0000-0000-000000000001" }),
        makeItem({ localId: "00000000-0000-0000-0000-000000000002" }),
      ];

      const result = await service.processSyncBatch(items, "staff-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.results).toHaveLength(2);
      expect(result.data.results[0].result).toBe("REJECTED");
      expect(result.data.results[1].result).toBe("OK");
    });
  });
});
