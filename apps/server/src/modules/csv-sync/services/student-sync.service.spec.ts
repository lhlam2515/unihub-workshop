import { Readable } from "node:stream";

import { Test, type TestingModule } from "@nestjs/testing";

import { BullMQAdapter } from "@/infra/messaging/bullmq.adapter";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import { StorageService } from "@/infra/storage/storage.service";
import { StudentsRepository } from "@/modules/iam/repositories/students.repository";
import { UsersRepository } from "@/modules/iam/repositories/users.repository";
import { storageErrors, systemErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { StudentSyncService } from "./student-sync.service";
import { StudentSyncErrorsRepository } from "../repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "../repositories/student-sync-jobs.repository";

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

const mockStudentsRepo = {
  upsert: jest.fn(),
};

const mockUsersRepo = {
  findById: jest.fn(),
};

const mockStorageService = {
  getFileStream: jest.fn(),
  uploadText: jest.fn(),
};

const mockQueue = { add: jest.fn() };
let adapter: BullMQAdapter;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockJobRecord = {
  jobId: "job-001",
  sourceFileName: "students-2026-06-01.csv",
  triggeredBy: "MANUAL",
  status: "RUNNING",
  totalRows: null,
  processedRows: null,
  errorRows: null,
  triggeredAt: new Date("2026-06-01T00:00:00Z"),
  completedAt: null,
  errorLogUrl: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const validRow = {
  student_code: "SV12345678",
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
    mockStorageService.uploadText.mockResolvedValue(
      Result.ok("https://storage.example.com/errors/test.csv")
    );
    mockStudentSyncErrorsRepo.createBatch.mockResolvedValue(Result.ok([]));
    mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
    adapter = new BullMQAdapter(mockQueue as any);
    jest.spyOn(adapter, "enqueue");

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
        {
          provide: StudentsRepository,
          useValue: mockStudentsRepo,
        },
        {
          provide: UsersRepository,
          useValue: mockUsersRepo,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        { provide: MESSAGING_TOKEN.STUDENT_SYNC_QUEUE, useValue: adapter },
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
      const result = await service.triggerSync("students-2026-06-01.csv");

      expect(result.isSuccess).toBe(true);
      expect(result.data.jobId).toBe("job-001");
      expect(result.data.status).toBe("RUNNING");
      expect(mockStudentSyncJobsRepo.create).toHaveBeenCalledWith({
        sourceFileName: "students-2026-06-01.csv",
        triggeredBy: "MANUAL",
      });
      expect(adapter.enqueue).toHaveBeenCalledWith("student-sync", {
        jobId: "job-001",
        sourceFileName: "students-2026-06-01.csv",
      });
    });

    it("returns FailResult when job creation fails", async () => {
      mockStudentSyncJobsRepo.create.mockResolvedValue(
        Result.fail(systemErrors.internal(new Error("DB down")))
      );

      const result = await service.triggerSync("students.csv");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(adapter.enqueue).not.toHaveBeenCalled();
    });

    it("marks the job as FAILED when queue enqueue fails", async () => {
      mockStudentSyncJobsRepo.create.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockQueue.add.mockRejectedValue(new Error("Redis down"));
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "FAILED" })
      );

      const result = await service.triggerSync("students-2026-06-01.csv");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenCalledWith(
        "job-001",
        "FAILED"
      );
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
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "SUCCESS" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SUCCESS");
      expect(result.data.totalRows).toBe(1);
      expect(result.data.processedRows).toBe(1);
      expect(result.data.errorRows).toBe(0);
      expect(mockStudentsRepo.upsert).toHaveBeenCalledWith({
        studentId: "SV12345678",
        fullName: "John Doe",
        email: "stu001@university.edu",
      });
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenNthCalledWith(
        2,
        "job-001",
        "SUCCESS",
        expect.objectContaining({
          totalRows: 1,
          processedRows: 1,
          errorRows: 0,
        })
      );
    });

    it("finalizes with PARTIAL_FAILURE when some rows are invalid", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
              ",invalid-email,Missing Code,Engineering,2024",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "PARTIAL_FAILURE" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("PARTIAL_FAILURE");
      expect(result.data.totalRows).toBe(2);
      expect(result.data.processedRows).toBe(1);
      expect(result.data.errorRows).toBe(1);
      expect(mockStudentSyncErrorsRepo.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            jobId: "job-001",
            rowNumber: 2,
            errorReason: "MISSING_FIELD",
          }),
        ])
      );
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenCalledWith(
        "job-001",
        "PARTIAL_FAILURE",
        expect.objectContaining({
          totalRows: 2,
          processedRows: 1,
          errorRows: 1,
        })
      );
    });

    it("finalizes with FAILED when all rows are invalid", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              ",bad-email,Missing Code,Engineering,2024",
              "SV87654321,not-an-email,Jane Doe,Science,2025",
            ].join("\n"),
          ])
        )
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "FAILED" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("FAILED");
      expect(result.data.totalRows).toBe(2);
      expect(result.data.processedRows).toBe(0);
      expect(result.data.errorRows).toBe(2);
      expect(mockStudentsRepo.upsert).not.toHaveBeenCalled();
      expect(mockStudentSyncErrorsRepo.createBatch).toHaveBeenCalledTimes(1);
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenCalledWith(
        "job-001",
        "FAILED",
        expect.objectContaining({
          totalRows: 2,
          processedRows: 0,
          errorRows: 2,
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
        Result.fail(systemErrors.internal(new Error("DB down")))
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when CSV file cannot be loaded", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockStorageService.getFileStream.mockResolvedValue(
        Result.fail(storageErrors.fileNotFound("students-2026-06-01.csv"))
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("STORAGE_FILE_NOT_FOUND");
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenCalledWith(
        "job-001",
        "FAILED"
      );
    });

    it("returns FailResult when required CSV headers are missing", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,faculty,class_year",
              "SV12345678,stu001@university.edu,Engineering,2024",
            ].join("\n"),
          ])
        )
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenNthCalledWith(
        2,
        "job-001",
        "FAILED",
        expect.objectContaining({
          totalRows: 0,
          processedRows: 0,
          errorRows: 0,
        })
      );
    });

    it("treats upsert failure on a valid row as an UNKNOWN error", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.fail(systemErrors.internal(new Error("DB constraint")))
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("FAILED");
      expect(result.data.processedRows).toBe(0);
      expect(result.data.errorRows).toBe(1);
      expect(mockStudentSyncErrorsRepo.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            errorReason: "UNKNOWN",
            errorDetail: expect.stringContaining("internal error"),
          }),
        ])
      );
    });

    it("finalizes with FAILED when createBatch of errors fails", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
              ",invalid-email,Missing Code,Engineering,2024",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncErrorsRepo.createBatch.mockResolvedValue(
        Result.fail(systemErrors.internal(new Error("DB write batch failed")))
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "FAILED" })
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FAILED when finalize updateStatus call fails", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.fail(systemErrors.internal(new Error("DB update failed")))
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FAILED with csv-parse CsvError when malformed data is encountered", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            'student_code,email,full_name\nSV12345678,stu001@university.edu,"John Doe\n',
          ])
        )
      );

      const result = await service.processJob("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(mockStudentSyncJobsRepo.updateStatus).toHaveBeenNthCalledWith(
        2,
        "job-001",
        "FAILED",
        expect.objectContaining({
          totalRows: 0,
          processedRows: 0,
          errorRows: 0,
        })
      );
    });

    it("handles CSV with BOM marker correctly", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            "﻿student_code,email,full_name,faculty,class_year\nSV12345678,stu001@university.edu,John Doe,Engineering,2024",
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "SUCCESS" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SUCCESS");
      expect(result.data.totalRows).toBe(1);
    });

    it("skips empty lines in CSV", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024",
              "",
              "SV87654321,stu002@university.edu,Jane Doe,Science,2025",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV87654321" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "SUCCESS" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.totalRows).toBe(2);
      expect(result.data.processedRows).toBe(2);
      expect(result.data.errorRows).toBe(0);
    });

    it("links a student record to an existing user when user_id is present", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );
      mockUsersRepo.findById.mockResolvedValue(
        Result.ok({ userId: "11111111-1111-4111-8111-111111111111" })
      );
      mockStorageService.getFileStream.mockResolvedValue(
        Result.ok(
          Readable.from([
            [
              "student_code,email,full_name,faculty,class_year,user_id",
              "SV12345678,stu001@university.edu,John Doe,Engineering,2024,11111111-1111-4111-8111-111111111111",
            ].join("\n"),
          ])
        )
      );
      mockStudentsRepo.upsert.mockResolvedValue(
        Result.ok({ studentCode: "SV12345678" })
      );
      mockStudentSyncJobsRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...mockJobRecord, status: "SUCCESS" })
      );

      const result = await service.processJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(mockUsersRepo.findById).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111"
      );
      expect(mockStudentsRepo.upsert).toHaveBeenCalledWith({
        studentId: "SV12345678",
        fullName: "John Doe",
        email: "stu001@university.edu",
        userId: "11111111-1111-4111-8111-111111111111",
      });
    });
  });

  // -----------------------------------------------------------------------
  // validateRow — validation rules
  // -----------------------------------------------------------------------
  describe("validateRow", () => {
    it("detects MISSING_FIELD for empty student_code", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow({ email: "test@test.com", full_name: "Test" });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "MISSING_FIELD: student_code/student_id is required"
      );
    });

    it("detects INVALID_FORMAT for student_code not matching SV + 8 digits pattern", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow({
        student_code: "INVALID",
        email: "test@test.com",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "INVALID_FORMAT: student_code must match pattern SV + 8 digits (e.g. SV12345678)"
      );
    });

    it("detects MISSING_FIELD for empty email", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow({
        student_code: "SV12345678",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("MISSING_FIELD: email is required");
    });

    it("detects INVALID_FORMAT for malformed email", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow({
        student_code: "SV12345678",
        email: "not-an-email",
        full_name: "Test",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "INVALID_FORMAT: email is not a valid email address"
      );
    });

    it("detects MISSING_FIELD for empty full_name", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow({
        student_code: "SV12345678",
        email: "test@test.com",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("MISSING_FIELD: full_name is required");
    });

    it("returns valid for a correct row", () => {
      const validateRow = (row: Record<string, unknown>) =>
        (
          StudentSyncService.prototype as unknown as {
            validateRow(row: Record<string, unknown>): {
              valid: boolean;
              errors?: string[];
            };
          }
        ).validateRow(row);

      const result = validateRow(validRow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // resolveErrorReason — prefix-based error reason mapping
  // -----------------------------------------------------------------------
  describe("resolveErrorReason", () => {
    function callResolveErrorReason(errorMessage?: string) {
      return (
        StudentSyncService.prototype as unknown as {
          resolveErrorReason(errorMessage?: string): string | undefined;
        }
      ).resolveErrorReason(errorMessage);
    }

    it('maps MISSING_FIELD prefix to "MISSING_FIELD"', () => {
      const result = callResolveErrorReason(
        "MISSING_FIELD: student_code/student_id is required"
      );
      expect(result).toBe("MISSING_FIELD");
    });

    it('maps INVALID_FORMAT prefix to "INVALID_FORMAT"', () => {
      const result = callResolveErrorReason(
        "INVALID_FORMAT: student_code exceeds 20 characters"
      );
      expect(result).toBe("INVALID_FORMAT");
    });

    it('maps DUPLICATE prefix to "DUPLICATE"', () => {
      const result = callResolveErrorReason(
        "DUPLICATE: student_code already exists"
      );
      expect(result).toBe("DUPLICATE");
    });

    it('falls back to "UNKNOWN" for unrecognized messages', () => {
      const result = callResolveErrorReason("UNEXPECTED: something went wrong");
      expect(result).toBe("UNKNOWN");
    });

    it("returns undefined when errorMessage is not provided", () => {
      const result = callResolveErrorReason(undefined);
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getJob
  // -----------------------------------------------------------------------
  describe("getJob", () => {
    it("returns the job mapped through ImportLogDto when found", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.ok(mockJobRecord)
      );

      const result = await service.getJob("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        id: mockJobRecord.jobId,
        runAt: mockJobRecord.triggeredAt.toISOString(),
        triggeredBy: "MANUAL",
        status: "IN_PROGRESS",
        totalRows: null,
        successCount: null,
        failedCount: 0,
        durationMs: null,
        filePath: mockJobRecord.sourceFileName,
        errorFileUrl: null,
      });
    });

    it("returns FailResult (INTERNAL_ERROR) when job is not found", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getJob("nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult when repo fails", async () => {
      mockStudentSyncJobsRepo.findById.mockResolvedValue(
        Result.fail(systemErrors.internal(new Error("DB down")))
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
        Result.ok({
          items: [mockJobRecord],
          nextCursor: null,
          hasMore: false,
          limit: 20,
        })
      );

      const result = await service.listJobs({ limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.nextCursor).toBeNull();
      expect(result.data.hasMore).toBe(false);
      expect(result.data.limit).toBe(20);
    });
  });
});
