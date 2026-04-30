/**
 * Document Response DTO
 *
 * Shape:
 * { document_id, workshop_id, file_url, original_name, file_size_bytes, upload_status, uploaded_at }
 */

import type { WorkshopDocument } from "@/database/types/async.types";

export interface WorkshopDocumentResponseDto {
  document_id: string;
  workshop_id: string;
  file_url: string;
  original_name: string;
  file_size_bytes: number;
  upload_status: string;
  uploaded_at: Date;
}

export class DocumentResponseBuilder {
  /**
   * Builds a document response DTO from a database entity.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - documentId -> document_id
   * - workshopId -> workshop_id
   * - fileUrl -> file_url
   * - originalName -> original_name (nullish -> empty string fallback)
   * - fileSizeBytes -> file_size_bytes (nullish -> 0 fallback)
   * - uploadStatus -> upload_status
   * - uploadedAt -> uploaded_at
   *
   * @param document - Raw workshop document entity from the database.
   * @returns WorkshopDocumentResponseDto with API-safe fields.
   */
  static from(document: WorkshopDocument): WorkshopDocumentResponseDto {
    return {
      document_id: document.documentId,
      workshop_id: document.workshopId,
      file_url: document.fileUrl,
      original_name: document.originalName ?? "",
      file_size_bytes: document.fileSizeBytes ?? 0,
      upload_status: document.uploadStatus,
      uploaded_at: document.uploadedAt,
    };
  }
}
