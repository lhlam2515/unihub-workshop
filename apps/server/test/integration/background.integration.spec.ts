/**
 * Background Module — Integration Tests
 *
 * Tests NotificationsAdminController, StudentSyncAdminController,
 * and SystemAdminController with all dependencies mocked.
 *
 * FR references:
 * - FR-F08-001: Enqueue Notification Event
 * - FR-F08-002: Dispatch Notification (Notification Worker)
 * - FR-F09-001: Trigger Student CSV Import Job
 * - FR-F09-002: Parse CSV and Upsert Student Records
 * - FR-F10-001: Detect and Process Payment Timeouts
 * - BR-025: Circuit Breaker state transitions
 */
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import {
  NOTIFICATION_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "@/infra/messaging/queue.constants";
import { RedisService } from "@/infra/redis/redis.service";
import { NotificationsAdminController } from "@/modules/background/controllers/notifications-admin.controller";
import { StudentSyncAdminController } from "@/modules/background/controllers/student-sync-admin.controller";
import { SystemAdminController } from "@/modules/background/controllers/system-admin.controller";
import { NotificationChannelConfigsRepository } from "@/modules/background/repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "@/modules/background/repositories/notification-logs.repository";
import { StudentSyncErrorsRepository } from "@/modules/background/repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "@/modules/background/repositories/student-sync-jobs.repository";
import { NotificationsService } from "@/modules/background/services/notifications.service";
import { StudentSyncService } from "@/modules/background/services/student-sync.service";
import { SystemMonitorService } from "@/modules/background/services/system-monitor.service";
import { Result } from "@/shared/response/result";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationLogsRepo = {
  findMany: jest.fn(),
  findById: jest.fn(),
};

const mockChannelConfigsRepo = {
  findAll: jest.fn(),
  update: jest.fn(),
};

const mockSyncJobsRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
  updateStatus: jest.fn(),
};

const mockSyncErrorsRepo = {
  findByJobId: jest.fn(),
  createBatch: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  hGetAll: jest.fn(),
  hSet: jest.fn(),
  scanKeys: jest.fn(),
};

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
};

const mockSchema = {
  payments: {},
  workshops: {},
  workshopSlots: {},
  students: {},
};

