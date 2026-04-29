/**
 * Offline Sync Service
 *
 * processSyncBatch(items[], staffUserId):
 * - Với mỗi item, giải mã qr_token để lấy ticket_id
 * - Thực thi INSERT INTO checkin_records ON CONFLICT DO NOTHING
 * - Phân loại thành synced, skipped, conflicts
 *
 * Trả SyncResultDto.
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly checkinRepo: any // TODO: Inject CheckinRecordsRepository
  ) {}

  /**
   * processSyncBatch(items: Array<{ qr_token, timestamp }>, staffUserId: string, workshopId: string)
   *
   * TODO: Process batch of offline QR scans
   * 1. For each item, decode qr_token
   * 2. Verify ticket still valid
   * 3. Insert checkin_record with ON CONFLICT DO NOTHING
   * 4. Categorize results: synced, skipped, conflicts
   * 5. Return SyncResultDto with counts
   */
  async processSyncBatch(
    items: any[],
    staffUserId: string,
    workshopId: string
  ) {
    // TODO: Implement
  }
}
