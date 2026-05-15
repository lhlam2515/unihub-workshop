import { Test, type TestingModule } from "@nestjs/testing";

import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import { Result } from "@/shared/response/result";

import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "../repositories/notification-logs.repository";

import { NotificationLogProducer } from "./notification-log-producer.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationLogsRepo = {
  create: jest.fn(),
};

const mockChannelConfigsRepo = {
  findActiveChannels: jest.fn(),
};

const mockQueue = {
  enqueue: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockLogResult = {
  notificationId: "notif-001",
  userId: "u-001",
  workshopId: "w-001",
  type: "REGISTRATION_CONFIRMED" as const,
  channel: "APP" as const,
  status: "PENDING" as const,
  payload: {},
  sentAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEmailLogResult = {
  ...mockLogResult,
  notificationId: "notif-002",
  channel: "EMAIL" as const,
};

const mockAppConfig = {
  channelConfigId: "cfg-app",
  channelType: "APP" as const,
  isActive: true,
  configJson: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEmailConfig = {
  channelConfigId: "cfg-email",
  channelType: "EMAIL" as const,
  isActive: true,
  configJson: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("NotificationLogProducer", () => {
  let producer: NotificationLogProducer;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationLogProducer,
        {
          provide: NotificationLogsRepository,
          useValue: mockNotificationLogsRepo,
        },
        {
          provide: NotificationChannelConfigsRepository,
          useValue: mockChannelConfigsRepo,
        },
        {
          provide: MESSAGING_TOKEN.NOTIFICATION_QUEUE,
          useValue: mockQueue,
        },
      ],
    }).compile();

    producer = module.get<NotificationLogProducer>(NotificationLogProducer);
  });

  // -----------------------------------------------------------------------
  // createAndEnqueue — explicit channel (backward compat)
  // -----------------------------------------------------------------------
  describe("createAndEnqueue with explicit channel", () => {
    it("creates 1 log and enqueues 1 job for the specified channel", async () => {
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.ok(mockLogResult)
      );
      mockQueue.enqueue.mockResolvedValue({ id: "job-1" });

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
        channel: "EMAIL",
        payload: { subject: "Welcome" },
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ notificationId: "notif-001" });
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "EMAIL",
          type: "REGISTRATION_CONFIRMED",
        })
      );
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        "notification.send",
        expect.objectContaining({ channel: "EMAIL" })
      );
    });

    it("does not call findActiveChannels when channel is specified", async () => {
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.ok(mockLogResult)
      );

      await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
        channel: "APP",
      });

      expect(mockChannelConfigsRepo.findActiveChannels).not.toHaveBeenCalled();
    });

    it("propagates repo failure", async () => {
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.fail({
          code: "INTERNAL_ERROR",
          category: "INTERNAL",
          message: "DB down",
        })
      );

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
        channel: "APP",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // createAndEnqueue — fan-out (no channel)
  // -----------------------------------------------------------------------
  describe("createAndEnqueue fan-out (no channel)", () => {
    it("creates 1 log per active channel and enqueues 1 job each", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([mockAppConfig, mockEmailConfig])
      );
      mockNotificationLogsRepo.create
        .mockResolvedValueOnce(Result.ok(mockLogResult))
        .mockResolvedValueOnce(Result.ok(mockEmailLogResult));
      mockQueue.enqueue.mockResolvedValue({ id: "job-1" });

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
        payload: { registrationId: "reg-1" },
      });

      expect(result.isSuccess).toBe(true);
      expect(mockChannelConfigsRepo.findActiveChannels).toHaveBeenCalledTimes(
        1
      );
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationLogsRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ channel: "APP" })
      );
      expect(mockNotificationLogsRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ channel: "EMAIL" })
      );
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(2);
    });

    it("returns OkResult with sentinel ID when no active channels", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([])
      );

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        notificationId: "skipped-no-active-channels",
      });
      expect(mockNotificationLogsRepo.create).not.toHaveBeenCalled();
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it("propagates findActiveChannels failure", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.fail({
          code: "INTERNAL_ERROR",
          category: "INTERNAL",
          message: "DB down",
        })
      );

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
      });

      expect(result.isFailure).toBe(true);
    });

    it("succeeds partially when one channel fails to create", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([mockAppConfig, mockEmailConfig])
      );
      mockNotificationLogsRepo.create
        .mockResolvedValueOnce(Result.ok(mockLogResult))
        .mockResolvedValueOnce(
          Result.fail({
            code: "INTERNAL_ERROR",
            category: "INTERNAL",
            message: "DB error",
          })
        );
      mockQueue.enqueue.mockResolvedValue({ id: "job-1" });

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
      });

      expect(result.isSuccess).toBe(true);
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledTimes(2);
    });

    it("does not crash when queue enqueue rejects", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([mockAppConfig])
      );
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.ok(mockLogResult)
      );
      mockQueue.enqueue.mockRejectedValue(new Error("Redis down"));

      const result = await producer.createAndEnqueue({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
      });

      // enqueue rejection is caught by .catch(), no crash
      expect(result.isSuccess).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // batchCreateAndEnqueue
  // -----------------------------------------------------------------------
  describe("batchCreateAndEnqueue", () => {
    it("expands items without channel across active channels", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([mockAppConfig, mockEmailConfig])
      );
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.ok(mockLogResult)
      );
      mockQueue.enqueue.mockResolvedValue({ id: "job-1" });

      const result = await producer.batchCreateAndEnqueue([
        {
          userId: "u-001",
          type: "WORKSHOP_CANCELLED",
          payload: { title: "WS" },
        },
        {
          userId: "u-002",
          type: "WORKSHOP_CANCELLED",
          payload: { title: "WS" },
        },
      ]);

      expect(result.isSuccess).toBe(true);
      // 2 items × 2 channels = 4 logs
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledTimes(4);
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(4);
    });

    it("keeps items with explicit channel as single (no expansion)", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([mockAppConfig, mockEmailConfig])
      );
      mockNotificationLogsRepo.create.mockResolvedValue(
        Result.ok(mockLogResult)
      );
      mockQueue.enqueue.mockResolvedValue({ id: "job-1" });

      const result = await producer.batchCreateAndEnqueue([
        {
          userId: "u-001",
          type: "CSV_IMPORT_COMPLETED_WITH_ERRORS",
          channel: "APP",
        },
      ]);

      expect(result.isSuccess).toBe(true);
      // 1 item with explicit channel = 1 log
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "APP" })
      );
    });

    it("returns OkResult when no active channels", async () => {
      mockChannelConfigsRepo.findActiveChannels.mockResolvedValue(
        Result.ok([])
      );

      const result = await producer.batchCreateAndEnqueue([
        { userId: "u-001", type: "WORKSHOP_CANCELLED" },
      ]);

      expect(result.isSuccess).toBe(true);
      expect(mockNotificationLogsRepo.create).not.toHaveBeenCalled();
    });
  });
});
