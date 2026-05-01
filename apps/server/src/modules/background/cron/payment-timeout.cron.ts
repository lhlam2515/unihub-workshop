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
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import { PaymentsService } from "@/modules/booking/services/payments.service";

@Injectable()
export class PaymentTimeoutCron {
  private readonly logger = new Logger(PaymentTimeoutCron.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema,
    private readonly paymentsService: PaymentsService
  ) {}

  /**
   * Finds all expired PENDING payments and expires them.
   *
   * Runs every minute. Wraps the entire operation in a try/catch so that any
   * unexpected database or service error does not crash the cron scheduler.
   *
   * Side effects:
   * - Calls PaymentsService.expirePayment() for each overdue payment.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePaymentTimeout(): Promise<void> {
    try {
      const expiredPayments = await this.db
        .select()
        .from(this.schema.payments)
        .where(
          and(
            eq(this.schema.payments.status, "PENDING"),
            sql`${this.schema.payments.timeoutAt} < NOW()`
          )
        );

      if (expiredPayments.length === 0) {
        return;
      }

      let processed = 0;
      for (const payment of expiredPayments) {
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
        `Payment timeout cron: ${processed}/${expiredPayments.length} payments handled`
      );
    } catch (error) {
      this.logger.error("Payment timeout cron failed", error);
    }
  }
}
