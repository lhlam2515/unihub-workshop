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
  capacity?: number;
  facilities?: Record<string, unknown>;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Admin Master Data (Phase 7)
// ---------------------------------------------------------------------------

export interface SpeakerAdmin extends Speaker {
  upcomingWorkshopCount?: number;
}

export interface SpeakerCreateRequest {
  fullName: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
}

export type SpeakerUpdateRequest = Partial<SpeakerCreateRequest>;

export interface RoomAdmin extends Room {
  upcomingWorkshopCount?: number;
}

export interface RoomCreateRequest {
  name: string;
  building?: string;
  floor?: number;
  capacity: number;
  floorPlanUrl?: string;
}

export type RoomUpdateRequest = Partial<RoomCreateRequest>;

// ---------------------------------------------------------------------------
// AI Summary
// ---------------------------------------------------------------------------

export type AiSummaryStatus =
  | "NONE"
  | "QUEUED"
  | "PROCESSING"
  | "DONE"
  | "FAILED";

export interface AiSummary {
  status: AiSummaryStatus;
  text?: string | null;
  updatedAt?: string | null;
  errorDetail?: string | null;
}

// ---------------------------------------------------------------------------
// Workshop
// ---------------------------------------------------------------------------

export type WorkshopStatus = "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED";

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
  summary: AiSummary | null;
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
  q?: string;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Admin types
// ---------------------------------------------------------------------------

export interface WorkshopAdmin {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  price: number;
  currency: string;
  status: WorkshopStatus;
  isRegistered: boolean | null;
  speaker: SpeakerSummary | null;
  room: RoomSummary | null;
  description: string | null;
  summary: AiSummary | null;
  myRegistrationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  pdfUrl: string | null;
}

export interface WorkshopCreateRequest {
  title: string;
  description?: string;
  speakerId?: string | null;
  roomId?: string | null;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  price: number;
  status?: "DRAFT" | "OPEN";
}

export interface WorkshopPatchRequest {
  title?: string;
  description?: string;
  speakerId?: string;
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  seatsTotal?: number;
  price?: number;
}

export interface WorkshopCancelRequest {
  reason: string;
  notifyRegistered: boolean;
}

export interface WorkshopStats {
  registrations: { total: number; byStatus: Record<string, number> };
  checkins: { total: number; rate: number };
  revenue: { amount: number; currency: string };
}

export interface AdminWorkshopFilters extends Omit<
  WorkshopFilters,
  "status" | "hasSeats" | "sort"
> {
  status?: WorkshopStatus;
  q?: string;
}
