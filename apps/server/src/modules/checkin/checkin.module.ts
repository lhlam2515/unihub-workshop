/**
 * Check-in Module
 *
 * Handles:
 * - QR code scanning (online and offline)
 * - Ticket management and validation
 * - Check-in statistics and reporting
 *
 * Imports: DatabaseModule, CatalogModule (for workshop info)
 */

import { DatabaseModule } from "@database/database.module";
import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module";

// Controllers
import { CheckinController } from "./controllers/checkin.controller";
import { TicketsController } from "./controllers/tickets.controller";

// Services
import { CheckinRecordsRepository } from "./repositories/checkin-records.repository";
import { TicketsRepository } from "./repositories/tickets.repository";
import { CheckinService } from "./services/checkin.service";
import { OfflineSyncService } from "./services/offline-sync.service";
import { TicketService } from "./services/ticket.service";

// Repositories

@Module({
  imports: [DatabaseModule, CatalogModule],
  controllers: [CheckinController, TicketsController],
  providers: [
    // Services
    CheckinService,
    TicketService,
    OfflineSyncService,
    // Repositories
    TicketsRepository,
    CheckinRecordsRepository,
  ],
  exports: [TicketService],
})
export class CheckinModule {}
