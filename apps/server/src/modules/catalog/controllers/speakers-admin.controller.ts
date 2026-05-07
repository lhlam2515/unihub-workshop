/**
 * Speakers Admin Controller
 *
 * Handles BTC-only speaker management endpoints.
 * All endpoints require JWT authentication and BTC role.
 *
 * Endpoints:
 * - GET /admin/speakers — list all speakers
 * - POST /admin/speakers — create a new speaker
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CreateSpeakerDto } from "../dto/create-speaker.dto";
import { UpdateSpeakerDto } from "../dto/update-speaker.dto";
import { SpeakersService } from "../services/speakers.service";

@Controller("admin/speakers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
export class SpeakersAdminController {
  constructor(private readonly speakersService: SpeakersService) {}

  /**
   * Lists all speakers in the system.
   *
   * Returns all registered speakers with their profile information
   * including name, title, bio, and avatar.
   *
   * Security context: Requires BTC role.
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
   * Security context: Requires BTC role.
   *
   * @param body - Speaker creation payload (full_name, title?, bio?, avatar_url?).
   * @returns The newly created speaker DTO.
   */
  @Post()
  async createSpeaker(@Body() dto: CreateSpeakerDto) {
    return this.speakersService.createSpeaker(dto);
  }

  /**
   * Updates an existing speaker's profile attributes.
   *
   * Only provided fields are updated; omitted fields retain their existing values.
   *
   * Security context: Requires BTC role.
   *
   * @param id - The UUID of the speaker to update.
   * @param body - Partial speaker update payload.
   * @returns The updated speaker DTO.
   */
  @Put(":id")
  async updateSpeaker(@Param("id") id: string, @Body() dto: UpdateSpeakerDto) {
    return this.speakersService.updateSpeaker(id, dto);
  }
}
