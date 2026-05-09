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

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import {
  NOTIFICATION_QUEUE,
  STUDENT_SYNC_QUEUE,
} from "@/infra/messaging/queue.constants";
import { RedisService } from "@/infra/redis/redis.service";
import { StorageService } from "@/infra/storage/storage.service";
import { SystemAdminController } from "@/modules/background/controllers/system-admin.controller";
import { SystemMonitorService } from "@/modules/background/services/system-monitor.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { StudentSyncAdminController } from "@/modules/csv-sync/controllers/student-sync-admin.controller";
import { StudentSyncErrorsRepository } from "@/modules/csv-sync/repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "@/modules/csv-sync/repositories/student-sync-jobs.repository";
import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";
import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { StudentsRepository } from "@/modules/iam/repositories/students.repository";
import { UsersRepository } from "@/modules/iam/repositories/users.repository";
import { TokenService } from "@/modules/iam/services/token.service";
import { NotificationsAdminController } from "@/modules/notification/controllers/notifications-admin.controller";
import { NotificationChannelConfigsRepository } from "@/modules/notification/repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "@/modules/notification/repositories/notification-logs.repository";
import { NotificationsService } from "@/modules/notification/services/notifications.service";
import { CircuitBreakerMechanic } from "@/modules/payment/mechanics/circuit-breaker.mechanic";
import { PaymentReconciliationService } from "@/modules/payment/services/payment-reconciliation.service";
import { PaymentsService } from "@/modules/payment/services/payments.service";
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
  enqueue: jest.fn(),
};

const mockTokenService = {
  verifyAccessToken: jest.fn(),
};

const mockStudentsRepo = {
  findByStudentCode: jest.fn(),
  create: jest.fn(),
};

const mockUsersRepo = {
  findById: jest.fn(),
};

const mockStorageService = {
  getFileStream: jest.fn(),
};

const mockPaymentsService = {
  countPending: jest.fn(),
  countOverdue: jest.fn(),
};

const mockWorkshopsService = {
  getPublishedWorkshopsBasic: jest.fn(),
  getPublishedById: jest.fn(),
};

const mockCircuitBreakerMechanic = {
  getGatewayState: jest.fn(),
  reset: jest.fn(),
};

const mockPaymentReconciliationService = {
  reconcile: jest.fn(),
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
        { provide: TokenService, useValue: { verifyAccessToken: jest.fn() } },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockQueue },
        { provide: getQueueToken(STUDENT_SYNC_QUEUE), useValue: mockQueue },
        { provide: StudentsRepository, useValue: mockStudentsRepo },
        { provide: UsersRepository, useValue: mockUsersRepo },
        { provide: StorageService, useValue: mockStorageService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: WorkshopsService, useValue: mockWorkshopsService },
        {
          provide: CircuitBreakerMechanic,
          useValue: mockCircuitBreakerMechanic,
        },
        {
          provide: PaymentReconciliationService,
          useValue: mockPaymentReconciliationService,
        },
        { provide: MESSAGING_TOKEN.STUDENT_SYNC_QUEUE, useValue: mockQueue },
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
          { isActive: false }
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
        mockQueue.enqueue.mockResolvedValue(undefined);

        const result = await studentSyncAdminController.triggerSync({
          sourceFileName: "students_2026.csv",
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.jobId).toBe("job-001");
        expect(result.data.status).toBe("RUNNING");
        expect(mockSyncJobsRepo.create).toHaveBeenCalledWith({
          sourceFileName: "students_2026.csv",
        });
        // Should enqueue the job for background processing
        expect(mockQueue.enqueue).toHaveBeenCalled();
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
        mockPaymentsService.countPending.mockResolvedValue(Result.ok(10));
        mockPaymentsService.countOverdue.mockResolvedValue(Result.ok(5));
        mockRedisService.get.mockResolvedValue(null);

        const result = await systemAdminController.getPaymentTimeoutJobStatus();

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual(
          expect.objectContaining({
            pendingCount: expect.any(Number),
            timeoutCount: expect.any(Number),
            jobStatus: expect.any(String),
          })
        );
      });
    });

    describe("getReconciliationJobStatus", () => {
      it("returns reconciliation status", async () => {
        mockWorkshopsService.getPublishedWorkshopsBasic.mockResolvedValue(
          Result.ok([])
        );
        mockRedisService.get.mockResolvedValue(null);

        const result = await systemAdminController.getReconciliationJobStatus();

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual(
          expect.objectContaining({
            totalWorkshops: expect.any(Number),
            discrepanciesFound: expect.any(Number),
          })
        );
      });
    });

    describe("getCircuitBreakerStatus", () => {
      it("returns circuit breaker states for all gateways", async () => {
        mockCircuitBreakerMechanic.getGatewayState.mockReturnValue({
          state: "CLOSED" as const,
          failureCount: 0,
          totalCount: 0,
          windowStart: Date.now(),
          openedAt: 0,
          lastAttempt: 0,
          lastFailureAt: 0,
          halfOpenSuccessCount: 0,
        });

        const result = await systemAdminController.getCircuitBreakerStatus();

        expect(result.isSuccess).toBe(true);
        // Should return status for all known gateways (VNPAY, MOMO, STRIPE)
        expect(result.data).toHaveLength(3);
      });

      it("reports OPEN state gateways with recovery deadline", async () => {
        const openedAt = Date.now() - 10000;
        mockCircuitBreakerMechanic.getGatewayState.mockImplementation(
          (gateway: string) => {
            if (gateway === "VNPAY") {
              return {
                state: "OPEN" as const,
                failureCount: 5,
                totalCount: 5,
                windowStart: Date.now() - 60000,
                openedAt,
                lastAttempt: openedAt,
                lastFailureAt: openedAt,
                halfOpenSuccessCount: 0,
              };
            }
            return {
              state: "CLOSED" as const,
              failureCount: 0,
              totalCount: 0,
              windowStart: Date.now(),
              openedAt: 0,
              lastAttempt: 0,
              lastFailureAt: 0,
              halfOpenSuccessCount: 0,
            };
          }
        );

        const result = await systemAdminController.getCircuitBreakerStatus();

        expect(result.isSuccess).toBe(true);
        const vnpayStatus = result.data.find(
          (s: any) => s.gateway === "VNPAY"
        )!;
        expect(vnpayStatus.state).toBe("OPEN");
        expect(vnpayStatus.failureCount).toBe(5);
        expect(vnpayStatus.recoveryDeadline).toBeDefined();
      });
    });

    describe("resetCircuitBreaker", () => {
      it("resets a gateway circuit breaker to CLOSED", async () => {
        mockCircuitBreakerMechanic.reset.mockImplementation(() => {});
        mockCircuitBreakerMechanic.getGatewayState.mockReturnValue({
          state: "CLOSED" as const,
          failureCount: 0,
          totalCount: 0,
          windowStart: Date.now(),
          openedAt: 0,
          lastAttempt: Date.now(),
          lastFailureAt: 0,
          halfOpenSuccessCount: 0,
        });

        const result = await systemAdminController.resetCircuitBreaker("VNPAY");

        expect(result.isSuccess).toBe(true);
        expect(result.data.state).toBe("CLOSED");
        expect(result.data.failureCount).toBe(0);
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
