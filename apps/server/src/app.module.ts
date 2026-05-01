import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { GlobalExceptionFilter } from "@/core/exceptions/global-exception.filter";
import { ResponseInterceptor } from "@/core/interceptors/response.interceptor";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database/database.module";
import { BackgroundModule } from "./modules/background/background.module";
import { BookingModule } from "./modules/booking/booking.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckinModule } from "./modules/checkin/checkin.module";
import { IamModule } from "./modules/iam/iam.module";
import { SharedQueueModule } from "./shared/queues/queue.module";
import { RedisModule } from "./shared/redis/redis.module";
import { StorageModule } from "./shared/storage/storage.module";

/**
 * Root application module for the UniHub Workshop backend.
 *
 * Registers all infrastructure modules (Database, Redis, Storage, Queue)
 * before domain modules (IAM, Catalog, Booking, Checkin), with
 * BackgroundModule last because it depends on BookingModule and
 * CatalogModule. This ordering prevents circular dependency resolution
 * errors and ensures all providers are available when BackgroundModule's
 * workers and cron jobs initialize.
 *
 * Business rules:
 * - BackgroundModule MUST remain the last entry in the imports array.
 * - IamModule and CatalogModule are registered before BookingModule
 *   because BookingModule imports CatalogModule for SeatCounterService.
 * - SharedQueueModule is a shared BullMQ infrastructure module consumed
 *   by Catalog, Booking, and Background modules — not @Global() so it
 *   must be explicitly imported.
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    StorageModule.forRoot({
      endpoint: process.env.R2_ENDPOINT!,
      region: process.env.R2_REGION ?? "auto",
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucketName: process.env.R2_BUCKET_NAME!,
      publicUrl: process.env.R2_PUBLIC_URL!,
      maxFileSizeBytes: parseInt(
        process.env.UPLOAD_MAX_FILE_SIZE ?? "52428800",
        10
      ),
    }),
    SharedQueueModule,
    IamModule,
    CatalogModule,
    BookingModule,
    CheckinModule,
    BackgroundModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
