import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { MessagingModule } from "@/infra/messaging/messaging.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { AiSummaryModule } from "@/modules/ai-summary/ai-summary.module";

import { RoomsAdminController } from "./controllers/rooms-admin.controller";
import { SpeakersAdminController } from "./controllers/speakers-admin.controller";
import { WorkshopsAdminController } from "./controllers/workshops-admin.controller";
import { WorkshopsPublicController } from "./controllers/workshops-public.controller";
import { RoomsRepository } from "./repositories/rooms.repository";
import { SpeakersRepository } from "./repositories/speakers.repository";
import { WorkshopsRepository } from "./repositories/workshops.repository";
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
 * - Seat counter management (Redis — consumed by BookingModule)
 * - Workshop notification publishing (BullMQ — consumed by BackgroundModule)
 *
 * Imports:
 * - DatabaseModule — PostgreSQL access via Drizzle ORM
 * - RedisModule — seat:available counter management
 * - MessagingModule — BullMQ notification queue for workshop lifecycle events
 * - AiSummaryModule — document upload, storage, and AI summarization (extracted module)
 *
 * Exports:
 * - WorkshopsService — consumed by BookingModule (registration validation) and BackgroundModule
 * - SeatCounterService — consumed by BookingModule (seat availability checks)
 * - WorkshopNotificationPublisher — consumed by BackgroundModule (notification worker)
 */
@Module({
  imports: [DatabaseModule, RedisModule, MessagingModule, AiSummaryModule],
  controllers: [
    WorkshopsPublicController,
    WorkshopsAdminController,
    RoomsAdminController,
    SpeakersAdminController,
  ],
  providers: [
    // Services
    WorkshopsService,
    RoomConflictService,
    RoomsService,
    SpeakersService,
    SeatCounterService,
    WorkshopNotificationPublisher,
    // Repositories
    WorkshopsRepository,
    RoomsRepository,
    SpeakersRepository,
  ],
  exports: [
    WorkshopsService,
    SeatCounterService,
    WorkshopNotificationPublisher,
    WorkshopsRepository,
  ],
})
export class CatalogModule {}
