/**
 * Speaker Response DTO
 *
 * Shape: full speaker entity
 */

import type { Speaker } from "@/database/types/event-core.types";

export interface SpeakerResponseDto {
  speaker_id: string;
  full_name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
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
      speaker_id: speaker.speakerId,
      full_name: speaker.fullName,
      title: speaker.title ?? undefined,
      bio: speaker.bio ?? undefined,
      avatar_url: speaker.avatarUrl ?? undefined,
    };
  }
}
