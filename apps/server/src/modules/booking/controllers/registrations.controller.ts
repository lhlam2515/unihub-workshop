/**
 * Registrations Controller
 *
 * Xử lý:
 * - POST /registrations (STUDENT — critical path)
 * - DELETE /registrations/{id} (STUDENT — IDOR protected)
 * - GET /students/me/registrations (STUDENT)
 * - GET /students/me/registrations/{id} (STUDENT)
 *
 * IDOR: tất cả student endpoints dùng @CurrentUser() thay vì path param
 */

import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
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
import { CurrentUser } from "@shared/decorators/current-user.decorator";
import { Roles } from "@shared/decorators/roles.decorator";

import { RegistrationsService } from "../services/registrations.service";

@Controller("registrations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * POST /registrations
   * Critical path - register for workshop
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRegistration(@Body() createDto: any, @CurrentUser() user: any) {
    // TODO: Validate with Zod (CreateRegistrationSchema)
    // TODO: Call registrationsService.register(user.id, createDto)
  }

  /**
   * GET /students/me/registrations
   */
  @Get("students/me/registrations")
  async getMyRegistrations(@CurrentUser() user: any, @Query() query: any) {
    // TODO: Call registrationsService.getMyRegistrations(user.id, query)
  }

  /**
   * GET /students/me/registrations/{id}
   */
  @Get("students/me/registrations/:id")
  async getMyRegistration(@Param("id") id: string, @CurrentUser() user: any) {
    // TODO: Verify ownership (IDOR protection)
    // TODO: Call registrationsService.getRegistrationDetail(user.id, id)
  }

  /**
   * DELETE /registrations/{id}
   * Cancel registration
   */
  @Delete(":id")
  async cancelRegistration(@Param("id") id: string, @CurrentUser() user: any) {
    // TODO: Verify ownership
    // TODO: Call registrationsService.cancelRegistration(user.id, id)
  }
}
