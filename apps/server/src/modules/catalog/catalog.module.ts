import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { RedisModule } from "@/infra/redis/redis.module";

import { DocumentsAdminController } from "./controllers/documents-admin.controller";
import { RoomsAdminController } from "./controllers/rooms-admin.controller";
import { SpeakersAdminController } from "./controllers/speakers-admin.controller";
import { WorkshopsAdminController } from "./controllers/workshops-admin.controller";
import { WorkshopsPublicController } from "./controllers/workshops-public.controller";
import { AiSummariesRepository } from "./repositories/ai-summaries.repository";
import { RoomsRepository } from "./repositories/rooms.repository";
import { SpeakersRepository } from "./repositories/speakers.repository";
import { WorkshopDocumentsRepository } from "./repositories/workshop-documents.repository";
import { WorkshopSlotsRepository } from "./repositories/workshop-slots.repository";
import { WorkshopsRepository } from "./repositories/workshops.repository";
import { DocumentsService } from "./services/documents.service";
import { RoomConflictService } from "./services/room-conflict.service";
import { RoomsService } from "./services/rooms.service";
import { SeatCounterService } from "./services/seat-counter.service";
import { SpeakersService } from "./services/speakers.service";
import { WorkshopNotificationPublisher } from "./services/workshop-notification-publisher.service";
import { WorkshopsService } from "./services/workshops.service";
/**
 * Catalog Module
 *
 * Central domain module for the workshop catalog lifecycle.
 *
 * Domain responsibilities:
 * - Workshop CRUD (admin) and public listing/detail queries
 * - Room management with schedule conflict detection
 * - Speaker management
 * - Document upload, storage, and AI summarization
 * - Seat counter management (Redis — consumed by BookingModule)
 * - Workshop notification publishing (BullMQ — consumed by BackgroundModule)
 *
 * Imports:
 * - DatabaseModule — PostgreSQL access via Drizzle ORM
 * - RedisModule — seat:available counter management
 * - SharedQueueModule — BullMQ notification queue for workshop lifecycle events
 * - ScheduleModule — cron scheduling (room conflict detection, etc.)
 *
 * Exports:
 * - WorkshopsService — consumed by BookingModule (registration validation) and BackgroundModule
 * - SeatCounterService — consumed by BookingModule (seat availability checks)
 * - WorkshopNotificationPublisher — consumed by BackgroundModule (notification worker)
 */
@Module({
  imports: [DatabaseModule, RedisModule, SharedQueueModule],
  controllers: [
    WorkshopsPublicController,
    WorkshopsAdminController,
    RoomsAdminController,
    SpeakersAdminController,
    DocumentsAdminController,
  ],
  providers: [
    // Services
    WorkshopsService,
    RoomConflictService,
    RoomsService,
    SpeakersService,
    DocumentsService,
    SeatCounterService,
    WorkshopNotificationPublisher,
    // Repositories
    WorkshopsRepository,
    WorkshopSlotsRepository,
    RoomsRepository,
    SpeakersRepository,
    WorkshopDocumentsRepository,
    AiSummariesRepository,
  ],
  exports: [
    WorkshopsService,
    SeatCounterService,
    WorkshopNotificationPublisher,
    AiSummariesRepository,
  ],
})
export class CatalogModule {}
