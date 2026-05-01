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
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import { RedisService } from "@/shared/redis/redis.service";

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
      const workshops = await this.db
        .select({
          workshopId: this.schema.workshops.workshopId,
          capacity: this.schema.workshops.capacity,
        })
        .from(this.schema.workshops)
        .where(eq(this.schema.workshops.status, "PUBLISHED"));

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
    const [confirmedResult] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(this.schema.registrations)
      .where(
        and(
          eq(this.schema.registrations.workshopId, workshopId),
          eq(this.schema.registrations.status, "CONFIRMED")
        )
      );

    const lockPattern = `seat:lock:${workshopId}:*`;
    const lockKeys = await this.redisService.scanKeys(lockPattern);
    const confirmedCount = confirmedResult?.count ?? 0;
    const lockedCount = lockKeys.length;

    // Read old seat:available value for discrepancy logging
    const oldRedisValue = await this.redisService.get(
      `seat:available:${workshopId}`
    );
    const oldExpected = capacity - confirmedCount - lockedCount;
    const diff = oldRedisValue
      ? Math.abs(parseInt(oldRedisValue, 10) - oldExpected)
      : 0;

    // UPSERT workshop_slots with reconciled counts
    await this.db
      .insert(this.schema.workshopSlots)
      .values({
        workshopId,
        totalCapacity: capacity,
        confirmedCount,
        lockedCount,
      })
      .onConflictDoUpdate({
        target: this.schema.workshopSlots.workshopId,
        set: {
          confirmedCount,
          lockedCount,
          updatedAt: sql`NOW()`,
        },
      });

    return diff;
  }
}
