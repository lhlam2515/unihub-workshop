/**
 * Catalog Module
 *
 * Handles:
 * - Workshop catalog (public list/detail, admin CRUD)
 * - Room management
 * - Speaker management
 * - Document upload and AI summarization
 * - Redis seat counter integration
 */

import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { DatabaseModule } from "@/database/database.module";
import { RedisModule } from "@/shared/redis/redis.module";

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
@Module({
  imports: [DatabaseModule, RedisModule, ScheduleModule.forRoot()],
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
  exports: [WorkshopsService, SeatCounterService],
})
export class CatalogModule {}
