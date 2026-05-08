import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CheckinStaffAssignmentService } from "../services/checkin-staff-assignment.service";

import type { AssignWorkshopsDto } from "../dto/assign-workshops.dto";

@Controller("admin/checkin-staff")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class CheckinStaffAdminController {
  constructor(
    private readonly checkinStaffAssignmentService: CheckinStaffAssignmentService
  ) {}

  /**
   * POST /admin/checkin-staff/{user_id}/assign-workshops
   *
   * Assigns workshops to a CHECKIN_STAFF user. The assignment replaces any
   * previous workshop list. Changes take effect on the staff member's next
   * login (eventual consistency — JWT is immutable).
   *
   * Response includes an eventual consistency warning.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   * @param assignDto - Validated { workshop_ids: string[] }.
   */
  @Post(":user_id/assign-workshops")
  async assignWorkshops(
    @Param("user_id") userId: string,
    @Body() assignDto: AssignWorkshopsDto
  ) {
    return this.checkinStaffAssignmentService.assignWorkshops(
      userId,
      assignDto.workshopIds
    );
  }

  /**
   * GET /admin/checkin-staff/{user_id}/workshops
   *
   * Returns the list of workshop IDs currently assigned to a CHECKIN_STAFF user.
   * Returns an empty array if no assignments exist.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   */
  @Get(":user_id/workshops")
  async getAssignedWorkshops(@Param("user_id") userId: string) {
    return this.checkinStaffAssignmentService.getAssignedWorkshops(userId);
  }
}
