import { Inject, Injectable, Logger } from "@nestjs/common";

import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import type { ITypedMessageQueue } from "@/infra/messaging/messaging.interfaces";
import { StorageService } from "@/infra/storage/storage.service";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { aiSummaryErrors, workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { AiSummaryResponseBuilder } from "../dto/ai-summary-response.dto";
import { PdfSummaryPipeline } from "../pipeline/pdf-summary.pipeline";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";

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
    private readonly workshopDocumentsRepo: WorkshopDocumentsRepository,
    private readonly storageService: StorageService,
    private readonly workshopsRepo: WorkshopsRepository,
    @Inject(MESSAGING_TOKEN.AI_SUMMARY_QUEUE)
    private readonly aiSummaryQueue: ITypedMessageQueue
  ) {}

  // ── Document upload ──────────────────────────────────────────────

  /**
   * Uploads a PDF document for a workshop and queues AI summary generation.
   *
   * Business rules:
   * - The workshop must exist in the database.
   * - The file is uploaded to S3-compatible object storage.
   * - A workshop_documents record is created with the real documentId.
   * - An ai_summaries record is upserted with QUEUED status for immediate polling.
   * - A BullMQ job is enqueued with documentId + fileUrl for background processing.
   *
   * Side effects:
   * - Uploads the file buffer to object storage (S3 PutObject).
   * - Inserts a row in workshop_documents.
   * - Upserts a row in ai_summaries with QUEUED status.
   * - Enqueues a job to AI_SUMMARY_QUEUE.
   *
   * @param workshopId - The UUID of the target workshop.
   * @param file - Express Multer file object with buffer and metadata.
   * @param uploadedBy - UUID of the BTC staff performing the upload.
   * @returns OkResult with { workshopId, documentId }, or FailResult
   *   (WORKSHOP_NOT_FOUND, UPLOAD_FAILED, INTERNAL_ERROR).
   */
  async uploadDocument(
    workshopId: string,
    file: Express.Multer.File,
    uploadedBy: string
  ): Promise<Result<{ workshopId: string; documentId: string }>> {
    const workshopResult = await this.workshopsRepo.findById(workshopId);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    if (!workshopResult.data)
      return Result.fail(workshopErrors.notFound(workshopId));

    const uploadResult = await this.storageService.uploadFile(file, workshopId);
    if (uploadResult.isFailure) return Result.fail(uploadResult.error);
    const fileUrl = uploadResult.data;

    const docResult = await this.workshopDocumentsRepo.create({
      workshopId,
      fileUrl,
      originalName: file.originalname,
      fileSizeBytes: file.size,
      uploadedBy,
    });
    if (docResult.isFailure) return Result.fail(docResult.error);
    const { documentId } = docResult.data;

    const upsertResult = await this.aiSummariesRepo.upsert(
      documentId,
      workshopId
    );
    if (upsertResult.isFailure) return Result.fail(upsertResult.error);

    await this.aiSummaryQueue.enqueue("ai-summary.process", {
      documentId,
      workshopId,
      fileUrl,
    });

    return Result.ok({ workshopId, documentId });
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
    if (!summary) return Result.ok(AiSummaryResponseBuilder.empty());
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
        { summaryText: text }
      );
      if (updated.isFailure) return Result.fail(updated.error);
      return Result.ok(AiSummaryResponseBuilder.fromAdmin(updated.data));
    }

    // No existing summary — need a real documentId to satisfy the FK constraint
    // (ai_summaries.document_id is NOT NULL until a migration makes it nullable).
    const docsResult =
      await this.workshopDocumentsRepo.findByWorkshopId(workshopId);
    if (docsResult.isFailure) return Result.fail(docsResult.error);

    if (!docsResult.data || docsResult.data.length === 0) {
      return Result.fail(aiSummaryErrors.noDocumentFound(workshopId));
    }

    const latestDoc = docsResult.data[docsResult.data.length - 1];
    const upsertResult = await this.aiSummariesRepo.upsert(
      latestDoc.documentId,
      workshopId
    );
    if (upsertResult.isFailure) return Result.fail(upsertResult.error);

    const updated = await this.aiSummariesRepo.updateStatus(
      upsertResult.data.summaryId,
      "DONE",
      { summaryText: text }
    );
    if (updated.isFailure) return Result.fail(updated.error);
    return Result.ok(AiSummaryResponseBuilder.fromAdmin(updated.data));
  }

  // ── Retry after failure ──────────────────────────────────────────

  /**
   * Retries AI summary generation for a workshop that previously failed.
   *
   * Business rules:
   * - Only summaries with FAILED status are eligible for retry.
   * - Looks up the associated workshop_documents record to retrieve the fileUrl.
   * - Resets status to QUEUED and enqueues a new BullMQ job.
   *
   * Side effects:
   * - Updates ai_summaries.status from FAILED to QUEUED.
   * - Enqueues a job to AI_SUMMARY_QUEUE with documentId + fileUrl.
   *
   * @param workshopId - The UUID of the workshop to retry.
   * @returns OkResult on success, OkResult (silent no-op) if no summary or document exists,
   *   or FailResult (AI_SUMMARY_RETRY_NOT_ALLOWED, INTERNAL_ERROR).
   */
  async retryAiSummary(workshopId: string): Promise<Result<void>> {
    const summaryResult =
      await this.aiSummariesRepo.findByWorkshopId(workshopId);
    if (summaryResult.isFailure) return Result.fail(summaryResult.error);
    if (!summaryResult.data) return Result.ok();

    if (summaryResult.data.status !== "FAILED") {
      return Result.fail(aiSummaryErrors.retryNotAllowed(workshopId));
    }

    const documentResult = await this.workshopDocumentsRepo.findById(
      summaryResult.data.documentId
    );
    if (documentResult.isFailure) return Result.fail(documentResult.error);
    if (!documentResult.data) return Result.ok();

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "QUEUED"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    await this.aiSummaryQueue.enqueue("ai-summary.process", {
      documentId: summaryResult.data.documentId,
      workshopId,
      fileUrl: documentResult.data.fileUrl,
    });

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
    await this.markFailed(
      documentId,
      aiSummaryErrors.llmTimeout("worker-timeout").message
    );
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
      { errorMessage }
    );

    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to mark summary FAILED for document ${documentId}: ${updateResult.error.message}`
      );
    }
  }
}
