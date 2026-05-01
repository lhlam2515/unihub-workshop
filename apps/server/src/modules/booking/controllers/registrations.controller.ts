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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreateRegistrationDto } from "../dto/create-registration.dto";
import { RegistrationsService } from "../services/registrations.service";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * Creates a new workshop registration.
   *
   * @param dto - Zod-validated body containing the target workshop_id (UUID).
   * @param user - JWT payload injected by @CurrentUser() — provides student identity.
   * @returns HTTP 201 with RegistrationDto on success, or error response with codes:
   * - RATE_LIMIT_EXCEEDED (429)
   * - SEAT_UNAVAILABLE (409)
   * - REGISTRATION_DUPLICATE (409)
   * - WORKSHOP_NOT_FOUND (404)
   * - WORKSHOP_NOT_PUBLISHED (422)
   *
   * Security: Requires valid JWT with STUDENT role.
   */
  @Post("registrations")
  @HttpCode(HttpStatus.CREATED)
  async createRegistration(
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.register(user.sub, dto);
  }

  /**
   * Lists the authenticated student's registration history.
   *
   * @param user - JWT payload injected by @CurrentUser() — provides student identity.
   * @param status - Optional status filter (CONFIRMED, PENDING_PAYMENT, CANCELLED).
   * @param page - Page number for pagination (default 1).
   * @param limit - Items per page (default 20).
   * @returns HTTP 200 with paginated list of RegistrationDto items.
   *
   * Security: Requires valid JWT with STUDENT role. IDOR-enforced — only own records returned.
   */
  @Get("students/me/registrations")
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
   * @param id - Registration UUID from the URL path.
   * @param user - JWT payload injected by @CurrentUser() — provides student identity.
   * @returns HTTP 200 with RegistrationDto, or 404 if not found or not owned.
   *
   * Security: Requires valid JWT with STUDENT role. Returns 404 for both missing
   * and non-owned registrations to prevent information leakage.
   */
  @Get("students/me/registrations/:id")
  async getMyRegistration(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.getRegistrationDetail(user.sub, id);
  }

  /**
   * Cancels the authenticated student's own registration.
   *
   * Releases the reserved seat, voids any associated ticket, and releases the
   * seat lock if the workshop was paid.
   *
   * @param id - Registration UUID from the URL path.
   * @param user - JWT payload injected by @CurrentUser() — provides student identity.
   * @returns HTTP 200 with cancelled RegistrationDto, or error response with codes:
   * - REGISTRATION_NOT_FOUND (404)
   * - REGISTRATION_CANCELLED (409)
   *
   * Security: Requires valid JWT with STUDENT role. IDOR-enforced.
   */
  @Delete("registrations/:id")
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.registrationsService.cancelRegistration(user.sub, id);
  }
}
