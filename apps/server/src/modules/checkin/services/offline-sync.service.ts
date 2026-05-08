import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type {
  CheckinSyncResponseDto,
  CheckinSyncResultItem,
} from "../dto/checkin-sync-response.dto";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { RegistrationsRepository } from "../repositories/registrations.repository";

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly checkinRecordsRepo: CheckinRecordsRepository,
    private readonly registrationsRepo: RegistrationsRepository
  ) {}

  /**
   * Idempotently persists a batch of offline check-in records from mobile.
   *
   * Business rules:
   * - Each item is validated: registration must exist, status IN (PAID, CONFIRMED),
   *   and workshop must not be CANCELLED.
   * - Invalid items are marked as REJECTED with a specific reason.
   * - Duplicate records (already synced) are marked as DUPLICATE with original timestamp.
   * - Batch processing continues even if individual items are invalid.
   *
   * Side effects:
   * - Inserts records into `checkin_records` with source=OFFLINE_SYNC for valid items.
   *
   * @param items - Array of sync items with local_id, qr_code, workshop_id, checked_in_at.
   * @param staffUserId - UUID of the CHECKIN_STAFF who performed the scans.
   * @returns OkResult with per-item array of sync results.
   */
  async processSyncBatch(
    items: Array<{
      localId: string;
      qrCode: string;
      workshopId: string;
      checkedInAt: Date;
    }>,
    staffUserId: string
  ): Promise<Result<CheckinSyncResponseDto>> {
    const results: CheckinSyncResultItem[] = [];

    for (const item of items) {
      const result = await this.processItem(item, staffUserId);
      results.push(result);
    }

    return Result.ok({ results });
  }

  private async processItem(
    item: {
      localId: string;
      qrCode: string;
      workshopId: string;
      checkedInAt: Date;
    },
    staffUserId: string
  ): Promise<CheckinSyncResultItem> {
    const regResult = await this.registrationsRepo.findByQRCode(item.qrCode);
    if (regResult.isFailure) {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "QR_INVALID",
      };
    }

    const registration = regResult.data;
    if (!registration) {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "QR_INVALID",
      };
    }

    if (registration.workshop.status === "CANCELLED") {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "WORKSHOP_CANCELLED",
      };
    }

    if (registration.status !== "PAID" && registration.status !== "CONFIRMED") {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "NOT_PAID",
      };
    }

    if (registration.workshopId !== item.workshopId) {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "QR_INVALID",
      };
    }

    const createResult = await this.checkinRecordsRepo.create({
      registrationId: registration.registrationId,
      studentId: registration.studentId,
      workshopId: item.workshopId,
      checkedInAt: item.checkedInAt,
      checkedInBy: staffUserId,
      source: "OFFLINE_SYNC",
      deviceId: undefined,
      syncedAt: new Date(),
    });

    if (createResult.isFailure) {
      return {
        localId: item.localId,
        result: "REJECTED",
        reason: "QR_INVALID",
      };
    }

    if (createResult.data === null) {
      // Duplicate — find the original
      const existingResult =
        await this.checkinRecordsRepo.findFirstByRegistrationId(
          registration.registrationId
        );

      if (existingResult.isFailure || !existingResult.data) {
        return {
          localId: item.localId,
          result: "DUPLICATE",
        };
      }

      return {
        localId: item.localId,
        result: "DUPLICATE",
        serverId: existingResult.data.checkinId,
        firstCheckinAt: existingResult.data.checkedInAt,
        firstStaffName: existingResult.data.staffName,
      };
    }

    return {
      localId: item.localId,
      result: "OK",
      serverId: createResult.data.checkinId,
    };
  }
}
