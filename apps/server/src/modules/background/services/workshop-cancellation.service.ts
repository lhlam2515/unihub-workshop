import { Injectable, Logger } from "@nestjs/common";

import type { WorkshopCancelledEventData } from "@/infra/messaging/event-contracts";
import { RegistrationsService } from "@/modules/booking/services/registrations.service";

/**
 * Processes workshop cancellation domain events asynchronously.
 *
 * When a workshop is cancelled, this service:
 * 1. Voids all active registrations (CONFIRMED / PENDING)
 *
 * Business rules:
 * - Registration voiding is idempotent — already-cancelled records are left untouched.
 * - Failures are logged but never thrown — the caller (BullMQ worker) determines retry.
 *
 * Side effects:
 * - Updates registration rows in PostgreSQL.
 */
@Injectable()
export class WorkshopCancellationService {
  private readonly logger = new Logger(WorkshopCancellationService.name);

  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * Execute the full cancellation batch for a workshop.
   *
   * @param event - The workshop.cancelled event payload.
   */
  async handleCancellation(event: WorkshopCancelledEventData): Promise<void> {
    const { workshopId, title } = event;

    // Step 1: Void all active registrations
    const voidResult =
      await this.registrationsService.cancelAllForWorkshop(workshopId);
    if (voidResult.isFailure) {
      this.logger.error(
        `[CANCEL_WORKSHOP] Failed to void registrations for ${workshopId}: ${voidResult.error.message}`
      );
      return;
    }

    const { cancelledCount } = voidResult.data;
    this.logger.log(
      `[CANCEL_WORKSHOP] Voided ${cancelledCount} registrations for workshop "${title}" (${workshopId})`
    );

    // Step 2: Create notification logs (best-effort, per ADR-11)
    // Student notification is handled via the NotificationLogProducer
    // which creates notification_log rows and enqueues dispatch jobs.
    // For now, the void operation succeeds independently of notification delivery.
    if (cancelledCount > 0) {
      this.logger.log(
        `[CANCEL_WORKSHOP] ${cancelledCount} students affected by cancellation of "${title}"`
      );
      // TODO(2E-4): Lookup student IDs from voided registrations for targeted
      // notification via NotificationLogProducer.batchCreateAndEnqueue().
      // Currently, only the workshop creator receives notification (handled
      // inline in WorkshopsService.cancelWorkshop()).
    }
  }
}
