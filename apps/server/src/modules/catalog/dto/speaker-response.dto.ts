/**
 * Speaker Response DTOs
 *
 * Matches OpenAPI SpeakerSummary and Speaker schemas.
 * - SpeakerSummary: nested in WorkshopListItem
 * - Speaker: full detail (extends SpeakerSummary + bio)
 */

import type { Speaker } from "@/infra/database/types/event-core.types";

/** Nested in WorkshopListItem — id + fullName + optional title/avatar */
export interface SpeakerSummaryDto {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
}

/** Full speaker detail — extends SpeakerSummary with bio */
export interface SpeakerResponseDto extends SpeakerSummaryDto {
  bio: string | null;
}

export class SpeakerResponseBuilder {
  static fromSummary(speaker: Speaker): SpeakerSummaryDto {
    return {
      id: speaker.speakerId,
      fullName: speaker.fullName,
      title: speaker.title,
      avatarUrl: speaker.avatarUrl,
    };
  }

  static from(speaker: Speaker): SpeakerResponseDto {
    return {
      id: speaker.speakerId,
      fullName: speaker.fullName,
      title: speaker.title,
      bio: speaker.bio,
      avatarUrl: speaker.avatarUrl,
    };
  }
}
