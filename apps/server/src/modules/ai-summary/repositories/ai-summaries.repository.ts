/**
 * Retrieves and persists AI-generated document summaries with upsert support.
 */
import { randomUUID } from "node:crypto";
import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type {
  AiSummary,
  NewAiSummary,
} from "@/infra/database/types/async.types";
import type { SummaryStatus } from "@/infra/database/types/enums.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class AiSummariesRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves the AI summary for a workshop (1:1).
   *
   * Drizzle operation: SELECT from ai_summaries filtered by workshopId. Limit 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the AiSummary record, or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopId(
    workshopId: string
  ): Promise<Result<AiSummary | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.aiSummaries)
          .where(eq(this.schema.aiSummaries.workshopId, workshopId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates or updates an AI summary for a workshop using upsert.
   *
   * Business rules:
   * - If a summary already exists for this workshopId, its status is reset to QUEUED.
   * - If not, a new record is inserted with the given documentId.
   *
   * Drizzle operation: Query existing by workshopId, then UPDATE or INSERT.
   *
   * Side effects:
   * - Inserts a new row or updates the status of an existing row in ai_summaries.
   *
   * @param documentId - The UUID of the source document.
   * @param workshopId - The UUID of the associated workshop.
   * @returns OkResult containing the inserted or updated AiSummary record, or FailResult (INTERNAL_ERROR).
   */
  async upsert(
    documentId: string,
    workshopId: string
  ): Promise<Result<AiSummary>> {
    return tryCatch(
      async () => {
        const [existing] = await this.db
          .select()
          .from(this.schema.aiSummaries)
          .where(eq(this.schema.aiSummaries.workshopId, workshopId))
          .limit(1);

        if (existing) {
          const [result] = await this.db
            .update(this.schema.aiSummaries)
            .set({ status: "QUEUED" })
            .where(eq(this.schema.aiSummaries.summaryId, existing.summaryId))
            .returning();
          return result;
        }

        const [result] = await this.db
          .insert(this.schema.aiSummaries)
          .values({ documentId, workshopId, status: "QUEUED" })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates the processing status of an AI summary, optionally including the final summary text.
   *
   * Drizzle operation: UPDATE ai_summaries SET status, summaryText? WHERE summaryId.
   *
   * Side effects:
   * - Updates the status column and optionally the summary_text column on ai_summaries.
   *
   * @param id - The UUID of the summary record.
   * @param status - The new processing status (e.g. "DONE", "FAILED", "QUEUED").
   * @param summaryText - Optional final summary text to store when processing completes.
   * @returns OkResult containing the updated AiSummary record, or FailResult (INTERNAL_ERROR).
   */
  async updateStatus(
    id: string,
    status: SummaryStatus,
    summaryText?: string
  ): Promise<Result<AiSummary>> {
    return tryCatch(
      async () => {
        const updateData: Partial<NewAiSummary> = { status };
        if (summaryText !== undefined) {
          updateData.summaryText = summaryText;
        }
        const [result] = await this.db
          .update(this.schema.aiSummaries)
          .set(updateData)
          .where(eq(this.schema.aiSummaries.summaryId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new AI summary record with DONE status and text.
   *
   * Used for manual summary override when no existing summary record
   * is found for the workshop.
   *
   * Generates a UUID for documentId to satisfy FK constraint until
   * the DB migration makes it nullable.
   *
   * @param workshopId - The UUID of the workshop.
   * @param summaryText - The summary text to store.
   * @returns OkResult containing the created AiSummary record, or FailResult (INTERNAL_ERROR).
   */
  async createByWorkshopId(
    workshopId: string,
    summaryText: string
  ): Promise<Result<AiSummary>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.aiSummaries)
          .values({
            documentId: randomUUID(),
            workshopId,
            status: "DONE",
            summaryText,
            generatedAt: new Date(),
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds the AI summary associated with a document ID.
   *
   * Used internally by the pipeline to locate summary records
   * when processing callbacks arrive with documentId.
   *
   * @param documentId - The UUID of the document.
   * @returns OkResult containing the AiSummary record, or null, or FailResult (INTERNAL_ERROR).
   */
  async findByDocumentId(
    documentId: string
  ): Promise<Result<AiSummary | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.aiSummaries)
          .where(eq(this.schema.aiSummaries.documentId, documentId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
