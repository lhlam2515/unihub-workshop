/**
 * Workshop Response DTOs
 *
 * Three shapes for three contexts:
 * - WorkshopSummaryDto: public list
 * - WorkshopDetailDto: public detail
 * - WorkshopAdminDetailDto: admin detail (with confirmed_count, locked_count, created_by)
 *
 * Each class has static from() factory
 */

import type { Workshop, WorkshopSlot } from "@/database/types/event-core.types";

export interface WorkshopSummaryDto {
  workshop_id: string;
  title: string;
  speaker_name: string;
  starts_at: Date;
  available_seats: number;
  is_paid: boolean;
  price?: number;
}

export interface WorkshopDetailDto extends WorkshopSummaryDto {
  description?: string;
  room_name: string;
  ends_at: Date;
  ai_summary?: {
    status: string;
    error_message?: string;
    document_id?: string;
  } | null;
}

export interface WorkshopAdminDetailDto extends WorkshopDetailDto {
  confirmed_count: number;
  locked_count: number;
  created_by: string;
  status: string;
}

export class WorkshopResponseBuilder {
  /**
   * Builds a summary DTO for public listing.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - workshopId -> workshop_id
   * - startsAt -> starts_at
   * - isPaid -> is_paid
   * - price: converted from string (decimal) to number; excluded when null (free workshop)
   *
   * Speaker name and available seats are resolved by the service layer and passed in,
   * not read from the DB entity.
   *
   * @param workshop - Raw workshop entity from the database.
   * @param speakerName - Resolved speaker display name (falls back to "Unknown").
   * @param availableSeats - Real-time available seat count from Redis.
   * @returns WorkshopSummaryDto with public-safe fields.
   */
  static fromSummary(
    workshop: Workshop,
    speakerName: string,
    availableSeats: number
  ): WorkshopSummaryDto {
    return {
      workshop_id: workshop.workshopId,
      title: workshop.title,
      speaker_name: speakerName,
      starts_at: workshop.startsAt,
      available_seats: availableSeats,
      is_paid: workshop.isPaid,
      price: workshop.price ? Number(workshop.price) : undefined,
    };
  }

  /**
   * Builds a detail DTO for public single-workshop view.
   *
   * Extends fromSummary with:
   * - room_name (resolved from Room entity)
   * - ends_at (from workshop.endsAt)
   * - description (null -> undefined for clean JSON)
   *
   * @param workshop - Raw workshop entity from the database.
   * @param speakerName - Resolved speaker display name.
   * @param roomName - Resolved room display name.
   * @param availableSeats - Real-time available seat count from Redis.
   * @param aiSummary - Optional AI summary entity (reserved for future public display).
   * @returns WorkshopDetailDto with extended public fields.
   */
  static fromDetail(
    workshop: Workshop,
    speakerName: string,
    roomName: string,
    availableSeats: number,
    aiSummary?: {
      status: string;
      error_message?: string;
      document_id?: string;
    } | null
  ): WorkshopDetailDto {
    const summary = this.fromSummary(workshop, speakerName, availableSeats);
    return {
      ...summary,
      description: workshop.description ?? undefined,
      room_name: roomName,
      ends_at: workshop.endsAt,
      ai_summary: aiSummary ?? undefined,
    };
  }

  /**
   * Builds an admin detail DTO for internal management.
   *
   * Extends fromDetail with:
   * - confirmed_count / locked_count (from WorkshopSlot entity, defaults to 0 if slot is null)
   * - created_by (from workshop.createdBy, UUID of the ORGANIZER who created it)
   * - status (workflow status: DRAFT | PUBLISHED | CANCELLED)
   *
   * Nullish handling: null slot produces 0 for both counters rather than undefined.
   *
   * @param workshop - Raw workshop entity from the database.
   * @param slot - Workshop slot entity containing confirmedCount/lockedCount (nullable).
   * @param speakerName - Resolved speaker display name.
   * @param roomName - Resolved room display name.
   * @param availableSeats - Real-time available seat count from Redis.
   * @returns WorkshopAdminDetailDto with admin-specific internal fields.
   */
  static fromAdminDetail(
    workshop: Workshop,
    slot: WorkshopSlot | null,
    speakerName: string,
    roomName: string,
    availableSeats: number
  ): WorkshopAdminDetailDto {
    const detail = this.fromDetail(
      workshop,
      speakerName,
      roomName,
      availableSeats
    );
    return {
      ...detail,
      confirmed_count: slot?.confirmedCount ?? 0,
      locked_count: slot?.lockedCount ?? 0,
      created_by: workshop.createdBy,
      status: workshop.status,
    };
  }
}
