import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { MessagingModule } from "@/infra/messaging/messaging.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { StorageModule } from "@/infra/storage/storage.module";

import { AiSummaryAdminController } from "./controllers/ai-summary-admin.controller";
import { LlmSummaryFilter } from "./pipeline/llm-summary.filter";
import { PdfExtractionFilter } from "./pipeline/pdf-extraction.filter";
import { PdfSummaryPipeline } from "./pipeline/pdf-summary.pipeline";
import { PersistResultFilter } from "./pipeline/persist-result.filter";
import { TextCleaningFilter } from "./pipeline/text-cleaning.filter";
import { UpsertRecordFilter } from "./pipeline/upsert-record.filter";
import { AiSummariesRepository } from "./repositories/ai-summaries.repository";
import { AiSummaryService } from "./services/ai-summary.service";

@Module({
  imports: [DatabaseModule, RedisModule, StorageModule, MessagingModule],
  controllers: [AiSummaryAdminController],
  providers: [
    // Services
    AiSummaryService,
    // Repositories
    AiSummariesRepository,
    // Pipeline (Pipe-and-Filter)
    UpsertRecordFilter,
    PdfExtractionFilter,
    TextCleaningFilter,
    LlmSummaryFilter,
    PersistResultFilter,
    PdfSummaryPipeline,
  ],
  exports: [AiSummariesRepository, AiSummaryService],
})
export class AiSummaryModule {}
