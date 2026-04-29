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
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import { StudentSyncService } from "../services/student-sync.service";

@Controller("/admin/student-sync")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class StudentSyncAdminController {
  constructor(private readonly studentSyncService: StudentSyncService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Body() dto: any): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get()
  async listJobs(@Query() query: any): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get(":jobId")
  async getJobStatus(@Param("jobId") jobId: string): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get(":jobId/errors")
  async getJobErrors(
    @Param("jobId") jobId: string,
    @Query() query: any
  ): Promise<Result<any>> {
    throw new Error("Not implemented");
  }
}
