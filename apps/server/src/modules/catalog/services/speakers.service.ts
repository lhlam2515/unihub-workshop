/**
 * Speakers Service
 *
 * Handles CRUD operations for speaker profiles.
 * Speakers are referenced by workshops and are managed by BTC roles.
 */

import { Injectable } from "@nestjs/common";

import type { NewSpeaker } from "@/infra/database/types/event-core.types";
import { speakerErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { SpeakerResponseBuilder } from "../dto/speaker-response.dto";
import { SpeakersRepository } from "../repositories/speakers.repository";

import type { CreateSpeakerDto } from "../dto/create-speaker.dto";
import type { SpeakerResponseDto } from "../dto/speaker-response.dto";
import type { UpdateSpeakerDto } from "../dto/update-speaker.dto";

@Injectable()
export class SpeakersService {
  constructor(private readonly speakersRepo: SpeakersRepository) {}

  /**
   * Retrieves all speaker profiles ordered by creation date descending.
   *
   * @returns OkResult containing an array of speaker DTOs with name, title, bio, and avatar, or FailResult (INTERNAL_ERROR).
   */
  /**
   * Retrieves a single speaker by ID.
   *
   * @param id - The UUID of the speaker.
   * @returns OkResult containing the speaker DTO, or FailResult (SPEAKER_NOT_FOUND).
   */
  async getSpeakerById(id: string): Promise<Result<SpeakerResponseDto>> {
    const result = await this.speakersRepo.findById(id);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data) return Result.fail(speakerErrors.notFound(id));
    return Result.ok(SpeakerResponseBuilder.from(result.data));
  }

  /**
   * Deletes a speaker by ID.
   *
   * Side effects:
   * - Deletes the speaker record from the database.
   *
   * @param id - The UUID of the speaker to delete.
   * @returns OkResult<void>, or FailResult (SPEAKER_NOT_FOUND).
   */
  async deleteSpeaker(id: string): Promise<Result<void>> {
    const existing = await this.speakersRepo.findById(id);
    if (existing.isFailure) return Result.fail(existing.error);
    if (!existing.data) return Result.fail(speakerErrors.notFound(id));

    return this.speakersRepo.delete(id);
  }

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

  /**
   * Updates an existing speaker's profile attributes.
   *
   * Business rules:
   * - All fields are optional — only provided fields are updated.
   *
   * Side effects:
   * - Executes UPDATE on the speakers table for the given ID.
   *
   * @param id - The UUID of the speaker to update.
   * @param dto - Partial speaker update payload with snake_case fields from API.
   * @returns OkResult containing the updated speaker DTO, or FailResult (SPEAKER_NOT_FOUND, INTERNAL_ERROR).
   */
  async updateSpeaker(
    id: string,
    dto: UpdateSpeakerDto
  ): Promise<Result<SpeakerResponseDto>> {
    // Verify speaker exists
    const existing = await this.speakersRepo.findById(id);
    if (existing.isFailure) return Result.fail(existing.error);
    if (!existing.data) return Result.fail(speakerErrors.notFound(id));

    // Build update payload from provided fields
    const data: Partial<NewSpeaker> = {};
    if (dto.full_name !== undefined) data.fullName = dto.full_name;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatar_url !== undefined) data.avatarUrl = dto.avatar_url;

    const result = await this.speakersRepo.update(id, data);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(SpeakerResponseBuilder.from(result.data));
  }
}
