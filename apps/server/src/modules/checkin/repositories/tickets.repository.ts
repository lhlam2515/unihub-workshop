/**
 * Tickets Repository
 *
 * Methods cần implement:
 * - findByQRToken(qrToken)
 * - findById(id)
 * - findByStudentIdAndStatus(studentId, status)
 * - findByWorkshopIdAndStatus(workshopId, status)
 * - create(data)
 * - updateStatus(id, status)
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from '@database';
import { Injectable, Inject } from '@nestjs/common';

import type { DatabaseClient, DatabaseSchema } from '@database';

@Injectable()
export class TicketsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findByQRToken(qrToken) — index: idx_tickets_qr_token
   * TODO: Implement
   */
  async findByQRToken(qrToken: string) {
    // TODO: Implement
  }

  /**
   * findById(id)
   * TODO: Implement
   */
  async findById(id: string) {
    // TODO: Implement
  }

  /**
   * findByStudentIdAndStatus(studentId, status)
   * TODO: Implement
   */
  async findByStudentIdAndStatus(studentId: string, status: string) {
    // TODO: Implement
  }

  /**
   * findByWorkshopIdAndStatus(workshopId, status)
   * TODO: Implement
   */
  async findByWorkshopIdAndStatus(workshopId: string, status: string) {
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
   * updateStatus(id, status)
   * TODO: Implement
   */
  async updateStatus(id: string, status: string) {
    // TODO: Implement
  }
}
