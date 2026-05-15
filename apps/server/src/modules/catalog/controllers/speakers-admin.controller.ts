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
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";

import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CreateSpeakerDto } from "../dto/create-speaker.dto";
import { ListSpeakersQueryDto } from "../dto/list-speakers-query.dto";
import { UpdateSpeakerDto } from "../dto/update-speaker.dto";
import { SpeakersService } from "../services/speakers.service";

@Controller("admin/speakers")
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
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
  async listSpeakers(@Query() query: ListSpeakersQueryDto) {
    return this.speakersService.listSpeakers(query);
  }

  /**
   * Retrieves a single speaker by ID (admin view).
   *
   * GET /admin/speakers/{speakerId}
   *
   * Security context: Requires BTC role.
   *
   * @param speakerId - UUID of the speaker to retrieve.
   * @returns SpeakerResponseDto, or FailResult (SPEAKER_NOT_FOUND).
   */
  @Get(":speakerId")
  async getSpeaker(@Param("speakerId") speakerId: string) {
    return this.speakersService.getSpeakerById(speakerId);
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
  @HttpCode(HttpStatus.CREATED)
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
   * @param speakerId - The UUID of the speaker to update.
   * @param body - Partial speaker update payload.
   * @returns The updated speaker DTO.
   */
  @Patch(":speakerId")
  async updateSpeaker(
    @Param("speakerId") speakerId: string,
    @Body() dto: UpdateSpeakerDto
  ) {
    return this.speakersService.updateSpeaker(speakerId, dto);
  }

  /**
   * Deletes a speaker profile.
   *
   * DELETE /admin/speakers/{speakerId}
   *
   * @param speakerId - The UUID of the speaker to delete.
   * @returns 204 No Content on success, or 404 if not found.
   */
  @Delete(":speakerId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSpeaker(@Param("speakerId") speakerId: string) {
    return this.speakersService.deleteSpeaker(speakerId);
  }
}
