import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { GlobalExceptionFilter } from "@/core/exceptions/global-exception.filter";
import { ResponseInterceptor } from "@/core/interceptors/response.interceptor";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database/database.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { IamModule } from "./modules/iam/iam.module";
import { RedisModule } from "./shared/redis/redis.module";
import { StorageModule } from "./shared/storage/storage.module";

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
    IamModule,
    CatalogModule,
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
