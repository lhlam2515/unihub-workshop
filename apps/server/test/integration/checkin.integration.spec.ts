/**
 * Checkin Module — Integration Tests
 *
 * Tests CheckinController (scan + sync) and CheckinPreloadController
 * with mocked services and repositories.
 *
 * FR references:
 * - FR-F07-001: Pre-load Active Ticket List
 * - FR-F07-002: Validate QR and Record Check-in Online
 * - FR-F07-003: Validate QR Offline (Mobile side — server handles sync)
 * - FR-F07-004: Sync Offline Check-in Records Idempotently
 * - FR-F01-006: WorkshopScopeGuard
 */
import { Test } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";
import {
  CheckinController,
  CheckinPreloadController,
} from "@/modules/checkin/controllers/checkin.controller";
import { CheckinRecordsRepository } from "@/modules/checkin/repositories/checkin-records.repository";
import { RegistrationsRepository } from "@/modules/checkin/repositories/registrations.repository";
import { CheckinService } from "@/modules/checkin/services/checkin.service";
import { OfflineSyncService } from "@/modules/checkin/services/offline-sync.service";
import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { TokenService } from "@/modules/iam/services/token.service";
import { Result } from "@/shared/response/result";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRegistrationsRepo = {
  findByQRCode: jest.fn(),
  findActiveByWorkshopId: jest.fn(),
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
  workshopId: "wid-001",
  studentId: "stu-001",
  status: "CONFIRMED",
  workshop: {
    workshopId: "wid-001",
    title: "Test Workshop",
    status: "PUBLISHED",
    startsAt: new Date("2026-06-01T08:00:00Z"),
    endsAt: new Date("2026-06-01T10:00:00Z"),
  },
  student: {
    studentId: "stu-001",
    fullName: "John Doe",
  },
};

const unpaidRegistration = {
  ...validRegistration,
  registrationId: "reg-unpaid",
  status: "PENDING",
};

const wrongWorkshopReg = {
  ...validRegistration,
  registrationId: "reg-other",
  workshopId: "wid-other",
};

const checkinRecord = {
  checkinId: "ci-001",
  checkedInAt: new Date("2026-06-01T10:00:00Z"),
  receivedAt: new Date(),
  student: { studentCode: "stu-001", fullName: "John Doe" },
  duplicate: false,
};

