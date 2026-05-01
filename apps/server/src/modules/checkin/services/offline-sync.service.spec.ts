import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { TicketsRepository } from "../repositories/tickets.repository";
import { OfflineSyncService } from "./offline-sync.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTicketsRepo = {
  findByQRToken: jest.fn(),
};

const mockCheckinRecordsRepo = {
  create: jest.fn(),
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
  },
};

const voidTicket = {
  ...validTicket,
  ticketId: "tkt-void",
  qrToken: "qr-void-456",
  status: "VOID",
};

const wrongWorkshopTicket = {
  ...validTicket,
  ticketId: "tkt-other",
  qrToken: "qr-other-789",
  registration: {
    ...validTicket.registration,
    workshopId: "w-other",
  },
};

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
        { provide: TicketsRepository, useValue: mockTicketsRepo },
        { provide: CheckinRecordsRepository, useValue: mockCheckinRecordsRepo },
      ],
    }).compile();

    service = module.get<OfflineSyncService>(OfflineSyncService);
  });

  // -----------------------------------------------------------------------
  // processSyncBatch — FR-F07-004
  // -----------------------------------------------------------------------
  describe("processSyncBatch — FR-F07-004", () => {
    it("processes a mixed batch: syncs valid, skips duplicate, conflicts on VOID", async () => {
      mockTicketsRepo.findByQRToken
        .mockResolvedValueOnce(Result.ok(validTicket)) // item 1: valid
        .mockResolvedValueOnce(Result.ok(validTicket)) // item 2: valid (duplicate → skip)
        .mockResolvedValueOnce(Result.ok(voidTicket)) // item 3: VOID → conflict
        .mockResolvedValueOnce(Result.ok(wrongWorkshopTicket)); // item 4: wrong workshop → conflict

      mockCheckinRecordsRepo.create
        .mockResolvedValueOnce(
          Result.ok({
            // item 1: synced
            checkinId: "ci-001",
            checkedInAt: new Date(),
          })
        )
        .mockResolvedValueOnce(Result.ok(null)); // item 2: skipped (duplicate)

      const items = [
        { qr_token: "qr-valid-123", timestamp: new Date() },
        { qr_token: "qr-valid-123", timestamp: new Date() }, // duplicate
        { qr_token: "qr-void-456", timestamp: new Date() }, // VOID
        { qr_token: "qr-other-789", timestamp: new Date() }, // wrong workshop
      ];

      const result = await service.processSyncBatch(
        items,
        "staff-001",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.synced_count).toBe(1);
      expect(result.data.skipped_count).toBe(1);
      expect(result.data.conflicts_count).toBe(2);
    });

    it("counts VOID ticket as conflict (FR-F07-004 business rule)", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(voidTicket));

      const result = await service.processSyncBatch(
        [{ qr_token: "qr-void-456", timestamp: new Date() }],
        "staff-001",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.conflicts_count).toBe(1);
      expect(result.data.synced_count).toBe(0);
      expect(mockCheckinRecordsRepo.create).not.toHaveBeenCalled();
    });

    it("counts wrong-workshop ticket as conflict", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(
        Result.ok(wrongWorkshopTicket)
      );

      const result = await service.processSyncBatch(
        [{ qr_token: "qr-other-789", timestamp: new Date() }],
        "staff-001",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.conflicts_count).toBe(1);
      expect(result.data.synced_count).toBe(0);
      expect(mockCheckinRecordsRepo.create).not.toHaveBeenCalled();
    });

    it("counts null ticket (not found) as conflict", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(null));

      const result = await service.processSyncBatch(
        [{ qr_token: "qr-nonexistent", timestamp: new Date() }],
        "staff-001",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.conflicts_count).toBe(1);
    });

    it("returns FailResult when ticket repo lookup fails", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.processSyncBatch(
        [{ qr_token: "qr-any", timestamp: new Date() }],
        "staff-001",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when checkin creation fails", async () => {
      mockTicketsRepo.findByQRToken.mockResolvedValue(Result.ok(validTicket));
      mockCheckinRecordsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.processSyncBatch(
        [{ qr_token: "qr-valid-123", timestamp: new Date() }],
        "staff-001",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("handles empty batch gracefully", async () => {
      const result = await service.processSyncBatch([], "staff-001", "w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.synced_count).toBe(0);
      expect(result.data.skipped_count).toBe(0);
      expect(result.data.conflicts_count).toBe(0);
    });
  });
});
