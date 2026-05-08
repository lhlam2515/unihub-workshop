/**
 * Workshop feature-local types.
 *
 * Service-level types (WorkshopDetailDto, CheckinStatus) are defined
 * in their respective api/*.service.ts files. This file centralizes
 * hook-level and component-level types.
 */

import type { WorkshopDetailDto } from "@/features/workshops/api/workshops.service";

export type { WorkshopDetailDto };
export type { CheckinStatus } from "@/features/workshops/api/checkin-status.service";

/** Loading state for workshop data fetching */
export type WorkshopsLoadStatus = "idle" | "loading" | "success" | "error";

export interface UseWorkshopListResult {
  workshops: WorkshopDetailDto[];
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
}
