/**
 * Checkin Records Repository
 *
 * Methods:
 * - create(data) — insert checkin record
 * - findByWorkshopId(workshopId, limit) — get recent check-ins
 * - countByWorkshopId(workshopId)
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@database";
import { Injectable, Inject } from "@nestjs/common";

import type { DatabaseClient, DatabaseSchema } from "@database";

@Injectable()
export class CheckinRecordsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * create(data)
   * TODO: Implement
   */
  async create(data: any) {
    // TODO: Implement
  }

  /**
   * findByWorkshopId(workshopId, limit?)
   * TODO: Implement
   */
  async findByWorkshopId(workshopId: string, limit?: number) {
    // TODO: Implement
  }

  /**
   * countByWorkshopId(workshopId)
   * TODO: Implement
   */
  async countByWorkshopId(workshopId: string) {
    // TODO: Implement
  }
}
