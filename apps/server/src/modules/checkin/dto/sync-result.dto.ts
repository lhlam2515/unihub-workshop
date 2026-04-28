/**
 * Sync Result Response DTO
 *
 * Response: POST /checkin/sync
 * Shape: { synced_count, skipped_count, conflicts_count, timestamp }
 */

export interface SyncResultDto {
  synced_count: number;
  skipped_count: number;
  conflicts_count: number;
  timestamp: Date;
}

export class SyncResultBuilder {
  static from(
    syncedCount: number,
    skippedCount: number,
    conflictCount: number
  ): SyncResultDto {
    // TODO: Map to response shape
    return {
      synced_count: syncedCount,
      skipped_count: skippedCount,
      conflicts_count: conflictCount,
      timestamp: new Date(),
    };
  }
}
