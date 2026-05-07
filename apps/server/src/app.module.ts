import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import {
  aiConfig,
  appConfig,
  corsConfig,
  dbConfig,
  jwtConfig,
  loggingConfig,
  paymentConfig,
  r2Config,
  redisConfig,
  validateEnv,
} from "@/core/config/env.config";
import { GlobalExceptionFilter } from "@/core/exceptions/global-exception.filter";
import { ResponseInterceptor } from "@/core/interceptors/response.interceptor";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./infra/database/database.module";
import { MessagingModule } from "./infra/messaging/messaging.module";
import { RedisModule } from "./infra/redis/redis.module";
import { StorageModule } from "./infra/storage/storage.module";
import { AiSummaryModule } from "./modules/ai-summary/ai-summary.module";
import { BackgroundModule } from "./modules/background/background.module";
import { BookingModule } from "./modules/booking/booking.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckinModule } from "./modules/checkin/checkin.module";
import { CsvSyncModule } from "./modules/csv-sync/csv-sync.module";
import { IamModule } from "./modules/iam/iam.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { PaymentModule } from "./modules/payment/payment.module";
import { RateLimitModule } from "./modules/rate-limit/rate-limit.module";

/**
 * Root application module for the UniHub Workshop backend.
 *
 * Registers all infrastructure modules (Database, Redis, Storage, Queue)
 * before domain modules in dependency order. BackgroundModule remains
 * last because it depends on BookingModule, CatalogModule, PaymentModule,
 * and NotificationModule. This ordering prevents circular dependency
 * resolution errors and ensures all providers are available when
 * BackgroundModule's workers and cron jobs initialize.
 *
 * Business rules:
 * - BackgroundModule MUST remain the last entry in the imports array.
 * - IamModule and CatalogModule are registered before BookingModule
 *   because BookingModule imports CatalogModule for SeatCounterService.
 * - PaymentModule follows BookingModule (BookingModule imports PaymentModule).
 * - NotificationModule is event-driven; placed after domain modules.
 * - MessagingModule is a shared BullMQ infrastructure module consumed
 *   by Catalog, Booking, Payment, Notification, and Background modules.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [
        appConfig,
        jwtConfig,
        dbConfig,
        redisConfig,
        r2Config,
        paymentConfig,
        loggingConfig,
        corsConfig,
        aiConfig,
      ],
    }),
    DatabaseModule,
    RedisModule,
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        endpoint: config.getOrThrow<string>("r2.endpoint"),
        region: config.get<string>("r2.region") ?? "auto",
        accessKeyId: config.getOrThrow<string>("r2.accessKeyId"),
        secretAccessKey: config.getOrThrow<string>("r2.secretAccessKey"),
        bucketName: config.getOrThrow<string>("r2.bucketName"),
        publicUrl: config.getOrThrow<string>("r2.publicUrl"),
        maxFileSizeBytes:
          config.get<number>("r2.maxFileSizeBytes") ?? 52_428_800,
      }),
    }),
    MessagingModule,
    RateLimitModule,
    IamModule,
    CatalogModule,
    BookingModule,
    PaymentModule,
    CheckinModule,
    AiSummaryModule,
    CsvSyncModule,
    NotificationModule,
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
