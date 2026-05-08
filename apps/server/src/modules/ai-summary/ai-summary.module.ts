import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { StorageModule } from "@/infra/storage/storage.module";

import { CatalogModule } from "../catalog/catalog.module";
import { DocumentsAdminController } from "./controllers/documents-admin.controller";
import { LlmSummaryFilter } from "./pipeline/llm-summary.filter";
import { PdfExtractionFilter } from "./pipeline/pdf-extraction.filter";
import { PdfSummaryPipeline } from "./pipeline/pdf-summary.pipeline";
import { PersistResultFilter } from "./pipeline/persist-result.filter";
import { TextCleaningFilter } from "./pipeline/text-cleaning.filter";
import { UpsertRecordFilter } from "./pipeline/upsert-record.filter";
import { AiSummariesRepository } from "./repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "./repositories/workshop-documents.repository";
import { AiSummaryService } from "./services/ai-summary.service";
import { DocumentsService } from "./services/workshop-documents.service";

@Module({
  imports: [DatabaseModule, RedisModule, StorageModule, SharedQueueModule, forwardRef(() => CatalogModule)],
  controllers: [DocumentsAdminController],
  providers: [
    // Services
    AiSummaryService,
    DocumentsService,
    // Repositories
    AiSummariesRepository,
    WorkshopDocumentsRepository,
    // Pipeline (Pipe-and-Filter)
    UpsertRecordFilter,
    PdfExtractionFilter,
    TextCleaningFilter,
    LlmSummaryFilter,
    PersistResultFilter,
    PdfSummaryPipeline,
  ],
  exports: [AiSummariesRepository, AiSummaryService, DocumentsService, WorkshopDocumentsRepository],
})
export class AiSummaryModule {}
