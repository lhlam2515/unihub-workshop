import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { parse, CsvError } from "csv-parse";

import type { NewStudentSyncError, StudentSyncJob } from "@/database/types";
import { StudentsRepository } from "@/modules/iam/repositories/students.repository";
import { UsersRepository } from "@/modules/iam/repositories/users.repository";
import type { StudentSyncJobData } from "@/shared/queues/event-contracts";
import { STUDENT_SYNC_QUEUE } from "@/shared/queues/queue.constants";
import {
  passthroughOrInternal,
  systemErrors,
  validationError,
} from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { StorageService } from "@/shared/storage/storage.service";

import { StudentSyncErrorsRepository } from "../repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "../repositories/student-sync-jobs.repository";

/**
 * StudentSyncService
 *
 * Handles bulk student data import/synchronization from CSV files.
 * Implements Batch-Sequential processing pattern.
 */
@Injectable()
export class StudentSyncService {
  private static readonly REQUIRED_CSV_HEADERS = [
    "student_code",
    "email",
    "full_name",
  ] as const;

  private static readonly VALIDATION_PREFIX_MAP: Record<
    string,
    NewStudentSyncError["errorReason"]
  > = {
    MISSING_FIELD: "MISSING_FIELD",
    INVALID_FORMAT: "INVALID_FORMAT",
    DUPLICATE: "DUPLICATE",
  };

  constructor(
    private readonly studentSyncJobsRepo: StudentSyncJobsRepository,
    private readonly studentSyncErrorsRepo: StudentSyncErrorsRepository,
    private readonly studentsRepo: StudentsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly storageService: StorageService,
    @InjectQueue(STUDENT_SYNC_QUEUE)
    private readonly studentSyncQueue: Queue
  ) {}

  /**
   * Create a sync job record and enqueue it for background processing
   *
   * Business rules:
   * - Creates a job record with status=RUNNING in the database
   * - Pushes a BullMQ job to the student-sync queue with the job_id
   * - Returns immediately with the job metadata (non-blocking)
   *
   * Side effects:
   * - Inserts a new row into student_sync_jobs
   * - Enqueues a BullMQ job to the student-sync queue
   *
   * @param sourceFileName - Path/name of CSV file in Object Storage
   * @returns OkResult with job metadata (jobId, status, triggeredAt),
   *          or FailResult with INTERNAL_ERROR when job creation or queue enqueue fails.
   */
  async triggerSync(
    sourceFileName: string
  ): Promise<Result<{ jobId: string; status: string; triggeredAt: Date }>> {
    // Create job record with RUNNING status
    const createResult = await this.studentSyncJobsRepo.create({
      sourceFileName,
    });

    if (createResult.isFailure) return Result.fail(createResult.error);

    const job = createResult.data;

    // Enqueue for background processing
    try {
      await this.studentSyncQueue.add(
        "student-sync",
        { jobId: job.jobId, sourceFileName } satisfies StudentSyncJobData,
        { jobId: job.jobId }
      );
    } catch (err) {
      await this.studentSyncJobsRepo.updateStatus(job.jobId, "FAILED");
      return Result.fail(passthroughOrInternal(err));
    }

    return Result.ok({
      jobId: job.jobId,
      status: job.status,
      triggeredAt: job.triggeredAt,
    });
  }

