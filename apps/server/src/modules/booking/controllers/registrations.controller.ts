import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { IdempotencyKey } from "@/shared/decorators/idempotency-key.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreateRegistrationDto } from "../dto/create-registration.dto";
import { RegistrationsService } from "../services/registrations.service";

@Controller("registrations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * Creates a new workshop registration.
   *
   * POST /registrations
   *
   * @param dto - Zod-validated body containing the target workshop_id (UUID).
   * @param idempotencyKey - X-Idempotency-Key header value for safe retry.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 201 with RegistrationDto on success, or error response.
   */
  @RateLimit([
    { tier: "T2", limit: 30, windowMs: 60000 },
    { tier: "T3", limit: 5, windowMs: 60000 },
  ])
  @Roles("STUDENT")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRegistration(
    @Body() dto: CreateRegistrationDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.register(user.sub, dto, idempotencyKey);
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
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.registrationsService.getMyRegistrations(user.sub, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Retrieves a single registration by ID with IDOR enforcement.
   *
   * GET /registrations/{id}
   *
   * @param id - Registration UUID.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 200 with RegistrationDto, or 404.
   */
  @Roles("STUDENT")
  @Get(":id")
  async getMyRegistration(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.getRegistrationDetail(user.sub, id);
  }

  /**
   * Cancels the authenticated student's own registration.
   *
   * DELETE /registrations/{id}
   *
   * Releases the reserved seat and seat lock.
   *
   * @param id - Registration UUID.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 200 with cancelled RegistrationDto.
   */
  @Roles("STUDENT")
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.cancelRegistration(user.sub, id);
  }
}
