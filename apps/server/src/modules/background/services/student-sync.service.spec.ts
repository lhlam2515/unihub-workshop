import { Test, type TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue } from "bullmq";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { STUDENT_SYNC_QUEUE } from "@/shared/queues/queue.constants";
import { Result } from "@/shared/response/result";
import { StudentSyncErrorsRepository } from "../repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "../repositories/student-sync-jobs.repository";
import { StudentSyncService } from "./student-sync.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStudentSyncJobsRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findMany: jest.fn(),
};

const mockStudentSyncErrorsRepo = {
  createBatch: jest.fn(),
  findByJobId: jest.fn(),
};

const mockDb = {
  insert: jest.fn(),
};

const mockSchema = {
  students: {
    studentCode: "studentCode",
  },
};

const mockQueue = {
  add: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockJobRecord = {
  jobId: "job-001",
  sourceFileName: "students-2026-06-01.csv",
  status: "RUNNING",
  totalRows: null,
  processedRows: null,
  errorRows: null,
  triggeredAt: new Date("2026-06-01T00:00:00Z"),
  completedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const validRow = {
  student_code: "STU001",
  email: "stu001@university.edu",
  full_name: "John Doe",
  faculty: "Engineering",
  class_year: 2024,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StudentSyncService", () => {
  let service: StudentSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentSyncService,
        {
          provide: StudentSyncJobsRepository,
          useValue: mockStudentSyncJobsRepo,
        },
        {
          provide: StudentSyncErrorsRepository,
          useValue: mockStudentSyncErrorsRepo,
        },
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
        { provide: getQueueToken(STUDENT_SYNC_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<StudentSyncService>(StudentSyncService);
  });

  // -----------------------------------------------------------------------
  // triggerSync — FR-F09-001
  // -----------------------------------------------------------------------
  describe("triggerSync — FR-F09-001", () => {
    it("creates a job record and enqueues a BullMQ job", async () => {
      mockStudentSyncJobsRepo.create.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockQueue.add.mockResolvedValue({} as any);

      const result = await service.triggerSync("students-2026-06-01.csv");

      expect(result.isSuccess).toBe(true);
      expect(result.data.jobId).toBe("job-001");
      expect(result.data.status).toBe("RUNNING");
      expect(mockStudentSyncJobsRepo.create).toHaveBeenCalledWith({
        sourceFileName: "students-2026-06-01.csv",
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        "student-sync",
        { jobId: "job-001", sourceFileName: "students-2026-06-01.csv" },
        { jobId: "job-001" }
      );
    });

    it("returns FailResult when job creation fails", async () => {
      mockStudentSyncJobsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.triggerSync("students.csv");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // processJob — FR-F09-002
  // -----------------------------------------------------------------------
  describe("processJob — FR-F09-002", () => {
    it("finalizes with SUCCESS when all rows are valid", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "SUCCESS" })
      );

      // parseCSV returns empty array in stub → no rows to process
      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SUCCESS");
      expect(result.data.totalRows).toBe(0);
      expect(result.data.processedRows).toBe(0);
      expect(result.data.errorRows).toBe(0);
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenCalledWith(
        "job-001",
        "SUCCESS",
        expect.objectContaining({
          totalRows: 0,
          processedRows: 0,
          errorRows: 0,
        })
      );
    });

    it("returns FAILED when job is not found", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.processJob("nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when findById repo fails", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // validateRow — validation rules
  // -----------------------------------------------------------------------
  describe("validateRow", () => {
    it("detects MISSING_FIELD for empty student_code", () => {
      // Access private method via service prototype
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow({ email: "test@test.com", full_name: "Test" });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "MISSING_FIELD: student_code is required"
      );
    });

    it("detects INVALID_FORMAT for student_code exceeding 20 characters", () => {
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow({
        student_code: "A".repeat(21),
        email: "test@test.com",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "INVALID_FORMAT: student_code exceeds 20 characters"
      );
    });

    it("detects MISSING_FIELD for empty email", () => {
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow({
        student_code: "STU001",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("MISSING_FIELD: email is required");
    });

    it("detects INVALID_FORMAT for malformed email", () => {
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow({
        student_code: "STU001",
        email: "not-an-email",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "INVALID_FORMAT: email is not a valid email address"
      );
    });

    it("detects MISSING_FIELD for empty full_name", () => {
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow({
        student_code: "STU001",
        email: "test@test.com",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("MISSING_FIELD: full_name is required");
    });

    it("returns valid for a correct row", () => {
      const validateRow = (StudentSyncService.prototype as any).validateRow;

      const result = validateRow(validRow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getJob
  // -----------------------------------------------------------------------
  describe("getJob", () => {
    it("returns the job when found", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );

      const result = await service.getJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockJobRecord);
    });

    it("returns FailResult (INTERNAL_ERROR) when job is not found", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getJob("nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when repo fails", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.getJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // getJobErrors
  // -----------------------------------------------------------------------
  describe("getJobErrors", () => {
    it("returns paginated errors for a job", async () => {
      mockStudentSyncErrorsRepo.findByJobId.mockResolvedValue(
        Result.ok({ items: [], total: 0 })
      );

      const result = await service.getJobErrors("job-001", {
        page: 1,
        limit: 20,
      });

      expect(result.isSuccess).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // listJobs
  // -----------------------------------------------------------------------
  describe("listJobs", () => {
    it("returns paginated job list", async () => {
      mockStudentSyncJobsRepo.findMany.mockResolvedValue(
        Result.ok({ items: [mockJobRecord], total: 1 })
      );

      const result = await service.listJobs({ page: 1, limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });
  });
});
