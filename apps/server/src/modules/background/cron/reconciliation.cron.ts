/**
 * ReconciliationCron
 *
 * Scheduled job to detect seat-counter discrepancies between Redis and
 * PostgreSQL. Compares the actual available seat count in Redis against
 * the expected value computed from DB data.
 *
 * Runs every 10 minutes.
 *
 * Business rules:
 * - Only checks PUBLISHED workshops.
 * - Expected value = workshop.capacity - SUM(confirmedCount) - SUM(lockedCount)
 *   from workshop_slots.
 * - Discrepancies exceeding DISCREPANCY_THRESHOLD (5) are logged as warnings.
 * - This cron does NOT auto-fix discrepancies — manual admin intervention is
 *   required to correct seat counters.
 *
 * Side effects:
 * - Reads seat:available:{workshopId} from Redis.
 * - Reads workshop_slots from PostgreSQL.
 * - Logs warnings for significant discrepancies.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import { RedisService } from "@/shared/redis/redis.service";

/**
 * Maximum allowed difference between Redis seat counter and DB expected value
 * before a warning is logged.
 */
const DISCREPANCY_THRESHOLD = 5;

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema,
    private readonly redisService: RedisService
  ) {}

  /**
   * Checks all PUBLISHED workshops for seat-counter discrepancies.
   *
   * Runs every 10 minutes. For each workshop, computes the expected available
   * seats from DB data and compares it against the Redis counter.
   * Discrepancies above the threshold are logged as warnings.
   *
   * Side effects:
   * - Reads Redis keys and DB tables.
   * - Logs warnings when discrepancies exceed threshold.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReconciliation(): Promise<void> {
    try {
      const workshops = await this.db
        .select({
          workshopId: this.schema.workshops.workshopId,
          capacity: this.schema.workshops.capacity,
        })
        .from(this.schema.workshops)
        .where(eq(this.schema.workshops.status, "PUBLISHED"));

      let discrepancies = 0;

      for (const workshop of workshops) {
        try {
          const result = await this.checkWorkshopReconciliation(
            workshop.workshopId,
            Number(workshop.capacity)
          );

          if (result.discrepancy > DISCREPANCY_THRESHOLD) {
            discrepancies++;
            this.logger.warn(
              `Reconciliation discrepancy for workshop ${workshop.workshopId}: ` +
                `Redis=${result.redisValue}, Expected=${result.expectedValue}, ` +
                `Diff=${result.discrepancy}`
            );
          }
        } catch (error) {
          this.logger.error(
            `Reconciliation check failed for workshop ${workshop.workshopId}`,
            error
          );
        }
      }

      this.logger.log(
        `Reconciliation completed: ${workshops.length} checked, ${discrepancies} issues found`
      );
    } catch (error) {
      this.logger.error("Reconciliation cron failed", error);
    }
  }

  /**
   * Compares Redis seat counter against DB expected value for a workshop.
   *
   * Expected = capacity - confirmedCount - lockedCount (from workshop_slots).
   * If no workshop_slots row exists, locked and confirmed counts default to 0.
   *
   * @param workshopId - The UUID of the workshop to check.
   * @param capacity - The total seat capacity of the workshop.
   * @returns Reconciliation detail including discrepancy, Redis value, and expected value.
   */
  private async checkWorkshopReconciliation(
    workshopId: string,
    capacity: number
  ): Promise<{
    discrepancy: number;
    redisValue: number;
    expectedValue: number;
  }> {
    const key = `seat:available:${workshopId}`;
    const redisValueStr = await this.redisService.get(key);
    const redisValue = redisValueStr ? parseInt(redisValueStr, 10) : capacity;

    const [slot] = await this.db
      .select()
      .from(this.schema.workshopSlots)
      .where(eq(this.schema.workshopSlots.workshopId, workshopId))
      .limit(1);

    const confirmedCount = slot?.confirmedCount ?? 0;
    const lockedCount = slot?.lockedCount ?? 0;
    const expectedValue = capacity - confirmedCount - lockedCount;

    const discrepancy = Math.abs(redisValue - expectedValue);

    return { discrepancy, redisValue, expectedValue };
  }
}
