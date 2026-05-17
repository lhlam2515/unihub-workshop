import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { StaffAdminService } from "../services/staff-admin.service";

@Controller("admin/staff")
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class StaffAdminController {
  constructor(private readonly staffAdminService: StaffAdminService) {}

  /**
   * GET /admin/staff
   *
   * Returns a paginated list of staff, optionally filtered by role.
   */
  @Get()
  async listStaff(@Query("role") role?: string, @Query("q") q?: string) {
    return this.staffAdminService.listStaff(role, q);
  }

  /**
   * GET /admin/staff/{staffId}
   *
   * Returns details of a single staff member.
   */
  @Get(":staffId")
  async getStaffById(@Param("staffId") staffId: string) {
    return this.staffAdminService.getStaffById(staffId);
  }

  /**
   * PATCH /admin/staff/{staffId}/status
   *
   * Activates or deactivates a staff member's account.
   * When deactivated, the staff member's sessions are revoked via a Redis key.
   *
   * @param staffId - The staff UUID.
   * @param body - { isActive: boolean }.
   */
  @Patch(":staffId/status")
  async updateStaffStatus(
    @Param("staffId") staffId: string,
    @Body() body: { isActive: boolean }
  ) {
    return this.staffAdminService.updateStaffStatus(staffId, body.isActive);
  }
}
