import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CheckinStaffAssignmentService } from "../services/checkin-staff-assignment.service";

import type { AssignWorkshopsDto } from "../dto/assign-workshops.dto";

@Controller("admin/checkin-staff")
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class CheckinStaffAdminController {
  constructor(
    private readonly checkinStaffAssignmentService: CheckinStaffAssignmentService
  ) {}

  /**
   * POST /admin/checkin-staff/{staffId}/assign-workshops
   *
   * Assigns workshops to a CHECKIN_STAFF member. The assignment replaces any
   * previous workshop list. Changes take effect on the next login
   * (eventual consistency — JWT is immutable).
   *
   * @param staffId - The CHECKIN_STAFF UUID.
   * @param assignDto - Validated { workshop_ids: string[] }.
   */
  @Post(":staffId/assign-workshops")
  async assignWorkshops(
    @Param("staffId") staffId: string,
    @Body() assignDto: AssignWorkshopsDto
  ) {
    return this.checkinStaffAssignmentService.assignWorkshops(
      staffId,
      assignDto.workshopIds
    );
  }

  /**
   * GET /admin/checkin-staff/{staffId}/workshops
   *
   * Returns the list of workshop IDs currently assigned to a CHECKIN_STAFF member.
   * Returns an empty array if no assignments exist.
   *
   * @param staffId - The CHECKIN_STAFF UUID.
   */
  @Get(":staffId/workshops")
  async getAssignedWorkshops(@Param("staffId") staffId: string) {
    return this.checkinStaffAssignmentService.getAssignedWorkshops(staffId);
  }
}