  /**
   * Process a sync job by parsing its CSV file and upserting student records
   *
   * Business rules:
   * - Loads the job record and updates status to RUNNING
   * - Parses the CSV file from Object Storage
   * - Validates each row and upserts valid records
   * - Collects errors per row and saves them in batch
   * - Finalizes with SUCCESS, PARTIAL_FAILURE, or FAILED status
   *
   * Side effects:
   * - Updates student_sync_jobs status and counts
   * - Inserts student_sync_errors rows for failed rows
   * - Upserts rows into the students table
   *
   * @param jobId - Sync job UUID
   * @returns OkResult with sync summary (jobId, status, counts),
   *          or FailResult with INTERNAL_ERROR, STORAGE_FILE_NOT_FOUND,
   *          or VALIDATION_FAILED.
   */
  async processJob(jobId: string): Promise<
    Result<{
      jobId: string;
      status: string;
      totalRows: number;
      processedRows: number;
      errorRows: number;
    }>
  > {
    // 1. Load job record
    const jobResult = await this.studentSyncJobsRepo.findById(jobId);
    if (jobResult.isFailure) return Result.fail(jobResult.error);

    const job = jobResult.data;
    if (!job) {
      return Result.fail(systemErrors.internal(`Sync job ${jobId} not found`));
    }

    // 2. Update status to RUNNING
    await this.studentSyncJobsRepo.updateStatus(jobId, "RUNNING");

    // 3. Parse CSV file
    const parseResult = await this.parseCSV(job.sourceFileName);
    if (parseResult.isFailure) {
      await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED");
      return Result.fail(parseResult.error);
    }

    const rows = parseResult.data;
    let processedRows = 0;
    let errorRows = 0;
    let totalRows = 0;
    const errors: NewStudentSyncError[] = [];

    // 4. Batch-Sequential processing of each row
    try {
      for await (const row of rows) {
        totalRows++;
        const rowNumber = totalRows;

        // a) Validate row data
        const validation = this.validateRow(row);
        if (!validation.valid) {
          errorRows++;
          errors.push({
            jobId,
            rowNumber,
            rawData: JSON.stringify(row),
            errorReason:
              this.resolveErrorReason(validation.errors?.[0]) ?? "UNKNOWN",
            errorDetail: validation.errors?.join("; ") ?? null,
          });
          continue;
        }

        // b) Upsert student record
        const upsertResult = await this.upsertStudent(row);
        if (upsertResult.isFailure) {
          errorRows++;
          errors.push({
            jobId,
            rowNumber,
            rawData: JSON.stringify(row),
            errorReason: "UNKNOWN",
            errorDetail: upsertResult.error.message,
          });
          continue;
        }

        processedRows++;
      }
    } catch (err) {
      await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED", {
        totalRows,
        processedRows,
        errorRows,
      });
      return Result.fail(this.normalizeProcessingError(err));
    }

    // 5. Save errors in batch
    if (errors.length > 0) {
      const errorsResult = await this.studentSyncErrorsRepo.createBatch(errors);
      if (errorsResult.isFailure) {
        await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED", {
          totalRows,
          processedRows,
          errorRows,
        });
        return Result.fail(errorsResult.error);
      }
    }

    // 6. Finalize job status
    let finalStatus: "SUCCESS" | "PARTIAL_FAILURE" | "FAILED";

    if (errorRows === 0) {
      finalStatus = "SUCCESS";
    } else if (errorRows === totalRows) {
      finalStatus = "FAILED";
    } else {
      finalStatus = "PARTIAL_FAILURE";
    }

    const finalizeResult = await this.studentSyncJobsRepo.updateStatus(
      jobId,
      finalStatus,
      {
        totalRows,
        processedRows,
        errorRows,
      }
    );
    if (finalizeResult.isFailure) {
      return Result.fail(finalizeResult.error);
    }

    return Result.ok({
      jobId,
      status: finalStatus,
      totalRows,
      processedRows,
      errorRows,
    });
  }

  /**
   * Retrieve the current status and metadata for a sync job
   *
   * @param jobId - Sync job UUID
   * @returns OkResult with the full job record,
   *          or FailResult with INTERNAL_ERROR when job is not found or DB query fails.
   */
  async getJob(jobId: string): Promise<Result<StudentSyncJob>> {
    const result = await this.studentSyncJobsRepo.findById(jobId);

    if (result.isFailure) return Result.fail(result.error);

    if (!result.data) {
      return Result.fail(systemErrors.internal(`Sync job ${jobId} not found`));
    }

    return Result.ok(result.data);
  }

  /**
   * Retrieve paginated errors for a sync job
   *
   * @param jobId - Sync job UUID
   * @param pagination - Page and limit controls
   * @param pagination.page - Current page (1-indexed)
   * @param pagination.limit - Items per page
   * @returns OkResult with items and total count,
   *          or FailResult with INTERNAL_ERROR.
   */
  async getJobErrors(
    jobId: string,
    pagination: { page: number; limit: number }
  ): Promise<Result<{ items: any[]; total: number }>> {
    return this.studentSyncErrorsRepo.findByJobId(jobId, pagination);
  }

  /**
   * List all sync jobs with pagination
   *
   * Results ordered by triggered_at DESC (most recent first).
   *
   * @param pagination - Page and limit controls
   * @param pagination.page - Current page (1-indexed)
   * @param pagination.limit - Items per page
   * @returns OkResult with items array and total count,
   *          or FailResult with INTERNAL_ERROR.
   */
  async listJobs(pagination: {
    page: number;
    limit: number;
  }): Promise<Result<{ items: StudentSyncJob[]; total: number }>> {
    return this.studentSyncJobsRepo.findMany(pagination);
  }

  /**
   * Fetch and parse a CSV file from Object Storage
   *
   * Business rules:
   * - Expects CSV with headers matching student fields
   * - Returns a stream-friendly async iterable of row objects
   *
   * @param csvUrl - Object Storage URL of the CSV file
   * @returns OkResult with parsed rows, or FailResult
   */
  private async parseCSV(
    csvUrl: string
  ): Promise<Result<AsyncIterable<Record<string, unknown>>>> {
    const streamResult = await this.storageService.getFileStream(csvUrl);

    if (streamResult.isFailure) {
      return Result.fail(streamResult.error);
    }

    const rows = streamResult.data.pipe(
      parse({
        columns: (headers: string[]) => {
          const headerValidation = this.validateCsvHeaders(headers);
          if (headerValidation.isFailure) {
            throw headerValidation.error;
          }

          return headers;
        },
        bom: true,
        skip_empty_lines: true,
        trim: true,
      })
    ) as AsyncIterable<Record<string, unknown>>;

    return Result.ok(rows);
  }

  /**
   * Validate a single CSV row for required fields and format
   *
   * Business rules:
   * - student_code is required (max 20 chars)
   * - email is required (must be valid email format)
   * - full_name is required
   *
   * @param row - Parsed CSV row as a key-value object
   * @returns Validation result with valid flag and optional error messages
   */
  private validateRow(row: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    // student_code: required, max 20 chars
    const studentCode = row.student_code;
    if (typeof studentCode !== "string" || studentCode.trim().length === 0) {
      errors.push("MISSING_FIELD: student_code is required");
    } else if (studentCode.length > 20) {
      errors.push("INVALID_FORMAT: student_code exceeds 20 characters");
    }

    // email: required, valid email format
    const email = row.email;
    if (typeof email !== "string" || email.trim().length === 0) {
      errors.push("MISSING_FIELD: email is required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("INVALID_FORMAT: email is not a valid email address");
    }

    // full_name: required
    const fullName = row.full_name;
    if (typeof fullName !== "string" || fullName.trim().length === 0) {
      errors.push("MISSING_FIELD: full_name is required");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Upsert a student record from CSV row data
   *
   * Business rules:
   * - Uses student_code as the unique match key
   * - On conflict: updates full_name, email_edu, faculty, class_year
   * - On insert: creates a new student record with last_synced_at = NOW()
   *
   * Side effects:
   * - Inserts or updates a row in the students table
   *
   * @param row - Validated CSV row data
   * @returns OkResult with the upserted student, or FailResult
   */
  private async upsertStudent(
    row: Record<string, unknown>
  ): Promise<Result<any>> {
    // Safely extract and narrow types from the unknown row values
    const studentCode =
      typeof row.student_code === "string" ? row.student_code : "";
    const fullName = typeof row.full_name === "string" ? row.full_name : "";
    const emailEdu = typeof row.email === "string" ? row.email : "";
    const faculty = typeof row.faculty === "string" ? row.faculty : "";
    const classYear =
      typeof row.class_year === "number"
        ? row.class_year
        : typeof row.class_year === "string"
          ? Number(row.class_year)
          : null;

    const userIdResult = await this.resolveLinkedUserId(row);
    if (userIdResult.isFailure) {
      return Result.fail(userIdResult.error);
    }

    return this.studentsRepo.upsertByStudentCode({
      studentCode,
      fullName,
      emailEdu,
      faculty,
      classYear: Number.isNaN(classYear) ? null : classYear,
      userId: userIdResult.data ?? undefined,
    });
  }

  /**
   * Validate the required CSV headers before row processing begins.
   *
   * @param headers - Header names parsed from the CSV file.
   * @returns OkResult when all required headers exist, or FailResult when one or more are missing.
   */
  private validateCsvHeaders(headers: string[]): Result<void> {
    const normalizedHeaders = new Set(headers.map((header) => header.trim()));
    const missingHeaders = StudentSyncService.REQUIRED_CSV_HEADERS.filter(
      (header) => !normalizedHeaders.has(header)
    );

    if (missingHeaders.length > 0) {
      return Result.fail(
        validationError(
          missingHeaders.map((header) => ({
            field: header,
            rule: "required",
            message: `CSV header ${header} is required.`,
          }))
        )
      );
    }

    return Result.ok();
  }

  /**
   * Resolves an optional linked user from the CSV row.
   *
   * @param row - Parsed CSV row data.
   * @returns OkResult with a linked user UUID when present, or null when absent.
   */
  private async resolveLinkedUserId(
    row: Record<string, unknown>
  ): Promise<Result<string | null>> {
    const rawUserId = row.user_id;

    if (rawUserId === undefined || rawUserId === null || rawUserId === "") {
      return Result.ok(null);
    }

    if (typeof rawUserId !== "string") {
      return Result.fail(
        validationError([
          {
            field: "user_id",
            rule: "format",
            message: "CSV field user_id must be a string UUID.",
            received: rawUserId,
          },
        ])
      );
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        rawUserId.trim()
      )
    ) {
      return Result.fail(
        validationError([
          {
            field: "user_id",
            rule: "format",
            message: "CSV field user_id must be a valid UUID.",
            received: rawUserId,
          },
        ])
      );
    }

    const userResult = await this.usersRepo.findById(rawUserId.trim());
    if (userResult.isFailure) {
      return Result.fail(userResult.error);
    }

    if (!userResult.data) {
      return Result.fail(
        validationError([
          {
            field: "user_id",
            rule: "not_found",
            message: `User ${rawUserId} was not found.`,
            received: rawUserId,
          },
        ])
      );
    }

    return Result.ok(rawUserId.trim());
  }

  /**
   * Resolve a validation failure message into a sync error reason.
   *
   * @param errorMessage - Validation message emitted by validateRow().
   * @returns A known sync error reason or undefined when the message is not recognized.
   */
  private resolveErrorReason(
    errorMessage?: string
  ): NewStudentSyncError["errorReason"] | undefined {
    if (!errorMessage) return undefined;

    const prefix = errorMessage.split(":")[0];
    return StudentSyncService.VALIDATION_PREFIX_MAP[prefix] ?? "UNKNOWN";
  }

  /**
   * Normalize worker-level failures into public application errors.
   *
   * Header validation failures from the CSV parser are converted into a
   * standard validation error so callers receive a stable client-facing code.
   *
   * @param error - The thrown failure value.
   * @returns A normalized AppError suitable for Result.fail().
   */
  private normalizeProcessingError(error: unknown) {
    if (error instanceof CsvError) {
      return validationError([
        {
          field: "csv_parse",
          rule: "format",
          message: error.message,
        },
      ]);
    }

    if (error instanceof Error && error.message.includes("CSV header")) {
      return validationError([
        {
          field: "csv_headers",
          rule: "required",
          message: error.message,
        },
      ]);
    }

    return passthroughOrInternal(error);
  }
}
