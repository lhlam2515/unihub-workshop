/**
 * Workshops Repository
 *
 * CRUD + queries trên bảng workshops.
 * Methods:
 * - findPublished(filters)
 * - findById(id)
 * - findByIdAndStatus(id, status)
 * - create(data)
 * - update(id, data)
 * - updateStatus(id, status)
 *
 * Indexes:
 * - idx_workshops_status
 * - idx_workshops_starts_at
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from '@database';
import { Injectable, Inject } from '@nestjs/common';

import type { DatabaseClient, DatabaseSchema } from '@database';

@Injectable()
export class WorkshopsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findPublished(filters?)
   * TODO: Implement
   */
  async findPublished(filters?: any) {
    // TODO: Query WHERE status = 'PUBLISHED'
  }

  /**
   * findById(id)
   * TODO: Implement
   */
  async findById(id: string) {
    // TODO: Implement
  }

  /**
   * findByIdAndStatus(id, status)
   * TODO: Implement
   */
  async findByIdAndStatus(id: string, status: string) {
    // TODO: Implement
  }

  /**
   * create(data)
   * TODO: Implement
   */
  async create(data: any) {
    // TODO: Implement
  }

  /**
   * update(id, data)
   * TODO: Implement
   */
  async update(id: string, data: any) {
    // TODO: Implement
  }

  /**
   * updateStatus(id, status)
   * TODO: Implement
   */
  async updateStatus(id: string, status: string) {
    // TODO: Implement
  }
}
