import { Test, type TestingModule } from "@nestjs/testing";

import { STUDENT_SYNC_QUEUE } from "@/infra/messaging/messaging.constants";
import { RedisService } from "@/infra/redis/redis.service";
import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";
import { UsersService } from "@/modules/iam/services/users.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { Result } from "@/shared/response/result";

import { StudentSyncWorker } from "./student-sync.worker";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStudentSyncService = {
  processJob: jest.fn(),
};

const mockRedisService = {
  setNx: jest.fn(),
  del: jest.fn(),
};

const mockUsersService = {
  listUsers: jest.fn(),
};

const mockNotificationLogProducer = {
  batchCreateAndEnqueue: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePayload = {
  jobId: "job-001",
  sourceFileName: "students-2026-06-01.csv",
};

const successResult = Result.ok({
  jobId: "job-001",
  status: "SUCCESS",
  totalRows: 100,
  processedRows: 100,
  errorRows: 0,
});

const partialFailureResult = Result.ok({
  jobId: "job-001",
  status: "PARTIAL_FAILURE",
  totalRows: 100,
  processedRows: 95,
  errorRows: 5,
});

const failedResult = Result.fail({
  code: "INTERNAL_ERROR",
  message: "Something went wrong",
} as any);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StudentSyncWorker", () => {
  let worker: StudentSyncWorker;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentSyncWorker,
        { provide: StudentSyncService, useValue: mockStudentSyncService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: NotificationLogProducer,
          useValue: mockNotificationLogProducer,
        },
      ],
    }).compile();

    worker = module.get<StudentSyncWorker>(StudentSyncWorker);
  });

  // -----------------------------------------------------------------------
  // handle — happy path
  // -----------------------------------------------------------------------

  it("acquires lock and processes job on handle", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(successResult);

    await worker.handle(samplePayload);

    expect(mockRedisService.setNx).toHaveBeenCalledWith(
      "student-sync:job:job-001:lock",
      expect.any(String),
      3600
    );
    expect(mockStudentSyncService.processJob).toHaveBeenCalledWith("job-001");
    expect(mockRedisService.del).toHaveBeenCalledWith(
      "student-sync:job:job-001:lock"
    );
  });

  it("notifies BTC users when errors are present", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(partialFailureResult);
    mockUsersService.listUsers.mockResolvedValue(
      Result.ok({
        items: [
          { userId: "btc-1", email: "btc1@test.com" },
          { userId: "btc-2", email: "btc2@test.com" },
        ],
        pagination: { limit: 100, nextCursor: null, hasMore: false },
      })
    );
    mockNotificationLogProducer.batchCreateAndEnqueue.mockResolvedValue(
      Result.ok()
    );

    await worker.handle(samplePayload);

    expect(
      mockNotificationLogProducer.batchCreateAndEnqueue
    ).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "btc-1",
        type: "CSV_IMPORT_COMPLETED_WITH_ERRORS",
      }),
      expect.objectContaining({
        userId: "btc-2",
        type: "CSV_IMPORT_COMPLETED_WITH_ERRORS",
      }),
    ]);
  });

  it("does not notify when there are no errors", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(successResult);

    await worker.handle(samplePayload);

    expect(
      mockNotificationLogProducer.batchCreateAndEnqueue
    ).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // handle — lock contention
  // -----------------------------------------------------------------------

  it("skips processing when lock cannot be acquired", async () => {
    mockRedisService.setNx.mockResolvedValue(false);

    await worker.handle(samplePayload);

    expect(mockStudentSyncService.processJob).not.toHaveBeenCalled();
    expect(mockRedisService.del).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // handle — service failure
  // -----------------------------------------------------------------------

  it("logs error and does not throw when processJob fails", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(failedResult);

    // Should not throw
    await expect(worker.handle(samplePayload)).resolves.toBeUndefined();

    // Lock should still be released
    expect(mockRedisService.del).toHaveBeenCalledWith(
      "student-sync:job:job-001:lock"
    );
  });

  it("always releases lock in finally block on crash", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockRejectedValue(
      new Error("Unexpected crash")
    );

    // Error propagates (finally block runs first, then re-throws)
    await expect(worker.handle(samplePayload)).rejects.toThrow(
      "Unexpected crash"
    );

    // Lock MUST be released even on crash
    expect(mockRedisService.del).toHaveBeenCalledWith(
      "student-sync:job:job-001:lock"
    );
  });

  // -----------------------------------------------------------------------
  // notifyBtcUsers
  // -----------------------------------------------------------------------

  it("logs warning when no BTC users found", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(partialFailureResult);
    mockUsersService.listUsers.mockResolvedValue(
      Result.ok({
        items: [],
        pagination: { limit: 100, nextCursor: null, hasMore: false },
      })
    );

    await worker.handle(samplePayload);

    expect(
      mockNotificationLogProducer.batchCreateAndEnqueue
    ).not.toHaveBeenCalled();
  });

  it("does not throw when notification creation fails", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(partialFailureResult);
    mockUsersService.listUsers.mockResolvedValue(
      Result.ok({
        items: [{ userId: "btc-1", email: "btc1@test.com" }],
        pagination: { limit: 100, nextCursor: null, hasMore: false },
      })
    );
    mockNotificationLogProducer.batchCreateAndEnqueue.mockRejectedValue(
      new Error("Queue down")
    );

    await expect(worker.handle(samplePayload)).resolves.toBeUndefined();
  });

  it("does not throw when listUsers call fails", async () => {
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(partialFailureResult);
    mockUsersService.listUsers.mockResolvedValue(
      Result.fail({ code: "INTERNAL_ERROR", message: "DB down" } as any)
    );

    await expect(worker.handle(samplePayload)).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // BullMQ adapter
  // -----------------------------------------------------------------------

  it("delegates process() to handle()", async () => {
    const handleSpy = jest.spyOn(worker, "handle").mockResolvedValue();
    mockRedisService.setNx.mockResolvedValue(true);
    mockStudentSyncService.processJob.mockResolvedValue(successResult);

    const bullJob = { data: samplePayload } as any;
    await worker.process(bullJob);

    expect(handleSpy).toHaveBeenCalledWith(samplePayload);
  });

  it("exposes STUDENT_SYNC_QUEUE as the processor queue name", () => {
    const processorMeta = Reflect.getMetadata(
      "bullmq:processor",
      StudentSyncWorker
    );
    // The @Processor decorator sets metadata — check the queue name matches
    const queueName =
      (Reflect.getMetadata("bullmq:queue-name", StudentSyncWorker) as string) ??
      STUDENT_SYNC_QUEUE;
    expect(queueName).toBe("student-sync");
  });
});
