import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { StorageService } from "@/infra/storage/storage.service";
import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";

@Injectable()
export class StudentSyncSchedulerCron {
  private readonly logger = new Logger(StudentSyncSchedulerCron.name);

  constructor(
    private readonly studentSyncService: StudentSyncService,
    private readonly storageService: StorageService
  ) {}

  /**
   * Nightly scan for new CSV files in Object Storage.
   *
   * Lists all CSV objects with prefix "students_" from the configured
   * S3 bucket, picks the most recent one (by LastModified), and triggers
   * a sync job with the raw storage key.
   *
   * Runs daily at 2:00 AM Asia/Ho_Chi_Minh.
   *
   * Business rules:
   * - Only considers objects ending with ".csv".
   * - If no files found, logs a warning and exits silently (no job created).
   *
   * Side effects:
   * - Sends ListObjectsV2 request to the S3 endpoint.
   * - Creates a sync job record and enqueues it for background processing.
   */
  @Cron("0 2 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async handleNightlySync(): Promise<void> {
    try {
      const listResult = await this.storageService.listFiles("students_");

      if (listResult.isFailure) {
        this.logger.warn(
          `Failed to list CSV files from Object Storage: ${listResult.error.message}`
        );
        return;
      }

      const files = listResult.data;

      if (files.length === 0) {
        this.logger.log("No CSV files found in Object Storage");
        return;
      }

      const latestFile = files[0];
      const result = await this.studentSyncService.triggerSync(
        latestFile,
        "CRON"
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
