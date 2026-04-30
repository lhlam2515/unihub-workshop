/**
 * Documents Service
 *
 * Manages workshop document uploads and AI-powered summarization.
 *
 * Business rules:
 * - Documents are linked to a workshop and uploaded by ORGANIZER users.
 * - Each uploaded document triggers an AI summary job with PENDING status.
 * - Only FAILED AI summaries can be retried.
 * - Document deletion cascades to remove the associated AI summary.
 *
 * Cross-module note: The Background module is responsible for processing
 * PENDING AI summary jobs and updating the status to DONE or FAILED.
 */

import { Injectable } from "@nestjs/common";

import type { NewWorkshopDocument } from "@/database/types/async.types";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { AiSummaryResponseBuilder } from "../dto/ai-summary-response.dto";
import { DocumentResponseBuilder } from "../dto/document-response.dto";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";

import type { AiSummaryPublicDto } from "../dto/ai-summary-response.dto";
import type { WorkshopDocumentResponseDto } from "../dto/document-response.dto";

/**
 * Represents an uploaded file object from Express/Multer.
 */
interface UploadedFile {
  originalname: string;
  size: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepo: WorkshopDocumentsRepository,
    private readonly workshopsRepo: WorkshopsRepository,
    private readonly aiSummariesRepo: AiSummariesRepository
  ) {}

  /**
   * Uploads a document for a workshop and queues an AI summary generation.
   *
   * Business rules:
   * - The workshop must exist in the database.
   * - The file URL is a placeholder until object storage is integrated.
   * - An AI summary record is upserted with PENDING status for background processing.
   *
   * Side effects:
   * - Inserts a record into workshop_documents table.
   * - Upserts a record into ai_summaries table with PENDING status (triggers Background module).
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param file - Uploaded file object (Express.Multer.File shape).
   * @param uploadedBy - The UUID of the uploading user.
   * @returns OkResult containing the created document DTO, or FailResult with WORKSHOP_NOT_FOUND, INTERNAL_ERROR.
   */
  async uploadDocument(
    workshopId: string,
    file: UploadedFile,
    uploadedBy: string
  ): Promise<Result<WorkshopDocumentResponseDto>> {
    const workshopResult = await this.workshopsRepo.findById(workshopId);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    const fileName = file.originalname ?? `document-${Date.now()}`;

    // TODO: Replace with actual object storage URL. Currently using placeholder.
    const fileUrl = `placeholder://workshops/${workshopId}/${fileName}`;

    const documentData: NewWorkshopDocument = {
      workshopId,
      fileUrl,
      originalName: fileName,
      fileSizeBytes: file.size ?? 0,
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
   *
   * Side effects:
   * - Removes the record from workshop_documents table.
   * - Cascading delete removes the associated ai_summaries record.
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
      "PENDING"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    return Result.ok();
  }
}
