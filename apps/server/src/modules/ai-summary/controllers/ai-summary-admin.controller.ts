/**
 * AI Summary Admin Controller
 *
 * Handles BTC-only AI summary management for workshops.
 * All endpoints require JWT authentication and BTC role.
 *
 * Endpoints:
 * - POST /admin/workshops/:workshopId/summary — upload PDF and trigger AI summary
 * - GET /admin/workshops/:workshopId/summary — get AI-generated summary
 * - PUT /admin/workshops/:workshopId/summary — manually override summary text
 * - POST /admin/workshops/:workshopId/summary/retry — retry failed AI summary
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { AiSummaryService } from "../services/ai-summary.service";

/** Maximum allowed file size: 10 MB. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Only PDF files are accepted. */
const ALLOWED_MIME_TYPE = "application/pdf";

@Controller("admin/workshops/:workshopId/summary")
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class AiSummaryAdminController {
  constructor(private readonly aiSummaryService: AiSummaryService) {}

  /**
   * Uploads a PDF document for a workshop and queues AI summary generation.
   *
   * Route: POST /admin/workshops/:workshopId/summary
   * Expects a multipart/form-data request with a `file` field containing
   * a PDF document. The file is validated (PDF MIME type, max 50 MB).
   *
   * @param workshopId - The UUID of the target workshop.
   * @param file - Uploaded PDF file (validated by ParseFilePipe).
   * @param user - JWT payload containing the BTC admin's userId.
   * @returns OkResult with the upload confirmation.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
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
    return this.aiSummaryService.uploadDocument(workshopId, file, user.sub);
  }

  /**
   * Retrieves the AI-generated summary for a workshop.
   *
   * Route: GET /admin/workshops/:workshopId/summary
   * Returns the admin-safe version with full field visibility.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns AiSummaryAdminDto with status and content (if available).
   */
  @Get()
  async getAiSummary(@Param("workshopId") workshopId: string) {
    return this.aiSummaryService.getAiSummary(workshopId);
  }

  /**
   * Manually overrides the AI-generated summary text for a workshop.
   *
   * Route: PUT /admin/workshops/:workshopId/summary
   * Sets status=DONE, replaces summary_text, and updates generated_at.
   * Creates a new summary record if none exists for this workshop.
   *
   * @param workshopId - The UUID of the workshop.
   * @param text - The manual summary text to set.
   * @returns AiSummaryAdminDto with the updated summary.
   */
  @Put()
  async updateSummary(
    @Param("workshopId") workshopId: string,
    @Body("text") text: string
  ) {
    return this.aiSummaryService.updateSummaryText(workshopId, text);
  }

  /**
   * Retries AI summary generation for a workshop that previously failed.
   *
   * Route: POST /admin/workshops/:workshopId/summary/retry
   * Only summaries with FAILED status are reset to QUEUED for reprocessing.
   *
   * @param workshopId - The UUID of the workshop to retry.
   * @returns Confirmation that the retry has been submitted.
   */
  @Post("retry")
  @HttpCode(HttpStatus.ACCEPTED)
  async retryAiSummary(@Param("workshopId") workshopId: string) {
    return this.aiSummaryService.retryAiSummary(workshopId);
  }
}