const staffUser = {
  sub: "staff-001",
  role: "CHECKIN_STAFF" as const,
  jti: "jti-staff",
  allowed_workshop_ids: ["wid-001"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function provideMockGuard() {
  return {
    provide: JwtAuthGuard,
    useValue: { canActivate: jest.fn().mockResolvedValue(true) },
  };
}

function provideMockRolesGuard() {
  return {
    provide: RolesGuard,
    useValue: { canActivate: jest.fn().mockReturnValue(true) },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Checkin Module — Integration", () => {
  let checkinController: CheckinController;
  let checkinPreloadController: CheckinPreloadController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [CheckinController, CheckinPreloadController],
      providers: [
        CheckinService,
        OfflineSyncService,
        { provide: RegistrationsRepository, useValue: mockRegistrationsRepo },
        { provide: CheckinRecordsRepository, useValue: mockCheckinRecordsRepo },
        { provide: TokenService, useValue: { verifyAccessToken: jest.fn() } },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        provideMockGuard(),
        provideMockRolesGuard(),
      ],
    }).compile();

    checkinController = module.get<CheckinController>(CheckinController);
    checkinPreloadController = module.get<CheckinPreloadController>(
      CheckinPreloadController
    );
  });

  // -------------------------------------------------------------------------
  // CheckinController — scanQR — FR-F07-002
  // -------------------------------------------------------------------------
  describe("CheckinController.scanQR — FR-F07-002", () => {
    it("creates a checkin record for a valid CONFIRMED registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = (await checkinController.scanQR(
        {
          qrCode: "550e8400-e29b-41d4-a716-446655440001",
          workshopId: "wid-001",
          checkedInAt: new Date("2026-06-01T10:00:00Z"),
        },
        staffUser
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(true);
      expect(mockCheckinRecordsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-001",
          workshopId: "wid-001",
          source: "ONLINE",
          checkedInBy: "staff-001",
        })
      );
    });

    it("returns QR_INVALID for unknown QR code", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(Result.ok(null));

      const result = (await checkinController.scanQR(
        {
          qrCode: "00000000-0000-0000-0000-000000000000",
          workshopId: "wid-001",
          checkedInAt: new Date(),
        },
        staffUser
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(false);
      expect((result as Result<never>).error.code).toBe("QR_INVALID");
    });

    it("returns REGISTRATION_NOT_ACTIVE for PENDING registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(unpaidRegistration)
      );

      const result = (await checkinController.scanQR(
        {
          qrCode: "550e8400-e29b-41d4-a716-446655440002",
          workshopId: "wid-001",
          checkedInAt: new Date(),
        },
        staffUser
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(false);
      expect((result as Result<never>).error.code).toBe(
        "REGISTRATION_NOT_ACTIVE"
      );
    });

    it("returns WRONG_WORKSHOP for registration from a different workshop", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(wrongWorkshopReg)
      );

      const result = (await checkinController.scanQR(
        {
          qrCode: "550e8400-e29b-41d4-a716-446655440003",
          workshopId: "wid-001",
          checkedInAt: new Date(),
        },
        staffUser
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(false);
      expect((result as Result<never>).error.code).toBe("WRONG_WORKSHOP");
    });

    it("returns duplicate=true for already checked-in registration", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(null));
      mockCheckinRecordsRepo.findFirstByRegistrationId.mockResolvedValue(
        Result.ok({
          checkinId: "ci-001",
          checkedInAt: new Date("2026-06-01T09:00:00Z"),
          staffName: "Staff One",
        })
      );

      const result = (await checkinController.scanQR(
        {
          qrCode: "550e8400-e29b-41d4-a716-446655440001",
          workshopId: "wid-001",
          checkedInAt: new Date(),
        },
        staffUser
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(true);
      expect((result.data as { duplicate: boolean }).duplicate).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CheckinController — syncOfflineData — FR-F07-004
  // -------------------------------------------------------------------------
  describe("CheckinController.syncOfflineData — FR-F07-004", () => {
    it("processes a batch of offline check-in records", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = await checkinController.syncOfflineData(
        {
          deviceId: "00000000-0000-0000-0000-000000000001",
          items: [
            {
              localId: "00000000-0000-0000-0000-000000000010",
              qrCode: "550e8400-e29b-41d4-a716-446655440001",
              workshopId: "wid-001",
              checkedInAt: Date.now(),
            },
          ],
        },
        staffUser
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveProperty("results");
      expect(Array.isArray(result.data.results)).toBe(true);
    });

    it("marks invalid QR codes as REJECTED and continues", async () => {
      mockRegistrationsRepo.findByQRCode
        .mockResolvedValueOnce(Result.ok(null))
        .mockResolvedValueOnce(Result.ok(validRegistration));
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(checkinRecord));

      const result = await checkinController.syncOfflineData(
        {
          deviceId: "00000000-0000-0000-0000-000000000001",
          items: [
            {
              localId: "00000000-0000-0000-0000-000000000020",
              qrCode: "00000000-0000-0000-0000-000000000000",
              workshopId: "wid-001",
              checkedInAt: Date.now(),
            },
            {
              localId: "00000000-0000-0000-0000-000000000021",
              qrCode: "550e8400-e29b-41d4-a716-446655440001",
              workshopId: "wid-001",
              checkedInAt: Date.now(),
            },
          ],
        },
        staffUser
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.results).toHaveLength(2);
      expect(result.data.results[0].result).toBe("REJECTED");
      expect(result.data.results[1].result).toBe("OK");
    });

    it("marks duplicate syncs as DUPLICATE", async () => {
      mockRegistrationsRepo.findByQRCode.mockResolvedValue(
        Result.ok(validRegistration)
      );
      mockCheckinRecordsRepo.create.mockResolvedValue(Result.ok(null));
      mockCheckinRecordsRepo.findFirstByRegistrationId.mockResolvedValue(
        Result.ok({
          checkinId: "ci-001",
          checkedInAt: new Date(),
          staffName: "Staff One",
        })
      );

      const result = await checkinController.syncOfflineData(
        {
          deviceId: "00000000-0000-0000-0000-000000000001",
          items: [
            {
              localId: "00000000-0000-0000-0000-000000000030",
              qrCode: "550e8400-e29b-41d4-a716-446655440001",
              workshopId: "wid-001",
              checkedInAt: Date.now(),
            },
          ],
        },
        staffUser
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.results[0].result).toBe("DUPLICATE");
    });
  });

  // -------------------------------------------------------------------------
  // CheckinPreloadController — preloadRegistrations — FR-F07-001
  // -------------------------------------------------------------------------
  describe("CheckinPreloadController.preloadRegistrations — FR-F07-001", () => {
    it("preloads active registrations for a workshop", async () => {
      mockRegistrationsRepo.findActiveByWorkshopId.mockResolvedValue(
        Result.ok({
          data: [validRegistration],
          total: 1,
          nextCursor: null,
          hasMore: false,
        })
      );

      const result = await checkinPreloadController.preloadRegistrations(
        "wid-001",
        undefined,
        undefined,
        { header: jest.fn() } as any
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveProperty("data");
      expect(result.data).toHaveProperty("pagination");
      expect(result.data.data).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // CheckinPreloadController — getWorkshopStatus
  // -------------------------------------------------------------------------
  describe("CheckinPreloadController.getWorkshopStatus", () => {
    it("returns check-in statistics for a workshop", async () => {
      mockCheckinRecordsRepo.countConfirmedRegistrationsByWorkshopId.mockResolvedValue(
        Result.ok(50)
      );
      mockCheckinRecordsRepo.countByWorkshopId.mockResolvedValue(Result.ok(30));
      mockCheckinRecordsRepo.findByWorkshopId.mockResolvedValue(
        Result.ok([checkinRecord])
      );

      const result = (await checkinPreloadController.getWorkshopStatus(
        "wid-001"
      )) as Result<unknown>;

      expect(result.isSuccess).toBe(true);
    });
  });
});
