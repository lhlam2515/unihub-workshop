/**
 * AI Summaries Repository
 *
 * Methods:
 * - findByDocumentId(id)
 * - upsert(documentId, workshopId, data) — 1 document → 1 summary, use ON CONFLICT
 * - updateStatus(id, status, summaryText?)
 */

import { Injectable, Inject } from "@nestjs/common";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";

@Injectable()
export class AiSummariesRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async findByDocumentId(id: string) {
    // TODO: Implement
  }

  async upsert(documentId: string, workshopId: string, data: any) {
    // TODO: Implement — use ON CONFLICT DO UPDATE
  }

  async updateStatus(id: string, status: string, summaryText?: string) {
    // TODO: Implement
  }
}
