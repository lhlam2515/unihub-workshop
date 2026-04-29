/**
 * Speakers Admin Controller
 *
 * Xử lý:
 * - GET /admin/speakers
 * - POST /admin/speakers
 *
 * Yêu cầu role: ORGANIZER
 */

import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

@Controller("admin/speakers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class SpeakersAdminController {
  constructor(private readonly speakersService: any) {}

  /**
   * GET /admin/speakers
   */
  @Get()
  async listSpeakers() {
    // TODO: Call speakersService.listSpeakers()
  }

  /**
   * POST /admin/speakers
   * @body { full_name, title?, bio?, avatar_url? }
   */
  @Post()
  async createSpeaker(@Body() createDto: any) {
    // TODO: Validate with Zod (CreateSpeakerSchema)
    // TODO: Call speakersService.createSpeaker(createDto)
  }
}
