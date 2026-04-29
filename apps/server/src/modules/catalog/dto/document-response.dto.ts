/**
 * Document Response DTO
 *
 * Shape:
 * { document_id, workshop_id, file_url, original_name, file_size_bytes, upload_status, uploaded_at }
 */

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
  static from(document: any): WorkshopDocumentResponseDto {
    // TODO: Map to response shape
    return {
      document_id: "",
      workshop_id: "",
      file_url: "",
      original_name: "",
      file_size_bytes: 0,
      upload_status: "",
      uploaded_at: new Date(),
    };
  }
}
