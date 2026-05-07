import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { IamModule } from "@/modules/iam/iam.module";

import { StudentSyncAdminController } from "./controllers/student-sync-admin.controller";
import { StudentSyncErrorsRepository } from "./repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "./repositories/student-sync-jobs.repository";
import { StudentSyncService } from "./services/student-sync.service";
import { StudentSyncWorker } from "./workers/student-sync.worker";

@Module({
  imports: [DatabaseModule, SharedQueueModule, IamModule],
  controllers: [StudentSyncAdminController],
  providers: [
    // Services
    StudentSyncService,
    // Repositories
    StudentSyncJobsRepository,
    StudentSyncErrorsRepository,
    // Workers
    StudentSyncWorker,
  ],
  exports: [StudentSyncService],
})
export class CsvSyncModule {}
