import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";

const CSV_INPUT_DIR = process.env.CSV_INPUT_DIR ?? "/input";

@Injectable()
export class StudentSyncSchedulerCron {
  private readonly logger = new Logger(StudentSyncSchedulerCron.name);

  constructor(private readonly studentSyncService: StudentSyncService) {}

  /**
   * Nightly scan for new CSV files in the input directory.
   *
   * Lists all CSV files in CSV_INPUT_DIR, picks the most recent one
   * (by filename sort, descending), and triggers a sync job.
   *
   * Runs daily at 2:00 AM Asia/Ho_Chi_Minh.
   *
   * Side effects:
   * - Creates a sync job record and enqueues it for background processing.
   */
  @Cron("0 2 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async handleNightlySync(): Promise<void> {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");

      let files: string[];
      try {
        files = fs
          .readdirSync(CSV_INPUT_DIR)
          .filter((f: string) => f.endsWith(".csv"))
          .sort()
          .reverse();
      } catch {
        this.logger.warn(
          `CSV input directory "${CSV_INPUT_DIR}" not found or not accessible`
        );
        return;
      }

      if (files.length === 0) {
        this.logger.log("No CSV files found in input directory");
        return;
      }

      const latestFile = files[0];
      const result = await this.studentSyncService.triggerSync(
        path.join(CSV_INPUT_DIR, latestFile)
      );

      if (result.isSuccess) {
        this.logger.log(
          `Nightly sync triggered for "${latestFile}" — job ${result.data.jobId}`
        );
      } else {
        this.logger.warn(
          `Failed to trigger nightly sync: ${result.error.code}`
        );
      }
    } catch (error) {
      this.logger.error("Student sync scheduler cron failed", error);
    }
  }
}
