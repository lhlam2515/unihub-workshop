/**
 * Payment Reconciliation Service
 *
 * Background reconciliation for UNRESOLVED payments. Queries payments
 * stuck in UNRESOLVED status and checks their actual state with the
 * corresponding gateway adapter, then updates the local database.
 *
 * Concurrency guard:
 * Uses PostgreSQL pg_try_advisory_xact_lock to prevent concurrent
 * reconciliation runs — if the lock cannot be acquired, returns 409.
 *
 * Business rules:
 * - Only UNRESOLVED payments are candidates for reconciliation.
 * - Each payment is checked against its registered gateway adapter.
 * - If the adapter confirms SUCCEEDED → payment updated to SUCCEEDED.
 * - If the adapter confirms FAILED → payment updated to FAILED.
 * - If the adapter cannot determine → payment remains UNRESOLVED.
 * - Advisory lock ID: 20240508 (arbitrary stable key for this operation).
 *
 * Side effects:
 * - Updates payment status rows in PostgreSQL.
 * - Updates idempotency_keys rows for resolved payments.
 * - Acquires a PostgreSQL advisory lock (transaction-scoped).
 */
import { createHash } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import { concurrentModification } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { PaymentGatewayFactory } from "../gateways/payment-gateway.factory";
import { IdempotencyKeysRepository } from "../repositories/idempotency-keys.repository";
import { PaymentsRepository } from "../repositories/payments.repository";

const ADVISORY_LOCK_ID = 20240508;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly idempotencyRepo: IdempotencyKeysRepository
  ) {}

  /**
   * Runs a reconciliation cycle for UNRESOLVED payments.
   *
   * @returns OkResult with job metadata (jobId, startedAt, unresolvedCount),
   * or FailResult with:
   * - RECONCILIATION_IN_PROGRESS (409): Another reconciliation is already running.
   * - INTERNAL_ERROR (500): Unexpected failure.
   */
  async reconcile(): Promise<
    Result<{
      jobId: string;
      startedAt: string;
      unresolvedCount: number;
    }>
  > {
    // Acquire session-scoped advisory lock — fail fast if another reconciliation is running
    const lockResult =
      await this.paymentsRepo.tryAcquireAdvisoryLock(ADVISORY_LOCK_ID);
    if (lockResult.isFailure) return Result.fail(lockResult.error);
    if (!lockResult.data) {
      return Result.fail(
        concurrentModification("Reconciliation", "payment", 0)
      );
    }

    try {
      const startedAt = new Date().toISOString();
      const jobId = `recon_${Date.now()}`;

      // Find unresolved payments
      const paymentsResult = await this.paymentsRepo.findByStatus("UNRESOLVED");
      if (paymentsResult.isFailure) return Result.fail(paymentsResult.error);

      const unresolved: string[] = [];

      for (const payment of paymentsResult.data) {
        try {
          const adapter = this.gatewayFactory.getAdapter(payment.gateway);
          const statusResult = await adapter.checkPaymentStatus(
            payment.gatewayTxnId ?? ""
          );

          if (statusResult.isSuccess) {
            const resolvedStatus = statusResult.data.status;
            await this.paymentsRepo.updateStatus(
              payment.paymentId,
              resolvedStatus
            );

            // Update idempotency key for SUCCEEDED payments
            if (resolvedStatus === "SUCCEEDED") {
              const keyHash = createHash("sha256")
                .update(payment.idempotencyKey)
                .digest("hex");
              await this.idempotencyRepo.markCompleted(keyHash, {}, 200);
            }

            this.logger.log(
              `Payment ${payment.paymentId} resolved as ${resolvedStatus} via reconciliation`
            );
          } else {
            unresolved.push(payment.paymentId);
          }
        } catch (err) {
          this.logger.warn(
            `Reconciliation failed for payment ${payment.paymentId}: ${err}`
          );
          unresolved.push(payment.paymentId);
        }
      }

      return Result.ok({
        jobId,
        startedAt,
        unresolvedCount: unresolved.length,
      });
    } finally {
      // Always release the session-scoped lock
      await this.paymentsRepo.releaseAdvisoryLock(ADVISORY_LOCK_ID);
    }
  }
}
