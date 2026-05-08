import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { IdempotencyKeysRepository } from "@/modules/payment/repositories/idempotency-keys.repository";

@Injectable()
export class IdempotencyCleanupCron {
  private readonly logger = new Logger(IdempotencyCleanupCron.name);

  constructor(private readonly idempotencyRepo: IdempotencyKeysRepository) {}

  /**
   * Daily cleanup of COMPLETED idempotency keys older than 24h.
   *
   * Skips keys referenced by UNRESOLVED payments to preserve FK
   * relationships for manual investigation.
   *
   * Runs daily at 3:00 AM.
   *
   * Side effects:
   * - Deletes expired rows from the idempotency_keys table.
   */
  @Cron("0 3 * * *")
  async handleCleanup(): Promise<void> {
    try {
      const result = await this.idempotencyRepo.deleteExpiredNonReferenced(24);
      if (result.isSuccess) {
        this.logger.log(
          `Cleaned up ${result.data.deletedCount} expired idempotency keys`
        );
      } else {
        this.logger.warn(`Idempotency cleanup failed: ${result.error.code}`);
      }
    } catch (error) {
      this.logger.error("Idempotency cleanup cron failed", error);
    }
  }
}
