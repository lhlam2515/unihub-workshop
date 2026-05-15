import { Controller, Get, Param, Query } from "@nestjs/common";

import { Roles } from "@/shared/decorators/roles.decorator";

import { ListAdminRegistrationsQueryDto } from "../dto/list-admin-registrations-query.dto";
import { RegistrationsService } from "../services/registrations.service";

/**
 * Admin-only controller for registration management across workshops.
 * All routes require JWT authentication and BTC role.
 */
@Controller("admin/workshops")
@Roles("BTC")
export class RegistrationsAdminController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * Lists all registrations for a specific workshop (admin view).
   *
   * GET /admin/workshops/{workshopId}/registrations
   *
   * @param workshopId - UUID of the target workshop.
   * @param query - Filter and pagination options (status, cursor, limit).
   * @returns Paginated list of RegistrationAdminDto.
   */
  @Get(":workshopId/registrations")
  async adminListRegistrations(
    @Param("workshopId") workshopId: string,
    @Query() query: ListAdminRegistrationsQueryDto
  ) {
    return this.registrationsService.getRegistrationsForWorkshop(
      workshopId,
      query
    );
  }
}
