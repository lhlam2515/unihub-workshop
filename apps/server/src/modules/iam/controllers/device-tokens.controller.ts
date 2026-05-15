import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Response,
} from "@nestjs/common";

import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { DeviceTokensService } from "../services/device-tokens.service";

import type { CreateDeviceTokenDto } from "../dto/create-device-token.dto";
import type { Response as ExpressResponse } from "express";

@Controller("device-tokens")
export class DeviceTokensController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  /**
   * POST /device-tokens
   *
   * Registers a device token for push notifications for the authenticated student.
   *
   * Business rules:
   * - If the token already exists for this student, updates lastSeen and returns 200.
   * - If the token is new, deactivates all existing tokens for the same student+platform
   *   before creating the new one, and returns 201.
   * - Only STUDENT role can register device tokens.
   *
   * @param createDto - Validated CreateDeviceTokenDto containing token and platform.
   * @param user - Authenticated user's JWT payload (provides student ID).
   * @param response - Express response object to set status code dynamically.
   * @returns 201 (new) or 200 (upsert) with device token details.
   */
  @Post()
  @Roles("STUDENT")
  async create(
    @Body() createDto: CreateDeviceTokenDto,
    @CurrentUser() user: JwtPayload,
    @Response({ passthrough: true }) response: ExpressResponse
  ) {
    const result = await this.deviceTokensService.registerToken(
      user.studentId!,
      createDto.token,
      createDto.platform
    );

    if (result.isFailure) return result;

    const { isNew, lastSeen, createdAt, ...token } = result.data;
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return Result.ok({
      ...token,
      lastSeen: lastSeen.toISOString(),
      createdAt: createdAt.toISOString(),
    });
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
   * @returns 204 No Content on success.
   */
  @Delete(":token")
  @Roles("STUDENT")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("token") token: string, @CurrentUser() user: JwtPayload) {
    const result = await this.deviceTokensService.deactivateToken(
      token,
      user.studentId!
    );

    if (result.isFailure) return result;
    return;
  }
}
