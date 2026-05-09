/**
 * Workshop Response DTOs
 *
 * Matches OpenAPI WorkshopListItem, WorkshopDetail, WorkshopAdmin schemas.
 * - WorkshopSummaryDto: nested in list responses → WorkshopListItem
 * - WorkshopDetailDto: public detail view → WorkshopDetail
 * - WorkshopAdminDetailDto: admin CRUD view → WorkshopAdmin
 */

import type { WorkshopStatus } from "@/infra/database/types/enums.types";
import type { Workshop } from "@/infra/database/types/event-core.types";

import type { RoomResponseDto, RoomSummaryDto } from "./room-response.dto";
import type {
  SpeakerResponseDto,
  SpeakerSummaryDto,
} from "./speaker-response.dto";

/** Nested AI summary in WorkshopDetail */
export interface AiSummaryDto {
  status: "NONE" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  text: string | null;
  updatedAt: string | null;
  errorDetail: string | null;
}

/** @see WorkshopListItem in OpenAPI spec */
export interface WorkshopSummaryDto {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  price: number;
  currency: string;
  status: WorkshopStatus;
  speaker: SpeakerSummaryDto | null;
  room: RoomSummaryDto | null;
  isRegistered: boolean | null;
}

/** @see WorkshopDetail in OpenAPI spec */
export interface WorkshopDetailDto extends WorkshopSummaryDto {
  description: string | null;
  speaker: SpeakerResponseDto | null;
  room: RoomResponseDto | null;
  summary: AiSummaryDto | null;
  myRegistrationId: string | null;
}

/** @see WorkshopAdmin in OpenAPI spec */
export interface WorkshopAdminDetailDto extends WorkshopDetailDto {
  version: number;
  pdfUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export class WorkshopResponseBuilder {
  static fromSummary(
    workshop: Workshop,
    speaker: SpeakerSummaryDto | null,
    room: RoomSummaryDto | null,
    availableSeats: number,
    isRegistered: boolean | null = null
  ): WorkshopSummaryDto {
    return {
      id: workshop.workshopId,
      title: workshop.title,
      startsAt: workshop.startsAt.toISOString(),
      endsAt: workshop.endsAt.toISOString(),
      seatsTotal: workshop.seatsTotal,
      seatsAvailable: availableSeats,
      price: workshop.price ? Number(workshop.price) : 0,
      currency: "VND",
      status: workshop.status,
      speaker,
      room,
      isRegistered,
    };
  }

  static fromDetail(
    workshop: Workshop,
    speaker: SpeakerResponseDto | null,
    room: RoomResponseDto | null,
    availableSeats: number,
    summary: AiSummaryDto | null = null,
    myRegistrationId: string | null = null,
    isRegistered: boolean | null = null
  ): WorkshopDetailDto {
    const base = this.fromSummary(
      workshop,
      speaker,
      room,
      availableSeats,
      isRegistered
    );
    return {
      ...base,
      description: workshop.description ?? null,
      speaker,
      room,
      summary,
      myRegistrationId,
    };
  }

  static fromAdminDetail(
    workshop: Workshop,
    speaker: SpeakerResponseDto | null,
    room: RoomResponseDto | null,
    availableSeats: number,
    summary: AiSummaryDto | null = null,
    myRegistrationId: string | null = null,
    isRegistered: boolean | null = null
  ): WorkshopAdminDetailDto {
    const detail = this.fromDetail(
      workshop,
      speaker,
      room,
      availableSeats,
      summary,
      myRegistrationId,
      isRegistered
    );
    return {
      ...detail,
      version: workshop.version ?? 0,
      pdfUrl: null,
      createdBy: workshop.createdBy ?? null,
      createdAt: workshop.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: workshop.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
