import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import {
  ListSyncJobErrorsQueryDto,
  ListSyncJobsQueryDto,
  TriggerStudentSyncDto,
} from "../dto/trigger-student-sync.dto";
import { StudentSyncService } from "../services/student-sync.service";

/**
 * StudentSyncAdminController
 *
 * Admin REST API for managing student data CSV sync jobs.
 *
 * Endpoints (matching OpenAPI spec `/admin/imports`):
 * - POST   /admin/imports/trigger                — Trigger a new sync job
 * - GET    /admin/imports                         — List all sync jobs (paginated)
 * - GET    /admin/imports/{importId}              — Get status of a specific job
 * - GET    /admin/imports/{importId}/errors       — Get errors for a job (paginated)
 *
 * All endpoints require BTC role.
 */
@Controller("/admin/imports")
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class StudentSyncAdminController {
  constructor(private readonly studentSyncService: StudentSyncService) {}

  /**
   * Trigger a new student data sync job from a CSV file
   *
   * Creates a sync job record and enqueues it for background processing.
   * Returns immediately with the job metadata (non-blocking).
   *
   * @param dto - Request body containing source_file_name
   * @returns OkResult with job metadata (jobId, status, triggeredAt)
   *         or FailResult (INTERNAL_ERROR)
   */
  @Post("trigger")
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Body() dto: TriggerStudentSyncDto): Promise<Result<any>> {
    return this.studentSyncService.triggerSync(dto.filePath);
  }

  /**
   * List all sync jobs with cursor-based pagination
   *
   * Results ordered by triggered_at DESC (most recent first).
   *
   * @param query - Filter and cursor parameters (status, cursor, limit)
   * @returns OkResult with items array, nextCursor, hasMore flag, and limit
   *         or FailResult (INTERNAL_ERROR)
   */
  @Get()
  async listJobs(@Query() query: ListSyncJobsQueryDto): Promise<Result<any>> {
    return this.studentSyncService.listJobs({
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  /**
   * Get the current status and metadata of a sync job
   *
   * @param importId - Sync job UUID from URL path.
   * @returns OkResult with full job record or FailResult (INTERNAL_ERROR)
   */
  @Get(":importId")
  async getJobStatus(
    @Param("importId") importId: string
  ): Promise<Result<any>> {
    return this.studentSyncService.getJob(importId);
  }

  /**
   * Get paginated errors for a sync job
   *
   * Results ordered by row_number ASC.
   *
   * @param importId - Sync job UUID from URL path.
   * @param query - Pagination parameters (page, limit)
   * @returns OkResult with items array and total count
   *         or FailResult (INTERNAL_ERROR)
   */
  @Get(":importId/errors")
  async getJobErrors(
    @Param("importId") importId: string,
    @Query() query: ListSyncJobErrorsQueryDto
  ): Promise<Result<any>> {
    return this.studentSyncService.getJobErrors(importId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
