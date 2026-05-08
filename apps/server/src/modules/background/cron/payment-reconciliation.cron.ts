import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { RedisService } from "@/infra/redis/redis.service";
import { PaymentReconciliationService } from "@/modules/payment/services/payment-reconciliation.service";

@Injectable()
export class PaymentReconciliationCron {
  private readonly logger = new Logger(PaymentReconciliationCron.name);

  constructor(
    private readonly reconciliationService: PaymentReconciliationService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Runs payment reconciliation every 10 minutes.
   *
   * Checks UNRESOLVED payments against their gateway adapter and
   * updates local status. Flags payments UNRESOLVED > 24h for admin review.
   *
   * Side effects:
   * - Updates payment rows in PostgreSQL.
   * - Records last_run timestamp in Redis.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePaymentReconciliation(): Promise<void> {
    try {
      const result = await this.reconciliationService.reconcile();
      if (result.isSuccess) {
        this.logger.log(
          `Payment reconciliation: ${result.data.unresolvedCount} unresolved`
        );
      } else {
        this.logger.warn(`Reconciliation skipped: ${result.error.code}`);
      }

      await this.redisService.set(
        "cron:last_run:payment-reconciliation",
        new Date().toISOString()
      );
    } catch (error) {
      this.logger.error("Payment reconciliation cron failed", error);
    }
  }
}
