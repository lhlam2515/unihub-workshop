/**
 * Users Admin Controller
 *
 * Xử lý admin operations trên users:
 * - GET /admin/users (list)
 * - GET /admin/users/{id} (detail)
 * - PATCH /admin/users/{id}/status (update status)
 * - POST /admin/users/{id}/revoke-token (revoke all tokens)
 *
 * Yêu cầu role: ORGANIZER
 */

import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "@shared/decorators/current-user.decorator";
import { Roles } from "@shared/decorators/roles.decorator";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER") // or use UserRole.ORGANIZER enum
export class UsersAdminController {
  constructor(private readonly usersService: any) {}

  /**
   * GET /admin/users
   * @query role? filter by role
   * @query page, limit pagination
   */
  @Get()
  async listUsers(@Query() query: any) {
    // TODO: Call usersService.listUsers(query)
    // TODO: Return paginated list of UserResponseDto
  }

  /**
   * GET /admin/users/{id}
   */
  @Get(":id")
  async getUserById(@Param("id") id: string) {
    // TODO: Call usersService.getUserById(id)
    // TODO: Return UserResponseDto
  }

  /**
   * PATCH /admin/users/{id}/status
   * @body { status: 'ACTIVE' | 'SUSPENDED' }
   */
  @Patch(":id/status")
  async updateUserStatus(
    @Param("id") id: string,
    @Body() updateStatusDto: any
  ) {
    // TODO: Validate with Zod (UpdateUserStatusSchema)
    // TODO: Call usersService.updateUserStatus(id, updateStatusDto)
    // TODO: When SUSPENDED, auto-blacklist all user's tokens
  }

  /**
   * POST /admin/users/{id}/revoke-token
   * Revoke all active tokens for a user
   */
  @Post(":id/revoke-token")
  async revokeUserTokens(@Param("id") id: string, @CurrentUser() admin: any) {
    // TODO: Call tokenService to revoke all tokens for this user
    // TODO: Mark all issued tokens as blacklisted
  }
}
