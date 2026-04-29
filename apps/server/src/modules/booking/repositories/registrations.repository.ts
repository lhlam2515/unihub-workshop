/**
 * Registrations Repository
 *
 * CRUD trên bảng registrations.
 * Methods:
 * - findByStudentAndWorkshop(studentId, workshopId) — kiểm tra UNIQUE
 * - create(data, tx?)
 * - updateStatus(id, status, tx?)
 * - findMyRegistrations(studentId, statusFilter?, pagination)
 * - cancelAllForWorkshop(workshopId, tx) — dùng khi cancel workshop
 */

import { Injectable, Inject } from "@nestjs/common";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";

@Injectable()
export class RegistrationsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findByStudentAndWorkshop(studentId, workshopId)
   * TODO: Implement
   */
  async findByStudentAndWorkshop(studentId: string, workshopId: string) {
    // TODO: Check UNIQUE constraint
  }

  /**
   * create(data, tx?)
   * TODO: Implement
   */
  async create(data: any, tx?: any) {
    // TODO: Implement
  }

  /**
   * updateStatus(id, status, tx?)
   * TODO: Implement
   */
  async updateStatus(id: string, status: string, tx?: any) {
    // TODO: Implement
  }

  /**
   * findMyRegistrations(studentId, statusFilter?, pagination?)
   * TODO: Implement
   */
  async findMyRegistrations(
    studentId: string,
    statusFilter?: string,
    pagination?: any
  ) {
    // TODO: Implement
  }

  /**
   * cancelAllForWorkshop(workshopId, tx)
   * TODO: Implement
   */
  async cancelAllForWorkshop(workshopId: string, tx: any) {
    // TODO: Implement
  }
}
