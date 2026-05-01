import { Test, type TestingModule } from "@nestjs/testing";

import { Result } from "@/shared/response/result";
import { EmailChannel } from "../channels/email.channel";
import { TelegramChannel } from "../channels/telegram.channel";
import { AppChannel } from "../channels/app.channel";
import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "../repositories/notification-logs.repository";
import { NotificationDispatchService } from "./notification-dispatch.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationLogsRepo = {
  findById: jest.fn(),
  updateStatus: jest.fn(),
};

const mockChannelConfigsRepo = {
  findByChannelType: jest.fn(),
};

const mockEmailChannel = {
  channelType: "EMAIL" as const,
  send: jest.fn(),
};

const mockTelegramChannel = {
  channelType: "TELEGRAM" as const,
  send: jest.fn(),
};

const mockAppChannel = {
  channelType: "APP" as const,
  send: jest.fn(),
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
  payload: { recipient: "user@example.com", subject: "Welcome" },
  sentAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
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

describe("NotificationDispatchService", () => {
  let service: NotificationDispatchService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        {
          provide: NotificationLogsRepository,
          useValue: mockNotificationLogsRepo,
        },
        {
          provide: NotificationChannelConfigsRepository,
          useValue: mockChannelConfigsRepo,
        },
        { provide: EmailChannel, useValue: mockEmailChannel },
        { provide: TelegramChannel, useValue: mockTelegramChannel },
        { provide: AppChannel, useValue: mockAppChannel },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(
      NotificationDispatchService
    );
  });

  // -----------------------------------------------------------------------
  // dispatch — FR-F08-002
  // -----------------------------------------------------------------------
  describe("dispatch — FR-F08-002", () => {
    it("sends notification via active channel and updates status to SENT", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok(mockConfig)
      );
      mockEmailChannel.send.mockResolvedValue(Result.ok());
      mockNotificationLogsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockLog)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isSuccess).toBe(true);
      expect(mockEmailChannel.send).toHaveBeenCalledWith(
        "user@example.com",
        mockLog.payload,
        mockConfig.configJson
      );
      expect(mockNotificationLogsRepo.updateStatus).toHaveBeenCalledWith(
        "notif-001",
        "SENT",
        expect.any(Date)
      );
    });

    it("returns NOTIFICATION_LOG_NOT_FOUND when log does not exist", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("NOTIFICATION_LOG_NOT_FOUND");
      expect(mockNotificationLogsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("returns NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND when config is missing", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok(null)
      );
      mockNotificationLogsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockLog)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND");
      expect(mockNotificationLogsRepo.updateStatus).toHaveBeenCalledWith(
        "notif-001",
        "FAILED",
        undefined,
        "Channel config not found for EMAIL"
      );
    });

    it("returns NOTIFICATION_CHANNEL_INACTIVE when channel is disabled", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok({ ...mockConfig, isActive: false })
      );
      mockNotificationLogsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockLog)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("NOTIFICATION_CHANNEL_INACTIVE");
      expect(mockNotificationLogsRepo.updateStatus).toHaveBeenCalledWith(
        "notif-001",
        "FAILED",
        undefined,
        "Channel is inactive"
      );
    });

    it("returns NOTIFICATION_CHANNEL_UNKNOWN for unrecognized channel type", async () => {
      const unknownLog = {
        ...mockLog,
        channel: "SMS" as any,
      };
      mockNotificationLogsRepo.findById.mockResolvedValue(
        Result.ok(unknownLog)
      );
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok(mockConfig)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("NOTIFICATION_CHANNEL_UNKNOWN");
    });

    it("returns FailResult when channel send fails (SMTP timeout scenario)", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok(mockConfig)
      );
      mockEmailChannel.send.mockResolvedValue(
        Result.fail({
          code: "INTERNAL_ERROR",
          message: "SMTP connection timeout",
        })
      );
      mockNotificationLogsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockLog)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain("SMTP connection timeout");
      expect(mockNotificationLogsRepo.updateStatus).toHaveBeenCalledWith(
        "notif-001",
        "FAILED",
        undefined,
        "SMTP connection timeout"
      );
    });

    it("propagates error from findById repo failure", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("propagates error from findByChannelType repo failure", async () => {
      mockNotificationLogsRepo.findById.mockResolvedValue(Result.ok(mockLog));
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.dispatch("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("uses userId as recipient when payload has no recipient field", async () => {
      const logWithoutRecipient = {
        ...mockLog,
        payload: { subject: "No recipient field" },
      };
      mockNotificationLogsRepo.findById.mockResolvedValue(
        Result.ok(logWithoutRecipient)
      );
      mockChannelConfigsRepo.findByChannelType.mockResolvedValue(
        Result.ok(mockConfig)
      );
      mockEmailChannel.send.mockResolvedValue(Result.ok());
      mockNotificationLogsRepo.updateStatus.mockResolvedValue(
        Result.ok(mockLog)
      );

      const result = await service.dispatch("notif-001");

      expect(result.isSuccess).toBe(true);
      expect(mockEmailChannel.send).toHaveBeenCalledWith(
        "u-001",
        logWithoutRecipient.payload,
        mockConfig.configJson
      );
    });
  });
});
