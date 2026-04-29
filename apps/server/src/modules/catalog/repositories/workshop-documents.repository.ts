/**
 * Workshop Documents Repository
 *
 * Methods:
 * - findByWorkshopId(id)
 * - findById(id)
 * - create(data)
 * - updateStatus(id, status)
 * - delete(id)
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@database";
import { Injectable, Inject } from "@nestjs/common";

import type { DatabaseClient, DatabaseSchema } from "@database";

@Injectable()
export class WorkshopDocumentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async findByWorkshopId(id: string) {
    // TODO: Implement
  }

  async findById(id: string) {
    // TODO: Implement
  }

  async create(data: any) {
    // TODO: Implement
  }

  async updateStatus(id: string, status: string) {
    // TODO: Implement
  }

  async delete(id: string) {
    // TODO: Implement
  }
}
