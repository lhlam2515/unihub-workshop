/**
 * Documents Admin Controller
 *
 * Xử lý upload PDF:
 * - POST /admin/workshops/{id}/documents (upload, auto-queue AI summary)
 * - GET /admin/workshops/{id}/documents (list)
 * - DELETE /admin/documents/{id}
 * - GET /admin/documents/{id}/summary (AI summary status)
 * - POST /admin/documents/{id}/ai-retry (retry failed summary)
 *
 * Yêu cầu role: ORGANIZER
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

@Controller("admin/workshops")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class DocumentsAdminController {
  constructor(private readonly documentsService: any) {}

  /**
   * POST /admin/workshops/{id}/documents
   * Upload PDF and auto-queue AI summary
   */
  @Post(":id/documents")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @Param("id") workshopId: string,
    @UploadedFile() file: any,
    @CurrentUser() user: any
  ) {
    // TODO: Validate file is PDF
    // TODO: Call documentsService.uploadDocument(workshopId, file, user.id)
    // TODO: Auto-queue AI summary job
    throw new Error("Not implemented");
  }

  /**
   * GET /admin/workshops/{id}/documents
   */
  @Get(":id/documents")
  async listDocuments(@Param("id") workshopId: string) {
    // TODO: Call documentsService.getDocuments(workshopId)
    throw new Error("Not implemented");
  }

  /**
   * DELETE /admin/documents/{id}
   */
  @Delete("documents/:id")
  async deleteDocument(@Param("id") documentId: string) {
    // TODO: Call documentsService.deleteDocument(documentId)
    // TODO: Remove file from Object Storage
    throw new Error("Not implemented");
  }

  /**
   * GET /admin/documents/{id}/summary
   */
  @Get("documents/:id/summary")
  async getAiSummaryStatus(@Param("id") documentId: string) {
    // TODO: Call documentsService.getAiSummaryStatus(documentId)
    throw new Error("Not implemented");
  }

  /**
   * POST /admin/documents/{id}/ai-retry
   * Retry AI summary for failed documents
   */
  @Post("documents/:id/ai-retry")
  async retryAiSummary(@Param("id") documentId: string) {
    // TODO: Check current status is FAILED
    // TODO: Re-queue AI summary job
    throw new Error("Not implemented");
  }
}
