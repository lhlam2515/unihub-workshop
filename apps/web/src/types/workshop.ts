/**
 * Workshop domain types mirroring the OpenAPI Catalog schemas.
 *
 * All timestamps are RFC 3339 strings (camelCase, e.g. `startsAt`).
 */

// ---------------------------------------------------------------------------
// Speaker
// ---------------------------------------------------------------------------

export interface SpeakerSummary {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
}

export interface Speaker extends SpeakerSummary {
  bio: string | null;
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export interface RoomSummary {
  id: string;
  name: string;
  building: string | null;
  floor: number | null;
  floorPlanUrl: string | null;
}

export interface Room extends RoomSummary {
  capacity: number;
  facilities: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AI Summary
// ---------------------------------------------------------------------------

export type AiSummaryStatus =
  | "none"
  | "queued"
  | "processing"
  | "done"
  | "failed";

export interface AiSummary {
  status: AiSummaryStatus;
  text?: string | null;
  updatedAt?: string | null;
  errorDetail?: string | null;
}

// ---------------------------------------------------------------------------
// Workshop
// ---------------------------------------------------------------------------

export type WorkshopStatus = "draft" | "open" | "closed" | "cancelled";

export interface WorkshopListItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  price: number;
  currency: string;
  status: WorkshopStatus;
  speaker: SpeakerSummary | null;
  room: RoomSummary | null;
  /** True if the authenticated student has an active registration. `null` if anonymous. */
  isRegistered: boolean | null;
}

export interface WorkshopDetail extends WorkshopListItem {
  description: string | null;
  speaker: Speaker | null;
  room: Room | null;
  summary: AiSummary;
  /** Present when the authenticated student has an active registration. */
  myRegistrationId: string | null;
}

export interface WorkshopAvailability {
  workshopId: string;
  seatsAvailable: number;
  asOf: string;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface WorkshopFilters {
  day?: string;
  hasSeats?: boolean;
  sort?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}
