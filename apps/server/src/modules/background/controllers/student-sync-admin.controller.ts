import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';
import { RolesGuard } from '@core/guards/roles.guard';
import { UserRole } from '@database/types';
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { Result } from '@shared/response/result';

import { TriggerStudentSyncDto } from '../dto/trigger-student-sync.dto';
import { StudentSyncService } from '../services/student-sync.service';

/**
 * StudentSyncAdminController
 *
 * Handles student data synchronization (bulk import from CSV).
 * All endpoints require ORGANIZER role.
 *
 * Endpoints:
 * - POST /admin/student-sync — Trigger sync job (returns 202 Accepted)
 * - GET /admin/student-sync — List all sync jobs
 * - GET /admin/student-sync/{job_id} — Get single job status
 * - GET /admin/student-sync/{job_id}/errors — Get job errors with pagination
 *
 * TODO: Implement all endpoints
 */
@Controller('/admin/student-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER)
export class StudentSyncAdminController {
  constructor(private readonly studentSyncService: StudentSyncService) {}

  // TODO: Implement POST /admin/student-sync
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Body() dto: TriggerStudentSyncDto): Promise<Result<any>> {
    // Call studentSyncService.triggerSync(sourceFileName)
    // Returns 202 Accepted immediately (job runs in background)
    // Response: { job_id, status: 'QUEUED', created_at }
  }

  // TODO: Implement GET /admin/student-sync
  @Get()
  async listJobs(@Query() query: any): Promise<Result<any>> {
    // Call studentSyncService.getJobs(pagination)
    // Return paginated list of sync jobs with status
  }

  // TODO: Implement GET /admin/student-sync/{job_id}
  @Get(':jobId')
  async getJobStatus(@Param('jobId') jobId: string): Promise<Result<any>> {
    // Call studentSyncService.getJob(jobId)
    // Return full job status (total, processed, failed, current_row, error_count)
  }

  // TODO: Implement GET /admin/student-sync/{job_id}/errors
  @Get(':jobId/errors')
  async getJobErrors(
    @Param('jobId') jobId: string,
    @Query() query: any
  ): Promise<Result<any>> {
    // Call studentSyncService.getJobErrors(jobId, pagination)
    // Return paginated list of sync errors (row_number, raw_data, error_reason)
  }
}
