import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/database";
import type { NewStudentSyncError, StudentSyncJob } from "@/database/types";
import type { StudentSyncJobData } from "@/shared/queues/event-contracts";
import { STUDENT_SYNC_QUEUE } from "@/shared/queues/queue.constants";
import { systemErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

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
  constructor(
    private readonly studentSyncJobsRepo: StudentSyncJobsRepository,
    private readonly studentSyncErrorsRepo: StudentSyncErrorsRepository,
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema,
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
   *          or FailResult (INTERNAL_ERROR)
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
    await this.studentSyncQueue.add(
      "student-sync",
      { jobId: job.jobId, sourceFileName } satisfies StudentSyncJobData,
      { jobId: job.jobId }
    );

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
   * @returns OkResult with sync summary (jobId, status, counts), or FailResult
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
    const errors: NewStudentSyncError[] = [];

    // 4. Batch-Sequential processing of each row
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 1;

      // a) Validate row data
      const validation = this.validateRow(row);
      if (!validation.valid) {
        errorRows++;
        errors.push({
          jobId,
          rowNumber,
          rawData: JSON.stringify(row),
          errorReason:
            (validation.errors?.[0] as NewStudentSyncError["errorReason"]) ??
            "UNKNOWN",
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

    // 5. Save errors in batch
    if (errors.length > 0) {
      await this.studentSyncErrorsRepo.createBatch(errors);
    }

    // 6. Finalize job status
    const totalRows = rows.length;
    let finalStatus: "SUCCESS" | "PARTIAL_FAILURE" | "FAILED";

    if (errorRows === 0) {
      finalStatus = "SUCCESS";
    } else if (errorRows === totalRows) {
      finalStatus = "FAILED";
    } else {
      finalStatus = "PARTIAL_FAILURE";
    }

    await this.studentSyncJobsRepo.updateStatus(jobId, finalStatus, {
      totalRows,
      processedRows,
      errorRows,
    });

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
   * @returns OkResult with the full job record, or FailResult (INTERNAL_ERROR)
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
   * @returns OkResult with items and total count, or FailResult (INTERNAL_ERROR)
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
   * @returns OkResult with items array and total count, or FailResult (INTERNAL_ERROR)
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
   * - Returns rows as an array of plain objects
   *
   * TODO: Implement real CSV parsing with fast-csv or papaparse
   * TODO: Validate CSV headers before processing rows
   *
   * @param csvUrl - Object Storage URL of the CSV file
   * @returns OkResult with parsed rows, or FailResult
   */
  private parseCSV(csvUrl: string): Promise<Result<any[]>> {
    // Stub: Real implementation would:
    // 1. Fetch CSV content from Object Storage (S3)
    // 2. Parse using fast-csv or papaparse
    // 3. Validate headers match expected student fields
    // 4. Return rows array
    //
    // For now, return empty rows as placeholder
    void csvUrl; // Mark parameter as used
    return Promise.resolve(Result.ok([]));
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
   * TODO: Link with users table when userId is available from CSV
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

    // Drizzle INSERT ON CONFLICT DO UPDATE pattern
    return Result.ok(
      await this.db
        .insert(this.schema.students)
        .values({
          studentCode,
          fullName,
          emailEdu,
          faculty,
          classYear: Number.isNaN(classYear) ? null : classYear,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: this.schema.students.studentCode,
          set: {
            fullName,
            emailEdu,
            faculty,
            classYear: Number.isNaN(classYear) ? null : classYear,
            lastSyncedAt: new Date(),
          },
        })
        .returning()
    );
  }
}
