import { Inject, Injectable, Logger } from "@nestjs/common";
import { parse, CsvError } from "csv-parse";

import type { NewStudentSyncError } from "@/infra/database/types";
import type { StudentSyncJobData } from "@/infra/messaging/event-contracts";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import type { ITypedMessageQueue } from "@/infra/messaging/messaging.interfaces";
import { StorageService } from "@/infra/storage/storage.service";
import { StudentsRepository } from "@/modules/iam/repositories/students.repository";
import { UsersRepository } from "@/modules/iam/repositories/users.repository";
import {
  passthroughOrInternal,
  systemErrors,
  validationError,
} from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import {
  StudentSyncJobResponse,
  type ImportLogDto,
} from "../dto/student-sync-response.dto";
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
  /** At least one of student_code or student_id is required. */
  private static readonly STUDENT_ID_HEADERS = [
    "student_code",
    "student_id",
  ] as const;

  private static readonly REQUIRED_CSV_HEADERS = [
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

  private readonly logger = new Logger(StudentSyncService.name);

  constructor(
    private readonly studentSyncJobsRepo: StudentSyncJobsRepository,
    private readonly studentSyncErrorsRepo: StudentSyncErrorsRepository,
    private readonly studentsRepo: StudentsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly storageService: StorageService,
    @Inject(MESSAGING_TOKEN.STUDENT_SYNC_QUEUE)
    private readonly queue: ITypedMessageQueue
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
   * @param filePath - Path/name of CSV file in Object Storage
   * @returns OkResult with job metadata (jobId, status, triggeredAt),
   *          or FailResult with INTERNAL_ERROR when job creation or queue enqueue fails.
   */
  async triggerSync(
    filePath: string,
    triggeredBy?: "CRON" | "MANUAL"
  ): Promise<Result<{ jobId: string; status: string; triggeredAt: Date }>> {
    this.logger.log(`Sync triggered: file="${filePath}", by="${triggeredBy}"`);

    // Create job record with RUNNING status
    const createResult = await this.studentSyncJobsRepo.create({
      sourceFileName: filePath,
      triggeredBy: triggeredBy ?? "MANUAL",
    });

    if (createResult.isFailure) {
      this.logger.warn(
        `Failed to create sync job for file "${filePath}": ${createResult.error.message}`
      );
      return Result.fail(createResult.error);
    }

    const job = createResult.data;

    // Enqueue for background processing
    try {
      await this.queue.enqueue("student-sync", {
        jobId: job.jobId,
        sourceFileName: filePath,
      } satisfies StudentSyncJobData);
      this.logger.log(`Sync job ${job.jobId} enqueued (file="${filePath}")`);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue sync job ${job.jobId}: ${err instanceof Error ? err.message : err}`
      );
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

    this.logger.log(`Processing job ${jobId}: file="${job.sourceFileName}"`);

    // 2. Update status to RUNNING
    await this.studentSyncJobsRepo.updateStatus(jobId, "RUNNING");

    // 3. Stage 2: Scan CSV for duplicate detection (streaming, lightweight)
    this.logger.log(`[Stage 1] Starting scan for job ${jobId}`);
    const scanResult = await this.stageScan(job.sourceFileName);
    if (scanResult.isFailure) {
      this.logger.warn(
        `[Stage 1] Scan failed for job ${jobId}: ${scanResult.error.message}`
      );
      await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED", {
        totalRows: 0,
        processedRows: 0,
        errorRows: 0,
      });
      return Result.fail(scanResult.error);
    }

    const { totalRows, lastSeenRow } = scanResult.data;
    this.logger.log(
      `[Stage 1] Scan complete: ${totalRows} total rows, ${lastSeenRow.size} unique codes`
    );

    // 4. Stage 3+4: Re-stream, validate, and batch upsert
    this.logger.log(`[Stage 2] Starting validate + upsert for job ${jobId}`);
    const processResult = await this.stageProcess(
      jobId,
      job.sourceFileName,
      lastSeenRow
    );
    if (processResult.isFailure) {
      this.logger.warn(
        `[Stage 2] Processing failed for job ${jobId}: ${processResult.error.message}`
      );
      await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED", {
        totalRows,
        processedRows: 0,
        errorRows: 0,
      });
      return Result.fail(processResult.error);
    }

    const { processedRows, errorRows, errors } = processResult.data;
    this.logger.log(
      `[Stage 2] Processing complete: ${processedRows} processed, ${errorRows} errors`
    );

    // 5. Save errors in batch
    let errorLogUrl: string | undefined;
    if (errors.length > 0) {
      this.logger.log(
        `[Stage 3] Saving ${errors.length} error records for job ${jobId}`
      );
      const errorsResult = await this.studentSyncErrorsRepo.createBatch(errors);
      if (errorsResult.isFailure) {
        this.logger.warn(
          `[Stage 3] Failed to save errors: ${errorsResult.error.message}`
        );
        await this.studentSyncJobsRepo.updateStatus(jobId, "FAILED", {
          totalRows,
          processedRows,
          errorRows,
        });
        return Result.fail(errorsResult.error);
      }

      // 5a. Write error CSV file to object storage
      const csvKey = `errors/students_${new Date().toISOString().slice(0, 10)}-${jobId}.csv`;
      const csvContent = this.buildErrorCsv(errors);
      const uploadResult = await this.storageService.uploadText(
        csvKey,
        csvContent
      );
      if (uploadResult.isSuccess) {
        errorLogUrl = uploadResult.data;
        this.logger.log(`[Stage 3] Error CSV uploaded: ${errorLogUrl}`);
      } else {
        // Error isolation: upload failure does NOT fail the pipeline
        this.logger.warn(
          `[Stage 3] Failed to upload error CSV for job ${jobId}: ${uploadResult.error.message}`
        );
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

    this.logger.log(
      `[Finalize] Job ${jobId}: status=${finalStatus}, ` +
        `total=${totalRows}, ok=${processedRows}, err=${errorRows}`
    );

    const finalizeResult = await this.studentSyncJobsRepo.updateStatus(
      jobId,
      finalStatus,
      {
        totalRows,
        processedRows,
        errorRows,
        errorLogUrl,
      }
    );
    if (finalizeResult.isFailure) {
      this.logger.warn(
        `[Finalize] Failed to update status for job ${jobId}: ${finalizeResult.error.message}`
      );
      return Result.fail(finalizeResult.error);
    }

    this.logger.log(`Job ${jobId} finished: ${finalStatus}`);

    return Result.ok({
      jobId,
      status: finalStatus,
      totalRows,
      processedRows,
      errorRows,
    });
  }

  /**
   * Stage 2: Scan CSV for duplicate detection (streaming, lightweight pass).
   *
   * Streams through the CSV file once, tracking only student codes and their
   * last-seen row numbers. Does NOT collect full row data into memory.
   *
   * Business rules:
   * - Duplicate detection uses last-wins: the last occurrence of a student_code
   *   in the file is the one that will be processed.
   * - Rows without a student_code (or with empty code) are always included
   *   in the processing pass (no dedup applied).
   *
   * Side effects:
   * - Fetches the CSV file from Object Storage.
   * - Logs warnings for each duplicate student_code found.
   *
   * @param sourceFileName - Object Storage key of the CSV file.
   * @returns OkResult with totalRows and lastSeenRow map, or FailResult
   *          (STORAGE_FILE_NOT_FOUND, STORAGE_DOWNLOAD_FAILED, VALIDATION_FAILED).
   */
  private async stageScan(sourceFileName: string): Promise<
    Result<{
      totalRows: number;
      lastSeenRow: Map<string, number>;
    }>
  > {
    this.logger.log(`[Scan] Opening stream: "${sourceFileName}"`);

    const streamResult =
      await this.storageService.getFileStream(sourceFileName);
    if (streamResult.isFailure) return Result.fail(streamResult.error);

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

    const lastSeenRow = new Map<string, number>();
    let totalRows = 0;
    const duplicates: Array<{
      studentCode: string;
      occurrences: number;
    }> = [];

    try {
      for await (const row of rows) {
        totalRows++;
        const rawCode = row.student_code ?? row.student_id;
        if (typeof rawCode === "string" && rawCode.trim().length > 0) {
          const code = rawCode.trim();
          if (lastSeenRow.has(code)) {
            // Track duplicate for logging
            const existing = duplicates.find((d) => d.studentCode === code);
            if (existing) {
              existing.occurrences++;
            } else {
              duplicates.push({ studentCode: code, occurrences: 2 });
            }
          }
          lastSeenRow.set(code, totalRows);
        }
      }
    } catch (err) {
      return Result.fail(this.normalizeProcessingError(err));
    }

    // Log duplicate warnings
    for (const dup of duplicates) {
      this.logger.warn(
        `Duplicate student_code trong file: ${dup.studentCode} (${dup.occurrences} occurrences, keeping last)`
      );
    }

    return Result.ok({ totalRows, lastSeenRow });
  }

  /**
   * Stage 3+4: Re-stream CSV, validate rows, and batch upsert.
   *
   * Second streaming pass over the CSV file. Validates each row against
   * business rules, resolves optional linked userId, and collects valid
   * rows into batches of 500 for bulk upsert.
   *
   * Business rules:
   * - Rows that are not the last occurrence of their student_code are skipped.
   * - Invalid rows are collected as errors (not quarantined mid-pipeline).
   * - Upsert is batched in groups of 500 for DB efficiency.
   * - If a batch upsert fails, falls back to individual upserts per row
   *   (error isolation per spec INV-02).
   *
   * Side effects:
   * - Fetches the CSV file from Object Storage (second HTTP request).
   * - Calls StudentsRepository.upsertBatch() for each batch of 500 rows.
   * - On batch failure, calls StudentsRepository.upsert() individually.
   *
   * @param jobId - Sync job UUID for error linking.
   * @param sourceFileName - Object Storage key of the CSV file.
   * @param lastSeenRow - Map of student_code → last row number from stageScan.
   * @returns OkResult with processedRows, errorRows, and errors array, or
   *          FailResult (STORAGE_FILE_NOT_FOUND, VALIDATION_FAILED).
   */
  private async stageProcess(
    jobId: string,
    sourceFileName: string,
    lastSeenRow: Map<string, number>
  ): Promise<
    Result<{
      processedRows: number;
      errorRows: number;
      errors: NewStudentSyncError[];
    }>
  > {
    const streamResult =
      await this.storageService.getFileStream(sourceFileName);
    if (streamResult.isFailure) return Result.fail(streamResult.error);

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

    const BATCH_SIZE = 500;
    let processedRows = 0;
    let errorRows = 0;
    let rowNumber = 0;
    const errors: NewStudentSyncError[] = [];
    const upsertBatch: Array<{
      studentId: string;
      fullName: string;
      email: string | null;
      userId?: string | null;
    }> = [];

    try {
      for await (const row of rows) {
        rowNumber++;

        // Skip if this row is a duplicate (not the last occurrence)
        const rawCode = row.student_code ?? row.student_id;
        if (typeof rawCode === "string" && rawCode.trim().length > 0) {
          const code = rawCode.trim();
          const lastRow = lastSeenRow.get(code);
          if (lastRow && lastRow !== rowNumber) {
            // Skip — this is not the last occurrence
            continue;
          }
        }

        // Validate row data
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

        // Resolve optional linked userId
        const userIdResult = await this.resolveLinkedUserId(row);
        if (userIdResult.isFailure) {
          errorRows++;
          errors.push({
            jobId,
            rowNumber,
            rawData: JSON.stringify(row),
            errorReason: "UNKNOWN",
            errorDetail: userIdResult.error.message,
          });
          continue;
        }

        // Add to upsert batch
        const studentCode =
          typeof row.student_code === "string"
            ? row.student_code
            : typeof row.student_id === "string"
              ? row.student_id
              : "";
        const fullName = typeof row.full_name === "string" ? row.full_name : "";
        const email = typeof row.email === "string" ? row.email : null;

        upsertBatch.push({
          studentId: studentCode,
          fullName,
          email,
          userId: userIdResult.data ?? undefined,
        });

        // Flush batch when full
        if (upsertBatch.length >= BATCH_SIZE) {
          const flushResult = await this.flushUpsertBatch(
            upsertBatch,
            jobId,
            rowNumber
          );
          processedRows += flushResult.success;
          errors.push(...flushResult.errors);
          errorRows += flushResult.errors.length;
          upsertBatch.length = 0;
        }
      }

      // Flush remaining batch
      if (upsertBatch.length > 0) {
        const flushResult = await this.flushUpsertBatch(
          upsertBatch,
          jobId,
          rowNumber
        );
        processedRows += flushResult.success;
        errors.push(...flushResult.errors);
        errorRows += flushResult.errors.length;
      }
    } catch (err) {
      // Flush any remaining batch before failing
      if (upsertBatch.length > 0) {
        const flushResult = await this.flushUpsertBatch(
          upsertBatch,
          jobId,
          rowNumber
        );
        processedRows += flushResult.success;
        errors.push(...flushResult.errors);
        errorRows += flushResult.errors.length;
      }
      return Result.fail(this.normalizeProcessingError(err));
    }

    return Result.ok({ processedRows, errorRows, errors });
  }

  /**
   * Flush an upsert batch — try batch upsert first, fall back to individual.
   *
   * Business rules:
   * - Tries StudentsRepository.upsertBatch() first (single SQL statement).
   * - If the batch fails (transient DB error), falls back to individual
   *   upserts per row to preserve error isolation (INV-02).
   *
   * @param batch - Array of upsert data (at most 500 items).
   * @param jobId - Sync job UUID for error linking.
   * @param currentRowNumber - Current row number in the CSV iteration.
   * @returns Object with success count and errors array.
   */
  private async flushUpsertBatch(
    batch: Array<{
      studentId: string;
      fullName: string;
      email: string | null;
      userId?: string | null;
    }>,
    jobId: string,
    currentRowNumber: number
  ): Promise<{ success: number; errors: NewStudentSyncError[] }> {
    const batchResult = await this.studentsRepo.upsertBatch(batch);
    if (batchResult.isSuccess) {
      this.logger.log(`[Batch] Upserted ${batch.length} rows`);
      return { success: batch.length, errors: [] };
    }

    // Fallback to individual upserts for error isolation
    this.logger.warn(
      `Batch upsert failed for ${batch.length} rows, falling back to individual upserts: ${batchResult.error.message}`
    );

    let success = 0;
    const errors: NewStudentSyncError[] = [];

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];

      // Recalculate approximate row number
      const approxRowNumber = currentRowNumber - batch.length + i + 1;
      const individualResult = await this.studentsRepo.upsert({
        studentId: item.studentId,
        fullName: item.fullName,
        email: item.email ?? undefined,
        userId: item.userId ?? undefined,
      });

      if (individualResult.isSuccess) {
        success++;
      } else {
        errors.push({
          jobId,
          rowNumber: approxRowNumber,
          rawData: JSON.stringify(item),
          errorReason: "UNKNOWN",
          errorDetail: individualResult.error.message,
        });
      }
    }

    return { success, errors };
  }

  /**
   * Retrieve the current status and metadata for a sync job
   *
   * @param jobId - Sync job UUID
   * @returns OkResult with the full job record,
   *          or FailResult with INTERNAL_ERROR when job is not found or DB query fails.
   */
  async getJob(jobId: string): Promise<Result<ImportLogDto>> {
    const result = await this.studentSyncJobsRepo.findById(jobId);

    if (result.isFailure) return Result.fail(result.error);

    if (!result.data) {
      return Result.fail(systemErrors.internal(`Sync job ${jobId} not found`));
    }

    return Result.ok(StudentSyncJobResponse.from(result.data));
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
   * List all sync jobs with cursor-based pagination
   *
   * Results ordered by triggered_at DESC (most recent first).
   *
   * @param filters - Status filter and cursor controls
   * @param filters.status - Optional status filter (IN_PROGRESS, SUCCESS, FAILED)
   * @param filters.cursor - Base64-encoded ISO timestamp for cursor pagination
   * @param filters.limit - Items per page
   * @returns OkResult with items array, nextCursor, hasMore flag, and limit,
   *          or FailResult with INTERNAL_ERROR.
   */
  async listJobs(filters: {
    status?: string;
    cursor?: string;
    limit: number;
  }): Promise<
    Result<{
      items: ImportLogDto[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    const result = await this.studentSyncJobsRepo.findMany(filters);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok({
      ...result.data,
      items: result.data.items.map(StudentSyncJobResponse.from),
    });
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
  /**
   * Validate a single CSV row for required fields and format
   *
   * Business rules:
   * - student_code or student_id is required (pattern: 8 digits, e.g. 23120001)
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

    // student_code/student_id: required, pattern 8 digits
    const studentCode = row.student_code ?? row.student_id;
    if (typeof studentCode !== "string" || studentCode.trim().length === 0) {
      errors.push("MISSING_FIELD: student_code/student_id is required");
    } else if (!/^\d{8}$/.test(studentCode.trim())) {
      errors.push(
        "INVALID_FORMAT: student_code must match pattern 8 digits (e.g. 23120001)"
      );
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
  /**
   * Validate the required CSV headers before row processing begins.
   *
   * @param headers - Header names parsed from the CSV file.
   * @returns OkResult when all required headers exist, or FailResult when one or more are missing.
   */
  private validateCsvHeaders(headers: string[]): Result<void> {
    const normalizedHeaders = new Set(headers.map((header) => header.trim()));

    // Check at least one student identifier header
    const hasStudentId = StudentSyncService.STUDENT_ID_HEADERS.some((h) =>
      normalizedHeaders.has(h)
    );
    if (!hasStudentId) {
      return Result.fail(
        validationError([
          {
            field: StudentSyncService.STUDENT_ID_HEADERS.join("/"),
            rule: "required",
            message: `CSV must contain one of: ${StudentSyncService.STUDENT_ID_HEADERS.join(", ")}.`,
          },
        ])
      );
    }

    // Check required headers (email, full_name)
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
   * Build a CSV string from sync error records for the error quarantine file.
   *
   * Combines original row data with error metadata (error_reason, row_number).
   * Uses tab characters inside cells as a simple CSV delimiter (avoids comma
   * collision with the original CSV which may contain commas in name fields).
   *
   * @param errors - Array of sync error records to include in the CSV.
   * @returns A CSV-formatted string with header + error rows.
   */
  private buildErrorCsv(errors: NewStudentSyncError[]): string {
    // Collect all unique keys from rawData across all error rows
    const allKeys = new Set<string>();
    for (const err of errors) {
      try {
        const parsed = JSON.parse(err.rawData) as Record<string, unknown>;
        Object.keys(parsed).forEach((k) => allKeys.add(k));
      } catch {
        // skip unparseable rawData
      }
    }
    const originalKeys = [...allKeys];

    const header = [...originalKeys, "error_reason", "row_number"];
    const escapeCsv = (val: unknown): string => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [header.map(escapeCsv).join(",")];
    for (const err of errors) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(err.rawData) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const row = originalKeys.map((k) => escapeCsv(parsed[k]));
      row.push(escapeCsv(err.errorReason), String(err.rowNumber));
      lines.push(row.join(","));
    }

    return lines.join("\n");
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
