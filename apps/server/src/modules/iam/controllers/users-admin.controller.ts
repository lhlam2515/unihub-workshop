import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { UpdateUserStatusSchema } from "../dto/update-user-status.dto";
import { UsersService } from "../services/users.service";

import type { UpdateUserStatusDto } from "../dto/update-user-status.dto";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /admin/users
   *
   * Returns a paginated list of users, optionally filtered by role.
   */
  @Get()
  async listUsers(
    @Query("role") role?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.usersService.listUsers(role, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * GET /admin/users/{id}
   *
   * Returns details of a single user.
   *
   * @param id - The target user's UUID.
   */
  @Get(":id")
  async getUserById(@Param("id") id: string) {
    return this.usersService.getUserById(id);
  }

  /**
   * PATCH /admin/users/{id}/status
   *
   * Updates a user's account status. When set to SUSPENDED, the admin's
   * current token is auto-blacklisted to terminate the suspended session.
   *
   * @param id - The target user's UUID.
   * @param updateStatusDto - Validated { status: ACTIVE | SUSPENDED }.
   * @param admin - The authenticated ORGANIZER's JWT payload (for token revocation).
   */
  @Patch(":id/status")
  async updateUserStatus(
    @Param("id") id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
    @CurrentUser() admin: JwtPayload
  ) {
    const parsed = UpdateUserStatusSchema.parse(updateStatusDto);
    return this.usersService.updateUserStatus(id, parsed.status, admin.jti);
  }

  /**
   * POST /admin/users/{id}/revoke-token
   *
   * Revokes all active tokens for a user, forcing them to re-authenticate.
   *
   * @param id - The target user's UUID.
   */
  @Post(":id/revoke-token")
  async revokeUserTokens(@Param("id") id: string) {
    return this.usersService.revokeUserTokens(id);
  }
}
