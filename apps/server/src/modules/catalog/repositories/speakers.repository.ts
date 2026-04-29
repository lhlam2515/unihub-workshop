/**
 * Speakers Repository
 *
 * Methods:
 * - findAll()
 * - findById(id)
 * - create(data)
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@database";
import { Injectable, Inject } from "@nestjs/common";

import type { DatabaseClient, DatabaseSchema } from "@database";

@Injectable()
export class SpeakersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async findAll() {
    // TODO: Implement
  }

  async findById(id: string) {
    // TODO: Implement
  }

  async create(data: any) {
    // TODO: Implement
  }
}
