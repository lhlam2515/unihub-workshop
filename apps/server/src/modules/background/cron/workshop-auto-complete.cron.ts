/**
 * WorkshopAutoCompleteCron
 *
 * Scheduled job that transitions PUBLISHED workshops whose end time has passed
 * to COMPLETED status. Runs every hour.
 *
 * Business rules:
 * - Only targets workshops where status = 'PUBLISHED' AND ends_at < NOW().
 * - Delegates to WorkshopsService.completePastWorkshops() which uses the
 *   WorkshopsRepository to execute the UPDATE.
 * - Idempotent — already COMPLETED, DRAFT, or CANCELLED workshops are excluded
 *   by the WHERE clause.
 * - Designed to meet FR-F10-005: Workshop auto-completion cron.
 *
 * Side effects:
 * - Updates workshops table: status → 'COMPLETED' for all eligible workshops.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { WorkshopsService } from "@/modules/catalog/services/workshops.service";

@Injectable()
export class WorkshopAutoCompleteCron {
  private readonly logger = new Logger(WorkshopAutoCompleteCron.name);

  constructor(private readonly workshopsService: WorkshopsService) {}

  /**
   * Runs every hour to find and complete expired workshops.
   *
   * Wraps the entire operation in a try/catch so that any unexpected error
   * does not crash the cron scheduler.
   *
   * Side effects:
   * - Calls WorkshopsService.completePastWorkshops() which updates the DB.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoComplete(): Promise<void> {
    try {
      const result = await this.workshopsService.completePastWorkshops();

      if (result.isSuccess && result.data > 0) {
        this.logger.log(
          `Auto-complete cron: ${result.data} workshops transitioned to COMPLETED`
        );
      }
    } catch (error) {
      this.logger.error("Workshop auto-complete cron failed", error);
    }
  }
}
