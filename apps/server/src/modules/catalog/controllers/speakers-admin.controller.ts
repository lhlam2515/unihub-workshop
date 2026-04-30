/**
 * Speakers Admin Controller
 *
 * Handles ORGANIZER-only speaker management endpoints.
 * All endpoints require JWT authentication and ORGANIZER role.
 *
 * Endpoints:
 * - GET /admin/speakers — list all speakers
 * - POST /admin/speakers — create a new speaker
 */

import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CreateSpeakerDto } from "../dto/create-speaker.dto";
import { SpeakersService } from "../services/speakers.service";

@Controller("admin/speakers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class SpeakersAdminController {
  constructor(private readonly speakersService: SpeakersService) {}

  /**
   * Lists all speakers in the system.
   *
   * Returns all registered speakers with their profile information
   * including name, title, bio, and avatar.
   *
   * Security context: Requires ORGANIZER role.
   *
   * @returns Array of speaker DTOs.
   */
  @Get()
  async listSpeakers() {
    return this.speakersService.listSpeakers();
  }

  /**
   * Creates a new speaker profile.
   *
   * Validates input with CreateSpeakerSchema before persisting.
   *
   * Security context: Requires ORGANIZER role.
   *
   * @param body - Speaker creation payload (full_name, title?, bio?, avatar_url?).
   * @returns The newly created speaker DTO.
   */
  @Post()
  async createSpeaker(@Body() dto: CreateSpeakerDto) {
    return this.speakersService.createSpeaker(dto);
  }
}
