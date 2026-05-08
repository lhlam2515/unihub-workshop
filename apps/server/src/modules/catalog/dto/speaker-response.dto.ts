/**
 * Speaker Response DTO
 *
 * Shape: full speaker entity
 */

import type { Speaker } from "@/infra/database/types/event-core.types";

export interface SpeakerResponseDto {
  speakerId: string;
  fullName: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
}

export class SpeakerResponseBuilder {
  /**
   * Builds a speaker response DTO from a database entity.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - speakerId -> speaker_id
   * - fullName -> full_name
   * - title/bio/avatarUrl: stored as nullable DB columns; null -> undefined for clean JSON
   *
   * @param speaker - Raw speaker entity from the database.
   * @returns SpeakerResponseDto with API-safe fields.
   */
  static from(speaker: Speaker): SpeakerResponseDto {
    return {
      speakerId: speaker.speakerId,
      fullName: speaker.fullName,
      title: speaker.title ?? undefined,
      bio: speaker.bio ?? undefined,
      avatarUrl: speaker.avatarUrl ?? undefined,
    };
  }
}
