/**
 * Retrieves and persists AI-generated document summaries with upsert support.
 */
import { Injectable, Inject } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type {
  AiSummary,
  NewAiSummary,
} from "@/infra/database/types/async.types";
import type { AiSummaryStatus } from "@/infra/database/types/enums.types";
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
   * Retrieves the AI summary for a given document by document ID.
   *
   * Drizzle operation: SELECT from ai_summaries filtered by documentId. Limit 1.
   *
   * @param documentId - The UUID of the document.
   * @returns OkResult containing the AiSummary record, or null if not found, or FailResult (INTERNAL_ERROR).
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

  /**
   * Retrieves all AI summaries for a given workshop.
   *
   * Drizzle operation: SELECT from ai_summaries filtered by workshopId.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing an array of AiSummary records, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopId(workshopId: string): Promise<Result<AiSummary[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.aiSummaries)
          .where(eq(this.schema.aiSummaries.workshopId, workshopId))
          .orderBy(desc(this.schema.aiSummaries.createdAt)),
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates or replaces an AI summary for a document using upsert.
   *
   * Business rules:
   * - Enforced by a unique constraint on documentId: if a summary already exists,
   *   its status is reset to PENDING via ON CONFLICT DO UPDATE.
   *
   * Drizzle operation: INSERT INTO ai_summaries ... ON CONFLICT (documentId) DO UPDATE SET status = 'QUEUED'.
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
        const [result] = await this.db
          .insert(this.schema.aiSummaries)
          .values({ documentId, workshopId, status: "PENDING" })
          .onConflictDoUpdate({
            target: this.schema.aiSummaries.documentId,
            set: { status: "PENDING" },
          })
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
   * @param status - The new processing status (e.g. "DONE", "FAILED", "PENDING").
   * @param summaryText - Optional final summary text to store when processing completes.
   * @returns OkResult containing the updated AiSummary record, or FailResult (INTERNAL_ERROR).
   */
  async updateStatus(
    id: string,
    status: AiSummaryStatus,
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
}
