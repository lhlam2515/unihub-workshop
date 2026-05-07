import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import type { CreateDeviceTokenDto } from "../dto/create-device-token.dto";
import { DeviceTokensService } from "../services/device-tokens.service";

@Controller("device-tokens")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceTokensController {
  constructor(
    private readonly deviceTokensService: DeviceTokensService
  ) {}

  /**
   * POST /device-tokens
   *
   * Registers a device token for push notifications for the authenticated student.
   *
   * Business rules:
   * - Deactivates all existing tokens for the same student+platform before creating the new one.
   * - Only STUDENT role can register device tokens.
   *
   * @param createDto - Validated CreateDeviceTokenDto containing token and platform.
   * @param user - Authenticated user's JWT payload (provides student ID).
   * @returns 201 with the created device token details.
   */
  @Post()
  @Roles("STUDENT")
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateDeviceTokenDto,
    @CurrentUser() user: JwtPayload
  ) {
    const result = await this.deviceTokensService.registerToken(
      user.sub,
      createDto.token,
      createDto.platform
    );
    return result;
  }

  /**
   * DELETE /device-tokens/:token
   *
   * Deactivates (soft-deletes) a device token for the authenticated student.
   *
   * Business rules:
   * - Validates that the token belongs to the requesting student (IDOR prevention).
   * - Only STUDENT role can deactivate device tokens.
   *
   * @param token - The device token string to deactivate.
   * @param user - Authenticated user's JWT payload (provides student ID).
   * @returns 200 with { success: true }.
   */
  @Delete(":token")
  @Roles("STUDENT")
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("token") token: string,
    @CurrentUser() user: JwtPayload
  ) {
    const result = await this.deviceTokensService.deactivateToken(
      token,
      user.sub
    );

    if (result.isFailure) return result;
    return Result.ok({ success: true });
  }
}
