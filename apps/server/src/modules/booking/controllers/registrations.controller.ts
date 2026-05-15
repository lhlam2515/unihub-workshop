import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";

import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { IdempotencyKey } from "@/shared/decorators/idempotency-key.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreateRegistrationDto } from "../dto/create-registration.dto";
import { ListRegistrationsQueryDto } from "../dto/list-registrations-query.dto";
import { RegistrationsService } from "../services/registrations.service";

import type { Response } from "express";

@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * Creates a new workshop registration.
   *
   * POST /registrations
   *
   * Returns 201 for first-time registration, 200 for idempotent replay
   * (same X-Idempotency-Key reused, result already exists).
   *
   * @param dto - Zod-validated body containing the target workshop_id (UUID).
   * @param idempotencyKey - X-Idempotency-Key header value for safe retry.
   * @param user - JWT payload providing student identity.
   * @param response - Express response used to set dynamic status code.
   * @returns HTTP 201 with RegistrationDto on first-time, 200 on replay, or error response.
   */
  @RateLimit([
    { tier: "T2", limit: 30, windowMs: 60000 },
    {
      tier: "T3",
      limit: 5,
      windowMs: 60000,
      resourceIdSource: "body.workshopId",
    },
  ])
  @Roles("STUDENT")
  @Post()
  async createRegistration(
    @Body() dto: CreateRegistrationDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.registrationsService.register(
      user.studentId!,
      dto,
      idempotencyKey
    );
    if (result.isFailure) return result;
    response.status(result.data.isReplay ? HttpStatus.OK : HttpStatus.CREATED);
    return Result.ok(result.data.registration);
  }

  /**
   * Lists the authenticated student's registration history.
   *
   * GET /registrations
   *
   * @param user - JWT payload providing student identity.
   * @param status - Optional status filter.
   * @param page - Page number for pagination (default 1).
   * @param limit - Items per page (default 20).
   * @returns HTTP 200 with paginated list of RegistrationDto.
   */
  @Roles("STUDENT")
  @Get()
  async getMyRegistrations(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListRegistrationsQueryDto
  ) {
    return this.registrationsService.getMyRegistrations(user.studentId!, query);
  }

  /**
   * Retrieves a single registration by ID with IDOR enforcement.
   *
   * GET /registrations/{registrationId}
   *
   * @param id - Registration UUID.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 200 with RegistrationDto, or 404.
   */
  @Roles("STUDENT")
  @Get(":registrationId")
  async getMyRegistration(
    @Param("registrationId") registrationId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.getRegistrationDetail(
      user.studentId!,
      registrationId
    );
  }

  /**
   * Cancels the authenticated student's own registration.
   *
   * DELETE /registrations/{registrationId}
   *
   * Releases the reserved seat and seat lock.
   *
   * @param id - Registration UUID.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 200 with cancelled RegistrationDto.
   */
  @Roles("STUDENT")
  @Delete(":registrationId")
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param("registrationId") registrationId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.cancelRegistration(
      user.studentId!,
      registrationId
    );
  }
}
