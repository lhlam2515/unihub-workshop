/**
 * Documents Service
 *
 * Manages workshop document uploads and AI-powered summarization.
 *
 * Business rules:
 * - Documents are linked to a workshop and uploaded by BTC users.
 * - Each uploaded document triggers an AI summary job with PENDING status.
 * - Only FAILED AI summaries can be retried.
 * - Document deletion cascades to remove the associated AI summary.
 *
 * Cross-module note: The Background module is responsible for processing
 * PENDING AI summary jobs and updating the status to DONE or FAILED.
 */

import { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";

import type { NewWorkshopDocument } from "@/infra/database/types/async.types";
import { StorageService } from "@/infra/storage/storage.service";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { AiSummaryResponseBuilder } from "../dto/ai-summary-response.dto";
import { DocumentResponseBuilder } from "../dto/document-response.dto";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";

import type { AiSummaryPublicDto } from "../dto/ai-summary-response.dto";
import type { WorkshopDocumentResponseDto } from "../dto/document-response.dto";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepo: WorkshopDocumentsRepository,
    private readonly workshopsRepo: WorkshopsRepository,
    private readonly aiSummariesRepo: AiSummariesRepository,
    private readonly storageService: StorageService
  ) {}

  /**
   * Uploads a document for a workshop and queues an AI summary generation.
   *
   * Business rules:
   * - The workshop must exist in the database.
   * - The file is uploaded to S3-compatible object storage (Cloudflare R2)
   *   before the database record is created.
   * - An AI summary record is upserted with PENDING status for background processing.
   *
   * Side effects:
   * - Uploads the file buffer to object storage (S3 PutObject).
   * - Inserts a record into workshop_documents table.
   * - Upserts a record into ai_summaries table with PENDING status (triggers Background module).
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param file - Express Multer file object with buffer and metadata.
   * @param uploadedBy - The UUID of the uploading user.
   * @returns OkResult containing the created document DTO, or FailResult with WORKSHOP_NOT_FOUND, UPLOAD_FAILED, INTERNAL_ERROR.
   */
  async uploadDocument(
    workshopId: string,
    file: Express.Multer.File,
    uploadedBy: string
  ): Promise<Result<WorkshopDocumentResponseDto>> {
    const workshopResult = await this.workshopsRepo.findById(workshopId);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    // Upload to S3-compatible object storage first
    const uploadResult = await this.storageService.uploadFile(file, workshopId);
    if (uploadResult.isFailure) return Result.fail(uploadResult.error);

    const documentData: NewWorkshopDocument = {
      workshopId,
      fileUrl: uploadResult.data,
      originalName: file.originalname,
      fileSizeBytes: file.size,
      uploadStatus: "UPLOADED",
      uploadedBy,
    };

    const docResult = await this.documentsRepo.create(documentData);
    if (docResult.isFailure) return Result.fail(docResult.error);

    // Upsert AI summary with PENDING status for the Background module to process
    await this.aiSummariesRepo.upsert(docResult.data.documentId, workshopId);

    return Result.ok(DocumentResponseBuilder.from(docResult.data));
  }

  /**
   * Lists all documents associated with a workshop.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing an array of document DTOs, or FailResult (INTERNAL_ERROR).
   */
  async listDocuments(
    workshopId: string
  ): Promise<Result<WorkshopDocumentResponseDto[]>> {
    const result = await this.documentsRepo.findByWorkshopId(workshopId);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(result.data.map((d) => DocumentResponseBuilder.from(d)));
  }

  /**
   * Deletes a specific document from a workshop.
   *
   * Business rules:
   * - Verifies the document exists and belongs to the specified workshop.
   * - Deleting a document cascades to remove its associated AI summary.
   * - The underlying storage object is deleted fire-and-forget — a storage
   *   error does NOT block the database deletion or propagate to the caller.
   *
   * Side effects:
   * - Removes the record from workshop_documents table.
   * - Cascading delete removes the associated ai_summaries record.
   * - Attempts to delete the file from S3-compatible object storage
   *   (fire-and-forget; failures are logged by the storage service).
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param documentId - The UUID of the document to delete.
   * @returns OkResult with void on success, or FailResult with WORKSHOP_NOT_FOUND, INTERNAL_ERROR.
   */
  async deleteDocument(
    workshopId: string,
    documentId: string
  ): Promise<Result<void>> {
    const docResult = await this.documentsRepo.findById(documentId);
    if (docResult.isFailure) return Result.fail(docResult.error);
    if (!docResult.data)
      return Result.fail(workshopErrors.notFound(documentId));

    if (docResult.data.workshopId !== workshopId) {
      return Result.fail(workshopErrors.notFound(documentId));
    }

    // Fire-and-forget: delete from object storage, don't block on failure
    void this.storageService.deleteFile(docResult.data.fileUrl);

    const deleteResult = await this.documentsRepo.delete(documentId);
    if (deleteResult.isFailure) return Result.fail(deleteResult.error);

    return Result.ok();
  }

  /**
   * Retrieves the AI-generated summary for a workshop's documents.
   *
   * Returns the public-safe version of the summary (summary_text only included
   * when status is DONE). Returns { status: "NONE" } when no summary exists
   * rather than a failure result.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the public AI summary DTO (or { status: "NONE" }), or FailResult (INTERNAL_ERROR).
   */
  async getAiSummary(workshopId: string): Promise<Result<AiSummaryPublicDto>> {
    const result = await this.aiSummariesRepo.findByWorkshopId(workshopId);
    if (result.isFailure) return Result.fail(result.error);
    const latest = result.data[0];
    if (!latest) return Result.ok({ status: "NONE" });
    return Result.ok(AiSummaryResponseBuilder.fromPublic(latest));
  }

  /**
   * Retries AI summary generation for a previously failed document.
   *
   * Business rules:
   * - Only summaries with FAILED status are eligible for retry; non-FAILED summaries are silently skipped.
   * - Resets the status to PENDING to re-trigger the Background module.
   *
   * Side effects:
   * - Updates the ai_summaries record status from FAILED to PENDING.
   * - The Background module will pick up the PENDING job for reprocessing.
   *
   * @param documentId - The UUID of the document to retry summarization for.
   * @returns OkResult with void on success (no-op if not FAILED), or FailResult (INTERNAL_ERROR).
   */
  async retryAiSummary(documentId: string): Promise<Result<void>> {
    const summaryResult =
      await this.aiSummariesRepo.findByDocumentId(documentId);
    if (summaryResult.isFailure) return Result.fail(summaryResult.error);
    if (!summaryResult.data) return Result.ok();

    if (summaryResult.data.status !== "FAILED") {
      // No-op: only FAILED summaries can be retried
      return Result.ok();
    }

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "QUEUED"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    return Result.ok();
  }

  /**
   * Retrieves a document's file stream for download from object storage.
   *
   * Business rules:
   * - Verifies the document exists and belongs to the specified workshop.
   * - Delegates to StorageService.getFileStream() for the actual download —
   *   the returned stream is the S3 SDK's native body stream.
   *
   * Side effects: Opens an HTTP connection to the S3 endpoint.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param documentId - The UUID of the document to download.
   * @returns OkResult with { stream, filename, mimeType }, or FailResult
   *          (WORKSHOP_NOT_FOUND | STORAGE_FILE_NOT_FOUND | STORAGE_DOWNLOAD_FAILED).
   */
  async getDocumentStream(
    workshopId: string,
    documentId: string
  ): Promise<Result<{ stream: Readable; filename: string; mimeType: string }>> {
    const docResult = await this.documentsRepo.findById(documentId);
    if (docResult.isFailure) return Result.fail(docResult.error);
    if (!docResult.data)
      return Result.fail(workshopErrors.notFound(documentId));

    if (docResult.data.workshopId !== workshopId) {
      return Result.fail(workshopErrors.notFound(documentId));
    }

    const streamResult = await this.storageService.getFileStream(
      docResult.data.fileUrl
    );
    if (streamResult.isFailure) return Result.fail(streamResult.error);

    return Result.ok({
      stream: streamResult.data,
      filename: docResult.data.originalName ?? "document.pdf",
      mimeType: "application/pdf",
    });
  }
}
