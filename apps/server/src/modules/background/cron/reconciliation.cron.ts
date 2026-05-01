/**
 * ReconciliationCron
 *
 * Scheduled job that reconciles workshop_slot counters from actual data.
 * Updates confirmed_count from PostgreSQL registrations and locked_count
 * from active Redis seat locks.
 *
 * Runs every 10 minutes.
 *
 * Business rules:
 * - confirmed_count = COUNT of registrations WHERE status = 'CONFIRMED' per workshop.
 * - locked_count = COUNT of active Redis keys seat:lock:{workshopId}:*.
 * - Only PUBLISHED workshops are checked.
 * - Redis is the source of truth for real-time seat availability (BR-040);
 *   this job updates PostgreSQL for reporting accuracy only.
 * - Large discrepancies (>DISCREPANCY_THRESHOLD) are logged as warnings
 *   in addition to the update.
 *
 * Side effects:
 * - SELECT from registrations, workshops, workshop_slots tables.
 * - SCAN Redis for seat:lock:{workshopId}:* keys.
 * - UPDATE workshop_slots.confirmed_count and locked_count.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { RegistrationsService } from "@/modules/booking/services/registrations.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { RedisService } from "@/shared/redis/redis.service";

const DISCREPANCY_THRESHOLD = 5;

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(
    private readonly workshopsService: WorkshopsService,
    private readonly registrationsService: RegistrationsService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Reconciles workshop_slot counters for all PUBLISHED workshops.
   *
   * Runs every 10 minutes. For each PUBLISHED workshop, queries the actual
   * CONFIRMED registrations count from PostgreSQL and active lock keys from
   * Redis, then updates workshop_slots accordingly.
   *
   * Side effects:
   * - Updates confirmed_count and locked_count in workshop_slots.
   * - Logs warnings for large discrepancies.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReconciliation(): Promise<void> {
    try {
      const workshopsResult =
        await this.workshopsService.getPublishedWorkshopsBasic();
      if (workshopsResult.isFailure) {
        this.logger.error(
          `Failed to fetch published workshops: ${workshopsResult.error.code}`
        );
        return;
      }

      const workshops = workshopsResult.data;
      let discrepancyCount = 0;

      for (const workshop of workshops) {
        try {
          const wid = workshop.workshopId;
          const diff = await this.reconcileWorkshop(
            wid,
            Number(workshop.capacity)
          );
          if (diff > DISCREPANCY_THRESHOLD) {
            discrepancyCount++;
            this.logger.warn(
              `Reconciliation discrepancy for workshop ${wid}: diff=${diff}` +
                ` (exceeds threshold of ${DISCREPANCY_THRESHOLD})`
            );
          }
        } catch (error) {
          this.logger.error(
            `Reconciliation failed for workshop ${workshop.workshopId}`,
            error
          );
        }
      }

      this.logger.log(
        `Reconciliation completed: ${workshops.length} processed, ` +
          `${discrepancyCount} discrepancies > threshold`
      );
    } catch (error) {
      this.logger.error("Reconciliation cron failed", error);
    }
  }

  /**
   * Reconciles a single workshop's slot counters.
   *
   * 1. Counts CONFIRMED registrations from PostgreSQL.
   * 2. Counts active lock keys from Redis (seat:lock:{workshopId}:*).
   * 3. Updates workshop_slots.confirmed_count and locked_count.
   *
   * @param workshopId - The UUID of the workshop.
   * @param capacity - The total seat capacity of the workshop.
   * @returns The absolute difference between old and new seat:available values.
   */
  private async reconcileWorkshop(
    workshopId: string,
    capacity: number
  ): Promise<number> {
    const countResult =
      await this.registrationsService.countConfirmedByWorkshop(workshopId);
    if (countResult.isFailure) {
      this.logger.error(
        `Failed to count confirmed registrations for workshop ${workshopId}: ${countResult.error.code}`
      );
      return 0;
    }

    const lockPattern = `seat:lock:${workshopId}:*`;
    const lockKeys = await this.redisService.scanKeys(lockPattern);
    const confirmedCount = countResult.data;
    const lockedCount = lockKeys.length;

    // Read old seat:available value for discrepancy logging
    const oldRedisValue = await this.redisService.get(
      `seat:available:${workshopId}`
    );
    const oldExpected = capacity - confirmedCount - lockedCount;
    const diff = oldRedisValue
      ? Math.abs(parseInt(oldRedisValue, 10) - oldExpected)
      : 0;

    // UPSERT workshop_slots with reconciled counts via service
    const slotResult = await this.workshopsService.reconcileSlot(
      workshopId,
      capacity,
      lockedCount,
      confirmedCount
    );
    if (slotResult.isFailure) {
      this.logger.error(
        `Failed to reconcile workshop_slots for ${workshopId}: ${slotResult.error.code}`
      );
    }

    return diff;
  }
}
