/**
 * Checkin Staff Admin Controller
 *
 * Xử lý quản lý phân công workshop cho nhân sự check-in:
 * - POST /admin/checkin-staff/{user_id}/assign-workshops
 * - GET /admin/checkin-staff/{user_id}/workshops
 *
 * Yêu cầu role: ORGANIZER
 *
 * Note: Eventual Consistency warning về phân công workshop
 */

import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';
import { RolesGuard } from '@core/guards/roles.guard';
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';

@Controller('admin/checkin-staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER')
export class CheckinStaffAdminController {
  constructor(private readonly checkinStaffAssignmentService: any) {}

  /**
   * POST /admin/checkin-staff/{user_id}/assign-workshops
   * @body { workshop_ids: string[] }
   *
   * Assigns workshops to a CHECKIN_STAFF user
   * Response includes eventual consistency warning
   */
  @Post(':user_id/assign-workshops')
  async assignWorkshops(
    @Param('user_id') userId: string,
    @Body() assignDto: any
  ) {
    // TODO: Validate with Zod (AssignWorkshopsSchema)
    // TODO: Call checkinStaffAssignmentService.assignWorkshops(userId, assignDto.workshop_ids)
    // TODO: Include eventual consistency warning in response
  }

  /**
   * GET /admin/checkin-staff/{user_id}/workshops
   *
   * Returns list of workshops assigned to this CHECKIN_STAFF
   */
  @Get(':user_id/workshops')
  async getAssignedWorkshops(@Param('user_id') userId: string) {
    // TODO: Call checkinStaffAssignmentService.getAssignedWorkshops(userId)
    // TODO: Return list of WorkshopSummaryDto
  }
}
