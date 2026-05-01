import { Test, type TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";

import { NOTIFICATION_QUEUE } from "@/shared/queues/queue.constants";
import { Result } from "@/shared/response/result";
import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "../repositories/notification-logs.repository";
import { NotificationsService } from "./notifications.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationLogsRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
};

const mockChannelConfigsRepo = {
  findAll: jest.fn(),
  update: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockLog = {
  notificationId: "notif-001",
  userId: "u-001",
  workshopId: "w-001",
  type: "REGISTRATION_CONFIRMED",
  channel: "EMAIL" as const,
  status: "PENDING" as const,
  payload: { recipient: "user@example.com" },
  sentAt: null,
  errorMessage: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const mockConfig = {
  channelType: "EMAIL" as const,
  isActive: true,
  configJson: { smtpHost: "smtp.example.com" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationLogsRepository,
          useValue: mockNotificationLogsRepo,
        },
        {
          provide: NotificationChannelConfigsRepository,
          useValue: mockChannelConfigsRepo,
        },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  // -----------------------------------------------------------------------
  // listLogs
  // -----------------------------------------------------------------------
  describe("listLogs", () => {
    it("returns paginated notification logs", async () => {
      mockNotificationLogsRepo.findMany.mockResolvedValue(
        Result.ok({ items: [mockLog], total: 1 })
      );

      const result = await service.listLogs(
        { status: "PENDING" },
        { page: 1, limit: 20 }
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    it("returns FailResult when repo query fails", async () => {
      mockNotificationLogsRepo.findMany.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.listLogs({}, { page: 1, limit: 20 });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getLogById
  // -----------------------------------------------------------------------
  describe("getLogById", () => {
    it("returns a single notification log when found", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));

      const result = await service.getLogById("notif-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.notification_id).toBe("notif-001");
    });

    it("returns NOTIFICATION_LOG_NOT_FOUND when log does not exist", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getLogById("nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("NOTIFICATION_LOG_NOT_FOUND");
    });

    it("returns FailResult when repo query fails", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.getLogById("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // listChannelConfigs
  // -----------------------------------------------------------------------
  describe("listChannelConfigs", () => {
    it("returns all channel configs", async () => {
      mockChannelConfigsRepo.findAll.mockResolvedValue(Result.ok([mockConfig]));

      const result = await service.listChannelConfigs();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // updateChannelConfig
  // -----------------------------------------------------------------------
  describe("updateChannelConfig", () => {
    it("updates channel config and returns it", async () => {
      const updated = { ...mockConfig, isActive: false };
      mockChannelConfigsRepo.update.mockResolvedValue(Result.ok(updated));

      const result = await service.updateChannelConfig("EMAIL", {
        is_active: false,
        config_json: undefined,
      });

      expect(result.isSuccess).toBe(true);
      expect(mockChannelConfigsRepo.update).toHaveBeenCalledWith("EMAIL", {
        isActive: false,
        configJson: undefined,
      });
    });
  });
});
