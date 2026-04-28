/**
 * Documents Service
 *
 * - uploadDocument(workshopId, file, uploadedBy) — auto-queue AI summary
 * - deleteDocument(id) — delete from DB and Object Storage
 * - getAiSummaryStatus(documentId)
 * - retryAiSummary(documentId) — only when status = FAILED
 */

import { Injectable } from '@nestjs/common';

import { WorkshopDocumentsRepository } from '../repositories/workshop-documents.repository';

@Injectable()
export class DocumentsService {
  constructor(private readonly documentsRepo: WorkshopDocumentsRepository) {}

  /**
   * uploadDocument(workshopId: string, file: Express.Multer.File, uploadedBy: string)
   *
   * TODO: Implement
   * 1. Save file to Object Storage
   * 2. Save document record to DB
   * 3. Queue AI summary job
   */
  async uploadDocument(workshopId: string, file: any, uploadedBy: string) {
    // TODO: Implement
  }

  /**
   * deleteDocument(id: string)
   *
   * TODO: Implement
   * 1. Delete from DB
   * 2. Delete from Object Storage
   */
  async deleteDocument(id: string) {
    // TODO: Implement
  }

  /**
   * getAiSummaryStatus(documentId: string)
   *
   * TODO: Get summary status and content if available
   */
  async getAiSummaryStatus(documentId: string) {
    // TODO: Implement
  }

  /**
   * retryAiSummary(documentId: string)
   *
   * TODO: Re-queue job only if status = FAILED
   */
  async retryAiSummary(documentId: string) {
    // TODO: Implement
  }
}
