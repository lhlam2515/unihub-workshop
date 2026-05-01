import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
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
 * Endpoints:
 * - POST   /admin/student-sync        — Trigger a new sync job
 * - GET    /admin/student-sync        — List all sync jobs (paginated)
 * - GET    /admin/student-sync/:jobId — Get status of a specific job
 * - GET    /admin/student-sync/:jobId/errors — Get errors for a job (paginated)
 *
 * All endpoints require ORGANIZER role.
 */
@Controller("/admin/student-sync")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
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
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Body() dto: TriggerStudentSyncDto): Promise<Result<any>> {
    return this.studentSyncService.triggerSync(dto.source_file_name);
  }

  /**
   * List all sync jobs with pagination
   *
   * Results ordered by triggered_at DESC (most recent first).
   *
   * @param query - Pagination parameters (page, limit)
   * @returns OkResult with items array and total count
   *         or FailResult (INTERNAL_ERROR)
   */
  @Get()
  async listJobs(@Query() query: ListSyncJobsQueryDto): Promise<Result<any>> {
    return this.studentSyncService.listJobs({
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Get the current status and metadata of a sync job
   *
   * @param jobId - Sync job UUID from URL path
   * @returns OkResult with full job record or FailResult (INTERNAL_ERROR)
   */
  @Get(":jobId")
  async getJobStatus(@Param("jobId") jobId: string): Promise<Result<any>> {
    return this.studentSyncService.getJob(jobId);
  }

  /**
   * Get paginated errors for a sync job
   *
   * Results ordered by row_number ASC.
   *
   * @param jobId - Sync job UUID from URL path
   * @param query - Pagination parameters (page, limit)
   * @returns OkResult with items array and total count
   *         or FailResult (INTERNAL_ERROR)
   */
  @Get(":jobId/errors")
  async getJobErrors(
    @Param("jobId") jobId: string,
    @Query() query: ListSyncJobErrorsQueryDto
  ): Promise<Result<any>> {
    return this.studentSyncService.getJobErrors(jobId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
