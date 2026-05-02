import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import { SyncResultBuilder, type SyncResultDto } from "../dto/sync-result.dto";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly checkinRecordsRepo: CheckinRecordsRepository,
    private readonly ticketsRepo: TicketsRepository
  ) {}

  /**
   * Idempotently persists a batch of offline check-in records from mobile.
   *
   * Business rules:
   * - Each item is validated: ticket must exist and be ACTIVE for the given workshop.
   * - VOID tickets or wrong-workshop tickets are counted as conflicts, not errors.
   * - Duplicate records (already synced) are silently skipped via ON CONFLICT DO NOTHING.
   * - Batch processing continues even if individual items are invalid.
   *
   * Side effects:
   * - Inserts records into `checkin_records` with source=OFFLINE_SYNC for valid items.
   *
   * @param items - Array of offline scan records with qr_token and timestamp.
   * @param staffUserId - UUID of the CHECKIN_STAFF who performed the scans (from jwt.sub).
   * @param workshopId - UUID of the workshop scope for this sync batch.
   * @returns OkResult with SyncResultDto (synced/skipped/conflicts counts), or FailResult (INTERNAL_ERROR).
   */
  async processSyncBatch(
    items: Array<{ qr_token: string; checked_in_at: Date; device_id?: string }>,
    staffUserId: string,
    workshopId: string
  ): Promise<Result<SyncResultDto>> {
    let synced = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const item of items) {
      const ticketResult = await this.ticketsRepo.findByQRToken(item.qr_token);

      if (ticketResult.isFailure) return Result.fail(ticketResult.error);

      const ticket = ticketResult.data;

      if (
        !ticket ||
        ticket.status === "VOID" ||
        ticket.registration.workshopId !== workshopId
      ) {
        conflicts++;
        continue;
      }

      const createResult = await this.checkinRecordsRepo.create({
        registrationId: ticket.registrationId,
        ticketId: ticket.ticketId,
        studentId: ticket.registration.studentId,
        workshopId,
        checkedInAt: item.checked_in_at,
        checkedInBy: staffUserId,
        source: "OFFLINE_SYNC",
        deviceId: item.device_id,
        syncedAt: new Date(),
      });

      if (createResult.isFailure) return Result.fail(createResult.error);

      if (createResult.data === null) {
        skipped++;
      } else {
        synced++;
      }
    }

    return Result.ok(SyncResultBuilder.from(synced, skipped, conflicts));
  }
}
