import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import { StorageService } from "@/infra/storage/storage.service";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { Result } from "@/shared/response/result";

import { AiSummaryResponseBuilder } from "../dto/ai-summary-response.dto";
import { PdfSummaryPipeline } from "../pipeline/pdf-summary.pipeline";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";

import type { AiSummaryAdminDto } from "../dto/ai-summary-response.dto";

/**
 * AiSummaryService
 *
 * Orchestrates workshop-level AI summary operations: document upload,
 * summary generation pipeline, manual override, and retry.
 */
@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly pipeline: PdfSummaryPipeline,
    private readonly aiSummariesRepo: AiSummariesRepository,
    private readonly storageService: StorageService,
    private readonly workshopsRepo: WorkshopsRepository
  ) {}

  // ── Document upload ──────────────────────────────────────────────

  /**
   * Uploads a PDF document for a workshop and queues AI summary generation.
   *
   * Business rules:
   * - The workshop must exist in the database.
   * - The file is uploaded to S3-compatible object storage.
   * - An AI summary record is upserted with QUEUED status for background processing.
   *
   * Side effects:
   * - Uploads the file buffer to object storage (S3 PutObject).
   * - Upserts an ai_summaries record with QUEUED status.
   *
   * @param workshopId - The UUID of the target workshop.
   * @param file - Express Multer file object with buffer and metadata.
   * @returns OkResult with { workshopId }, or FailResult (WORKSHOP_NOT_FOUND, INTERNAL_ERROR).
   */
  async uploadDocument(
    workshopId: string,
    file: Express.Multer.File
  ): Promise<Result<{ workshopId: string }>> {
    const workshopResult = await this.workshopsRepo.findById(workshopId);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    const uploadResult = await this.storageService.uploadFile(file, workshopId);
    if (uploadResult.isFailure) return Result.fail(uploadResult.error);

    await this.aiSummariesRepo.upsert(randomUUID(), workshopId);

    return Result.ok({ workshopId });
  }

  // ── Get summary ──────────────────────────────────────────────────

  /**
   * Retrieves the AI-generated summary for a workshop (admin view).
   *
   * Returns full field visibility including error_message.
   * Returns { status: "NONE" } when no summary exists.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing AiSummaryAdminDto, or FailResult (INTERNAL_ERROR).
   */
  async getAiSummary(workshopId: string): Promise<Result<AiSummaryAdminDto>> {
    const result = await this.aiSummariesRepo.findByWorkshopId(workshopId);
    if (result.isFailure) return Result.fail(result.error);
    const summary = result.data;
    if (!summary) return Result.ok({ status: "NONE" } as AiSummaryAdminDto);
    return Result.ok(AiSummaryResponseBuilder.fromAdmin(summary));
  }

  // ── Manual override ──────────────────────────────────────────────

  /**
   * Manually overrides the AI-generated summary text for a workshop.
   *
   * Business rules:
   * - Sets status to DONE and generated_at to now.
   * - Creates a new summary record if none exists for this workshop.
   *
   * Side effects:
   * - Updates or inserts a row in ai_summaries.
   *
   * @param workshopId - The UUID of the workshop.
   * @param text - The manual summary text.
   * @returns OkResult containing AiSummaryAdminDto, or FailResult (INTERNAL_ERROR).
   */
  async updateSummaryText(
    workshopId: string,
    text: string
  ): Promise<Result<AiSummaryAdminDto>> {
    // Check for existing summary
    const existing = await this.aiSummariesRepo.findByWorkshopId(workshopId);
    if (existing.isFailure) return Result.fail(existing.error);

    if (existing.data) {
      const updated = await this.aiSummariesRepo.updateStatus(
        existing.data.summaryId,
        "DONE",
        text
      );
      if (updated.isFailure) return Result.fail(updated.error);
      return Result.ok(AiSummaryResponseBuilder.fromAdmin(updated.data));
    }

    // No existing summary — create one. DocumentId is auto-generated
    // to satisfy FK constraint until DB migration makes it nullable.
    const created = await this.aiSummariesRepo.createByWorkshopId(
      workshopId,
      text
    );
    if (created.isFailure) return Result.fail(created.error);
    return Result.ok(AiSummaryResponseBuilder.fromAdmin(created.data));
  }

  // ── Retry after failure ──────────────────────────────────────────

  /**
   * Retries AI summary generation for a workshop that previously failed.
   *
   * Business rules:
   * - Only summaries with FAILED status are eligible for retry.
   * - Resets the status to QUEUED to re-trigger the Background module.
   *
   * Side effects:
   * - Updates the ai_summaries record status from FAILED to QUEUED.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with void on success, or FailResult (INTERNAL_ERROR).
   */
  async retryAiSummary(workshopId: string): Promise<Result<void>> {
    const summaryResult =
      await this.aiSummariesRepo.findByWorkshopId(workshopId);
    if (summaryResult.isFailure) return Result.fail(summaryResult.error);
    if (!summaryResult.data) return Result.ok();

    if (summaryResult.data.status !== "FAILED") {
      return Result.ok();
    }

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "QUEUED"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    return Result.ok();
  }

  // ── Pipeline (called by AiSummaryWorker) ─────────────────────────

  /**
   * Runs the full document summarization pipeline.
   *
   * Called by AiSummaryWorker for each queued job.
   *
   * @param documentId - The UUID of the workshop document to summarise.
   * @param fileUrl - The object-storage URL of the PDF file.
   * @param workshopId - The UUID of the associated workshop.
   * @returns OkResult with summary text, or FailResult (INTERNAL_ERROR).
   */
  async processDocument(
    documentId: string,
    fileUrl: string,
    workshopId: string
  ): Promise<Result<string>> {
    this.logger.log(
      `Processing document ${documentId} for workshop ${workshopId}`
    );

    const result = await this.pipeline.execute(documentId, workshopId, fileUrl);

    if (result.isFailure) {
      this.logger.warn(
        `Pipeline failed for document ${documentId}: ${result.error.message}`,
        { error: result.error.code }
      );
      await this.markFailed(documentId, result.error.message);
      return Result.fail(result.error);
    }

    const summaryText = result.data.summaryText ?? "";
    this.logger.log(`Summary completed for document ${documentId}`);
    return Result.ok(summaryText);
  }

  /**
   * Marks a document's summary as FAILED due to LLM timeout.
   *
   * Called by AiSummaryWorker when the 40s Promise.race timeout fires.
   *
   * @param documentId - The UUID of the document whose summary timed out.
   */
  async handleTimeout(documentId: string): Promise<Result<void>> {
    this.logger.warn(
      `LLM timeout for document ${documentId}, marking as FAILED`
    );
    await this.markFailed(documentId, "LLM_TIMEOUT");
    return Result.ok();
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private async markFailed(
    documentId: string,
    errorMessage: string
  ): Promise<void> {
    const summaryResult =
      await this.aiSummariesRepo.findByDocumentId(documentId);

    if (summaryResult.isFailure || !summaryResult.data) {
      this.logger.error(
        `No summary record found to mark FAILED for document ${documentId}`
      );
      return;
    }

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "FAILED",
      errorMessage
    );

    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to mark summary FAILED for document ${documentId}: ${updateResult.error.message}`
      );
    }
  }
}
