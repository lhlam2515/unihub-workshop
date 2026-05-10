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

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { UsersService } from "../services/users.service";

import type { ListUsersQueryDto } from "../dto/list-users-query.dto";
import type { UpdateUserStatusDto } from "../dto/update-user-status.dto";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /admin/users
   *
   * Returns a paginated list of users, optionally filtered by role.
   */
  @Get()
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
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
   * Updates a user's account status. When set to SUSPENDED, all active
   * sessions for that user are revoked via a Redis suspension flag.
   *
   * @param id - The target user's UUID.
   * @param updateStatusDto - Validated { status: ACTIVE | SUSPENDED }.
   */
  @Patch(":id/status")
  async updateUserStatus(
    @Param("id") id: string,
    @Body() updateStatusDto: UpdateUserStatusDto
  ) {
    return this.usersService.updateUserStatus(id, updateStatusDto.status);
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
