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
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Res,
  NotFoundException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { DocumentsService } from "../services/documents.service";

import type { Response } from "express";

/** Maximum allowed file size: 50 MB. */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Only PDF files are accepted. */
const ALLOWED_MIME_TYPE = "application/pdf";

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
   * Expects a multipart/form-data request with a `file` field containing
   * a PDF document. The file is validated (PDF MIME type, max 50 MB) and
   * uploaded to S3-compatible object storage. A metadata record is created
   * in the database and an AI summary job is queued with PENDING status.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param file - Uploaded PDF file (validated by ParseFilePipe).
   * @param user - Authenticated user JWT payload identifying the uploader.
   * @returns The uploaded document DTO.
   */
  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @Param("workshopId") workshopId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: ALLOWED_MIME_TYPE }),
        ],
      })
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload
  ) {
    return this.documentsService.uploadDocument(workshopId, file, user.sub);
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
   * Downloads a document file from object storage.
   *
   * Route: GET /admin/workshops/:workshopId/documents/:documentId/download
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Streams the document PDF from object storage directly to the HTTP response.
   * Uses @Res({ passthrough: true }) to set Content-Disposition headers
   * while still delegating the response body to NestJS's stream handling.
   *
   * @param workshopId - The UUID of the parent workshop.
   * @param documentId - The UUID of the document to download.
   * @param res - NestJS response object (passthrough mode).
   * @returns Readable stream piped to the HTTP response.
   */
  @Get(":documentId/download")
  async downloadDocument(
    @Param("workshopId") workshopId: string,
    @Param("documentId") documentId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.documentsService.getDocumentStream(
      workshopId,
      documentId
    );

    if (result.isFailure) {
      throw new NotFoundException(result.error.message);
    }

    res.set({
      "Content-Type": result.data.mimeType,
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
    });

    return result.data.stream;
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
