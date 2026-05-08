/**
 * Check-in Module
 *
 * Handles:
 * - QR code scanning (online and offline)
 * - Registration lookup for check-in validation
 * - Check-in statistics and reporting
 *
 * Imports: DatabaseModule, CatalogModule (for workshop info)
 */

import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";

import { CatalogModule } from "../catalog/catalog.module";
import {
  CheckinController,
  CheckinPreloadController,
} from "./controllers/checkin.controller";
import { CheckinRecordsRepository } from "./repositories/checkin-records.repository";
import { RegistrationsRepository } from "./repositories/registrations.repository";
import { CheckinService } from "./services/checkin.service";
import { OfflineSyncService } from "./services/offline-sync.service";

@Module({
  imports: [DatabaseModule, CatalogModule],
  controllers: [CheckinController, CheckinPreloadController],
  providers: [
    // Services
    CheckinService,
    OfflineSyncService,
    // Repositories
    RegistrationsRepository,
    CheckinRecordsRepository,
  ],
  exports: [RegistrationsRepository],
})
export class CheckinModule {}
