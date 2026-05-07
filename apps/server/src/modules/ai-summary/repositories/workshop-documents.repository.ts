/**
 * Retrieves and persists workshop document records (file uploads).
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type {
  WorkshopDocument,
  NewWorkshopDocument,
} from "@/infra/database/types/async.types";
import type { DocumentUploadStatus } from "@/infra/database/types/enums.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class WorkshopDocumentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves all documents associated with a workshop.
   *
   * Drizzle operation: SELECT from workshop_documents filtered by workshopId.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing an array of WorkshopDocument records, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopId(
    workshopId: string
  ): Promise<Result<WorkshopDocument[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.workshopDocuments)
          .where(eq(this.schema.workshopDocuments.workshopId, workshopId)),
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves a single document by its unique identifier.
   *
   * Drizzle operation: SELECT from workshop_documents filtered by documentId. Limit 1.
   *
   * @param id - The UUID of the document to look up.
   * @returns OkResult containing the WorkshopDocument record (with fileUrl, originalName, uploadStatus), or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findById(id: string): Promise<Result<WorkshopDocument | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.workshopDocuments)
          .where(eq(this.schema.workshopDocuments.documentId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Inserts a new workshop document record into the database.
   *
   * Side effects:
   * - Executes INSERT on the workshop_documents table.
   *
   * @param data - The document attributes to insert (workshopId, fileUrl, originalName, fileSizeBytes, uploadStatus, uploadedBy).
   * @returns OkResult containing the newly created WorkshopDocument record, or FailResult (INTERNAL_ERROR).
   */
  async create(data: NewWorkshopDocument): Promise<Result<WorkshopDocument>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.workshopDocuments)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates the upload status of a workshop document.
   *
   * Drizzle operation: UPDATE workshop_documents SET uploadStatus WHERE documentId.
   *
   * Side effects:
   * - Updates the upload_status column on the workshop_documents table.
   *
   * @param id - The UUID of the document.
   * @param status - The new upload status value (e.g. "UPLOADED", "PROCESSING", "FAILED").
   * @returns OkResult containing the updated WorkshopDocument record, or FailResult (INTERNAL_ERROR).
   */
  async updateStatus(
    id: string,
    status: DocumentUploadStatus
  ): Promise<Result<WorkshopDocument>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshopDocuments)
          .set({ uploadStatus: status })
          .where(eq(this.schema.workshopDocuments.documentId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Deletes a workshop document record by its unique identifier.
   *
   * Drizzle operation: DELETE from workshop_documents WHERE documentId. Returns the deleted record.
   *
   * Side effects:
   * - Removes a row from the workshop_documents table.
   * - Cascading delete removes the associated ai_summaries record.
   *
   * @param id - The UUID of the document to delete.
   * @returns OkResult containing the deleted WorkshopDocument record, or FailResult (INTERNAL_ERROR).
   */
  async delete(id: string): Promise<Result<WorkshopDocument>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .delete(this.schema.workshopDocuments)
          .where(eq(this.schema.workshopDocuments.documentId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
