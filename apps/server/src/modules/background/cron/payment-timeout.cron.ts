/**
 * PaymentTimeoutCron
 *
 * Scheduled job to identify PENDING payments whose timeout deadline has passed
 * and transition them to TIMEOUT via the PaymentsService.
 *
 * Runs every 1 minute.
 *
 * Business rules:
 * - Only targets payments where status = 'INITIATED' AND timeout_at < NOW().
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
  private isRunning = false;

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
    if (this.isRunning) {
      this.logger.warn(
        "Payment timeout cron skipped: previous run still active"
      );
      return;
    }
    this.isRunning = true;
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

      const CONCURRENCY = 5;
      const payments = overdueResult.data;
      let succeeded = 0;

      for (let i = 0; i < payments.length; i += CONCURRENCY) {
        const chunk = payments.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map((p) => this.paymentsService.expirePayment(p.paymentId))
        );

        for (let j = 0; j < results.length; j++) {
          const payment = chunk[j];
          const result = results[j];

          if (result.status === "rejected") {
            this.logger.error(
              `Payment timeout cron: expirePayment(${payment.paymentId}) threw:`,
              result.reason
            );
            continue;
          }

          const expireResult = result.value;
          if (expireResult.isFailure) {
            this.logger.warn(
              `Payment timeout cron: expirePayment(${payment.paymentId}) failed: ${expireResult.error.code}`
            );
          } else {
            succeeded++;
          }
        }
      }

      this.logger.log(
        `Payment timeout cron: ${succeeded}/${overdueResult.data.length} payments handled`
      );

      // Record last_run timestamp for system monitoring
      await this.redisService.set(
        "cron:last_run:payment-timeout",
        new Date().toISOString()
      );
    } catch (error) {
      this.logger.error("Payment timeout cron failed", error);
    } finally {
      this.isRunning = false;
    }
  }
}
