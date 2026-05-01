export interface SyncResultDto {
  synced_count: number;
  skipped_count: number;
  conflicts_count: number;
  timestamp: Date;
}

export class SyncResultBuilder {
  /**
   * Builds a SyncResultDto from batch processing outcome counts.
   *
   * Transformation rules:
   * - synced_count: items successfully inserted into checkin_records.
   * - skipped_count: duplicates silently ignored by ON CONFLICT DO NOTHING.
   * - conflicts_count: items with VOID tickets or wrong workshop — not inserted.
   * - timestamp: server time at the moment the sync response is built.
   *
   * @param syncedCount - Number of new check-in records created.
   * @param skippedCount - Number of duplicate records skipped.
   * @param conflictCount - Number of invalid records (VOID ticket or wrong workshop).
   * @returns SyncResultDto summarising the batch sync outcome.
   */
  static from(
    syncedCount: number,
    skippedCount: number,
    conflictCount: number
  ): SyncResultDto {
    return {
      synced_count: syncedCount,
      skipped_count: skippedCount,
      conflicts_count: conflictCount,
      timestamp: new Date(),
    };
  }
}
