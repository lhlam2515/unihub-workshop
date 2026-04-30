/**
 * Speakers Service
 *
 * Handles CRUD operations for speaker profiles.
 * Speakers are referenced by workshops and are managed by ORGANIZER roles.
 */

import { Injectable } from "@nestjs/common";

import type { NewSpeaker } from "@/database/types/event-core.types";
import { Result } from "@/shared/response/result";

import { SpeakerResponseBuilder } from "../dto/speaker-response.dto";
import { SpeakersRepository } from "../repositories/speakers.repository";

import type { CreateSpeakerDto } from "../dto/create-speaker.dto";
import type { SpeakerResponseDto } from "../dto/speaker-response.dto";

@Injectable()
export class SpeakersService {
  constructor(private readonly speakersRepo: SpeakersRepository) {}

  /**
   * Retrieves all speaker profiles ordered by creation date descending.
   *
   * @returns OkResult containing an array of speaker DTOs with name, title, bio, and avatar, or FailResult (INTERNAL_ERROR).
   */
  async listSpeakers(): Promise<Result<SpeakerResponseDto[]>> {
    const result = await this.speakersRepo.findAll();
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(result.data.map((s) => SpeakerResponseBuilder.from(s)));
  }

  /**
   * Creates a new speaker profile.
   *
   * Business rules:
   * - full_name is required; all other fields are optional.
   *
   * Side effects:
   * - Inserts a new record into the speakers table.
   *
   * @param dto - Speaker creation payload with snake_case fields from API.
   * @returns OkResult containing the created speaker DTO, or FailResult with INTERNAL_ERROR.
   */
  async createSpeaker(
    dto: CreateSpeakerDto
  ): Promise<Result<SpeakerResponseDto>> {
    const data: NewSpeaker = {
      fullName: dto.full_name,
      title: dto.title ?? null,
      bio: dto.bio ?? null,
      avatarUrl: dto.avatar_url ?? null,
    };
    const result = await this.speakersRepo.create(data);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(SpeakerResponseBuilder.from(result.data));
  }
}