const mockQueue = {
  add: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const notificationLog = {
  logId: "log-001",
  userId: "usr-001",
  type: "REGISTRATION_CONFIRMED",
  channel: "EMAIL",
  status: "SENT",
  sentAt: new Date(),
  payload: {},
};

const channelConfig = {
  channelType: "EMAIL",
  isActive: true,
  configJson: { smtp_host: "smtp.example.com" },
  updatedAt: new Date(),
};

const syncJob = {
  jobId: "job-001",
  sourceFileName: "students_2026.csv",
  status: "RUNNING",
  triggeredAt: new Date(),
  totalRows: null,
  processedRows: null,
  errorRows: null,
  completedAt: null,
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

describe("Background Module — Integration", () => {
  let notificationsAdminController: NotificationsAdminController;
  let studentSyncAdminController: StudentSyncAdminController;
  let systemAdminController: SystemAdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [
        NotificationsAdminController,
        StudentSyncAdminController,
        SystemAdminController,
      ],
      providers: [
        NotificationsService,
        StudentSyncService,
        SystemMonitorService,
        {
          provide: NotificationLogsRepository,
          useValue: mockNotificationLogsRepo,
        },
        {
          provide: NotificationChannelConfigsRepository,
          useValue: mockChannelConfigsRepo,
        },
        { provide: StudentSyncJobsRepository, useValue: mockSyncJobsRepo },
        { provide: StudentSyncErrorsRepository, useValue: mockSyncErrorsRepo },
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockQueue },
        { provide: getQueueToken(STUDENT_SYNC_QUEUE), useValue: mockQueue },
        provideMockGuard(),
        provideMockRolesGuard(),
      ],
    }).compile();

    notificationsAdminController = module.get<NotificationsAdminController>(
      NotificationsAdminController
    );
    studentSyncAdminController = module.get<StudentSyncAdminController>(
      StudentSyncAdminController
    );
    systemAdminController = module.get<SystemAdminController>(
      SystemAdminController
    );
  });

  // -------------------------------------------------------------------------
  // NotificationsAdminController — FR-F08-001, FR-F08-002
  // -------------------------------------------------------------------------
  describe("NotificationsAdminController", () => {
    describe("listLogs", () => {
      it("returns paginated notification logs with filters", async () => {
        mockNotificationLogsRepo.findMany.mockResolvedValue(
          Result.ok({ items: [notificationLog], total: 1 })
        );

        const result = await notificationsAdminController.listLogs({
          status: "SENT",
          channel: "EMAIL",
          type: "REGISTRATION_CONFIRMED",
          page: 1,
          limit: 20,
        });

        expect(result.isSuccess).toBe(true);
        expect(mockNotificationLogsRepo.findMany).toHaveBeenCalledWith(
          {
            status: "SENT",
            channel: "EMAIL",
            type: "REGISTRATION_CONFIRMED",
            userId: undefined,
            workshopId: undefined,
          },
          { page: 1, limit: 20 }
        );
      });

      it("returns empty list when no logs match filters", async () => {
        mockNotificationLogsRepo.findMany.mockResolvedValue(
          Result.ok({ items: [], total: 0 })
        );

        const result = await notificationsAdminController.listLogs({
          page: 1,
          limit: 20,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(0);
        expect(result.data.total).toBe(0);
      });
    });

    describe("getLogById", () => {
      it("returns a single notification log", async () => {
        mockNotificationLogsRepo.findById.mockResolvedValue(
          Result.ok(notificationLog)
        );

        const result = await notificationsAdminController.getLogById("log-001");

        expect(result.isSuccess).toBe(true);
        expect(mockNotificationLogsRepo.findById).toHaveBeenCalledWith(
          "log-001"
        );
      });
    });

    describe("listChannelConfigs", () => {
      it("returns all channel configurations", async () => {
        mockChannelConfigsRepo.findAll.mockResolvedValue(
          Result.ok([channelConfig])
        );

        const result = await notificationsAdminController.listChannelConfigs();

        expect(result.isSuccess).toBe(true);
        expect(mockChannelConfigsRepo.findAll).toHaveBeenCalled();
      });
    });

    describe("updateChannelConfig", () => {
      it("updates a channel configuration", async () => {
        mockChannelConfigsRepo.update.mockResolvedValue(
          Result.ok({ ...channelConfig, isActive: false })
        );

        const result = await notificationsAdminController.updateChannelConfig(
          "EMAIL",
          { is_active: false }
        );

        expect(result.isSuccess).toBe(true);
        expect(mockChannelConfigsRepo.update).toHaveBeenCalledWith("EMAIL", {
          isActive: false,
          configJson: undefined,
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // StudentSyncAdminController — FR-F09-001
  // -------------------------------------------------------------------------
  describe("StudentSyncAdminController — FR-F09-001", () => {
    describe("triggerSync", () => {
      it("triggers a sync job and enqueues it", async () => {
        mockSyncJobsRepo.create.mockResolvedValue(Result.ok(syncJob));
        mockQueue.add.mockResolvedValue(undefined);

        const result = await studentSyncAdminController.triggerSync({
          source_file_name: "students_2026.csv",
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.jobId).toBe("job-001");
        expect(result.data.status).toBe("RUNNING");
        expect(mockSyncJobsRepo.create).toHaveBeenCalledWith({
          sourceFileName: "students_2026.csv",
        });
        // Should enqueue the job for background processing
        expect(mockQueue.add).toHaveBeenCalled();
      });
    });

    describe("listJobs", () => {
      it("returns paginated sync jobs", async () => {
        mockSyncJobsRepo.findMany.mockResolvedValue(
          Result.ok({ items: [syncJob], total: 1 })
        );

        const result = await studentSyncAdminController.listJobs({
          page: 1,
          limit: 20,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(mockSyncJobsRepo.findMany).toHaveBeenCalledWith({
          page: 1,
          limit: 20,
        });
      });
    });

    describe("getJobStatus", () => {
      it("returns status of a sync job", async () => {
        mockSyncJobsRepo.findById.mockResolvedValue(Result.ok(syncJob));

        const result = await studentSyncAdminController.getJobStatus("job-001");

        expect(result.isSuccess).toBe(true);
        expect(result.data.jobId).toBe("job-001");
        expect(mockSyncJobsRepo.findById).toHaveBeenCalledWith("job-001");
      });
    });

    describe("getJobErrors", () => {
      it("returns paginated errors for a sync job", async () => {
        mockSyncErrorsRepo.findByJobId.mockResolvedValue(
          Result.ok({
            items: [
              {
                errorId: "err-001",
                jobId: "job-001",
                rowNumber: 5,
                errorReason: "MISSING_FIELD",
                errorDetail: "student_code is required",
              },
            ],
            total: 1,
          })
        );

        const result = await studentSyncAdminController.getJobErrors(
          "job-001",
          { page: 1, limit: 20 }
        );

        expect(result.isSuccess).toBe(true);
        expect(mockSyncErrorsRepo.findByJobId).toHaveBeenCalledWith("job-001", {
          page: 1,
          limit: 20,
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // SystemAdminController — FR-F10-001
  // -------------------------------------------------------------------------
  describe("SystemAdminController — FR-F10-001", () => {
    describe("getPaymentTimeoutJobStatus", () => {
      it("returns payment timeout job status with counts", async () => {
        // mockDb.select chain
        const mockWhere = jest.fn().mockResolvedValue([{ count: 10 }]);
        mockDb.select.mockReturnValue({
          from: () => ({ where: mockWhere }),
        });

        const result = await systemAdminController.getPaymentTimeoutJobStatus();

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual(
          expect.objectContaining({
            pending_count: expect.any(Number),
            timeout_count: expect.any(Number),
            job_status: expect.any(String),
          })
        );
      });
    });

    describe("getReconciliationJobStatus", () => {
      it("returns reconciliation status", async () => {
        const mockWhere = jest.fn().mockResolvedValue([]);
        mockDb.select.mockReturnValue({
          from: () => ({ where: mockWhere }),
        });

        const result = await systemAdminController.getReconciliationJobStatus();

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual(
          expect.objectContaining({
            total_workshops: expect.any(Number),
            discrepancies_found: expect.any(Number),
          })
        );
      });
    });

    describe("getCircuitBreakerStatus", () => {
      it("returns circuit breaker states for all gateways", async () => {
        mockRedisService.hGetAll.mockResolvedValue({
          state: "CLOSED",
          failure_count: "0",
        });

        const result = await systemAdminController.getCircuitBreakerStatus();

        expect(result.isSuccess).toBe(true);
        // Should return status for all known gateways (VNPAY, MOMO, STRIPE)
        expect(result.data).toHaveLength(3);
      });

      it("reports OPEN state gateways with recovery deadline", async () => {
        const openedAt = new Date(Date.now() - 10000).toISOString();
        mockRedisService.hGetAll.mockImplementation((key: string) => {
          if (key.includes("VNPAY")) {
            return Promise.resolve({
              state: "OPEN",
              failure_count: "5",
              opened_at: openedAt,
              last_attempt: openedAt,
            });
          }
          return Promise.resolve({
            state: "CLOSED",
            failure_count: "0",
          });
        });

        const result = await systemAdminController.getCircuitBreakerStatus();

        expect(result.isSuccess).toBe(true);
        const vnpayStatus = result.data.find(
          (s: any) => s.gateway === "VNPAY"
        )!;
        expect(vnpayStatus.state).toBe("OPEN");
        expect(vnpayStatus.failure_count).toBe(5);
        expect(vnpayStatus.recovery_deadline).toBeDefined();
      });
    });

    describe("resetCircuitBreaker", () => {
      it("resets a gateway circuit breaker to CLOSED", async () => {
        mockRedisService.hSet.mockResolvedValue(1);

        const result = await systemAdminController.resetCircuitBreaker("VNPAY");

        expect(result.isSuccess).toBe(true);
        expect(result.data.state).toBe("CLOSED");
        expect(result.data.failure_count).toBe(0);
      });

      it("handles unknown gateway gracefully", async () => {
        const result =
          await systemAdminController.resetCircuitBreaker("UNKNOWN");

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe("INTERNAL_ERROR");
      });
    });
  });
});
