/**
 * PaymentTimeoutCron
 *
 * Scheduled job to identify PENDING payments whose timeout deadline has passed
 * and transition them to TIMEOUT via the PaymentsService.
 *
 * Runs every 1 minute.
 *
 * Business rules:
 * - Only targets payments where status = 'PENDING' AND timeout_at < NOW().
 * - Delegates each expiry to PaymentsService.expirePayment() which handles
 *   the full ACID transaction (payment → TIMEOUT, registration → CANCELLED,
 *   Redis seat release, and notification dispatch).
 * - Does NOT process the same payment twice — expirePayment is idempotent
 *   for already-terminal payments.
 *
 * Side effects:
 * - Calls expirePayment on each overdue payment, producing all its side effects.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { RedisService } from "@/infra/redis/redis.service";
import { PaymentsRepository } from "@/modules/payment/repositories/payments.repository";
import { PaymentsService } from "@/modules/payment/services/payments.service";

@Injectable()
export class PaymentTimeoutCron {
  private readonly logger = new Logger(PaymentTimeoutCron.name);

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly paymentsService: PaymentsService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Finds all expired PENDING payments via PaymentsRepository and expires them.
   *
   * All database access goes through the repository layer, preserving the
   * Result pattern and layered architecture (per layered-architecture.md §Anti-Pattern #4).
   *
   * Runs every minute. Wraps the operation in a try/catch so that any
   * unexpected error from the repository or service does not crash the cron scheduler.
   *
   * Side effects:
   * - Calls PaymentsService.expirePayment() for each overdue payment.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePaymentTimeout(): Promise<void> {
    try {
      const overdueResult = await this.paymentsRepo.findPendingOverdue();
      if (overdueResult.isFailure) {
        this.logger.error(
          `Failed to query overdue payments: ${overdueResult.error.code}`
        );
        return;
      }

      if (overdueResult.data.length === 0) {
        return;
      }

      let processed = 0;
      for (const payment of overdueResult.data) {
        const result = await this.paymentsService.expirePayment(
          payment.paymentId
        );
        if (result.isSuccess) {
          processed++;
        } else {
          this.logger.warn(
            `Failed to expire payment ${payment.paymentId}: ${result.error.code}`
          );
        }
      }

      this.logger.log(
        `Payment timeout cron: ${processed}/${overdueResult.data.length} payments handled`
      );

      // Record last_run timestamp for system monitoring
      await this.redisService.set(
        "cron:last_run:payment-timeout",
        new Date().toISOString()
      );
    } catch (error) {
      this.logger.error("Payment timeout cron failed", error);
    }
  }
}
