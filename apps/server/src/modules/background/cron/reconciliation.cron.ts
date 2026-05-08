/**
 * ReconciliationCron
 *
 * Scheduled job that reconciles seat availability counters from actual data.
 * Verifies Redis seat:available counters match DB registrations + Redis locks.
 *
 * Runs every 10 minutes.
 *
 * Business rules:
 * - confirmed_count = COUNT of registrations WHERE status = 'CONFIRMED' per workshop.
 * - locked_count = COUNT of active Redis keys seat:lock:{workshopId}:*.
 * - Only OPEN workshops are checked.
 * - Large discrepancies (>DISCREPANCY_THRESHOLD) are logged as warnings.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { RedisService } from "@/infra/redis/redis.service";
import { RegistrationsService } from "@/modules/booking/services/registrations.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";

const LAST_RUN_KEY = "cron:last_run:reconciliation";
const DISCREPANCY_THRESHOLD = 5;

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(
    private readonly workshopsService: WorkshopsService,
    private readonly registrationsService: RegistrationsService,
    private readonly redisService: RedisService
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReconciliation(): Promise<void> {
    try {
      const workshopsResult =
        await this.workshopsService.getPublishedWorkshopsBasic();
      if (workshopsResult.isFailure) {
        this.logger.error(
          `Failed to fetch open workshops: ${workshopsResult.error.code}`
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
            workshop.seatsTotal
          );
          if (diff > DISCREPANCY_THRESHOLD) {
            discrepancyCount++;
            this.logger.warn(
              `Reconciliation discrepancy for workshop ${wid}: diff=${diff}`
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

      await this.redisService.set(LAST_RUN_KEY, new Date().toISOString());
    } catch (error) {
      this.logger.error("Reconciliation cron failed", error);
    }
  }

  private async reconcileWorkshop(
    workshopId: string,
    seatsTotal: number
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

    const oldRedisValue = await this.redisService.get(
      `seat:available:${workshopId}`
    );
    const oldExpected = seatsTotal - confirmedCount - lockedCount;
    const diff = oldRedisValue
      ? Math.abs(parseInt(oldRedisValue, 10) - oldExpected)
      : 0;

    // Log-only reconciliation — no workshop_slots to update
    if (diff > DISCREPANCY_THRESHOLD) {
      this.logger.warn(
        `Workshop ${workshopId}: Redis=${oldRedisValue}, expected=${oldExpected}` +
          ` (confirmed=${confirmedCount}, locked=${lockedCount}, total=${seatsTotal})`
      );
    }

    return diff;
  }
}
