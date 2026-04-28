/**
 * Speaker Response DTO
 *
 * Shape: full speaker entity
 */

export interface SpeakerResponseDto {
  speaker_id: string;
  full_name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
}

export class SpeakerResponseBuilder {
  static from(speaker: any): SpeakerResponseDto {
    // TODO: Map to response shape
    return {
      speaker_id: '',
      full_name: '',
    };
  }
}
