/**
 * Documents Admin Controller
 *
 * Handles ORGANIZER-only document management for workshop materials.
 * All endpoints require JWT authentication and ORGANIZER role.
 *
 * Endpoints:
 * - POST /admin/workshops/:workshopId/documents — upload a document
 * - GET /admin/workshops/:workshopId/documents — list all documents for a workshop
 * - DELETE /admin/workshops/:workshopId/documents/:documentId — delete a document
 * - GET /admin/workshops/:workshopId/documents/summary — get AI-generated summary
 * - POST /admin/workshops/:workshopId/documents/:documentId/retry-summary — retry failed AI summary
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { DocumentsService } from "../services/documents.service";

@Controller("admin/workshops/:workshopId/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class DocumentsAdminController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Uploads a document for a workshop.
   *
   * Route: POST /admin/workshops/:workshopId/documents
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Stores the document metadata and upserts an AI summary record with
   * PENDING status for background processing.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param body - Document upload payload (file metadata, original name, size).
   * @param user - Authenticated user JWT payload identifying the uploader.
   * @returns The uploaded document DTO.
   */
  @Post()
  async uploadDocument(
    @Param("workshopId") workshopId: string,
    @Body() body: any,
    @CurrentUser() user: JwtPayload
  ) {
    return this.documentsService.uploadDocument(workshopId, body, user.sub);
  }

  /**
   * Lists all documents associated with a workshop.
   *
   * Route: GET /admin/workshops/:workshopId/documents
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   *
   * @param workshopId - The UUID of the parent workshop.
   * @returns Array of document DTOs.
   */
  @Get()
  async listDocuments(@Param("workshopId") workshopId: string) {
    return this.documentsService.listDocuments(workshopId);
  }

  /**
   * Deletes a specific document from a workshop.
   *
   * Route: DELETE /admin/workshops/:workshopId/documents/:documentId
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Removes the document record from the database. The associated AI
   * summary is cascaded on delete.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param documentId - The UUID of the document to delete.
   * @returns Confirmation of deletion.
   */
  @Delete(":documentId")
  async deleteDocument(
    @Param("workshopId") workshopId: string,
    @Param("documentId") documentId: string
  ) {
    return this.documentsService.deleteDocument(workshopId, documentId);
  }

  /**
   * Retrieves the AI-generated summary for a workshop's documents.
   *
   * Route: GET /admin/workshops/:workshopId/documents/summary
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Returns the public-safe version (summary_text only included when
   * status is DONE). Admin sees the same shape via this endpoint.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @returns AI summary DTO with status and content (if available).
   */
  @Get("summary")
  async getAiSummary(@Param("workshopId") workshopId: string) {
    return this.documentsService.getAiSummary(workshopId);
  }

  /**
   * Retries AI summary generation for a document that previously failed.
   *
   * Route: POST /admin/workshops/:workshopId/documents/:documentId/retry-summary
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Only summaries with FAILED status are reset to PENDING for reprocessing.
   *
   * @param documentId - The UUID of the document to retry.
   * @returns Confirmation that the retry has been submitted.
   */
  @Post(":documentId/retry-summary")
  async retryAiSummary(@Param("documentId") documentId: string) {
    return this.documentsService.retryAiSummary(documentId);
  }
}
