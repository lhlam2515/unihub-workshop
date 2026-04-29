/**
 * Checkin Staff Assignments Repository
 *
 * Quản lý bảng mapping checkin_staff_assignments
 * (bảng phụ cần tạo nếu chưa có - lưu user_id và workshop_ids[] dạng JSON hoặc bảng liên kết)
 *
 * Methods:
 * - findByUserId(userId)
 * - upsert(userId, workshopIds)
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@database";
import { Injectable, Inject } from "@nestjs/common";

import type { DatabaseClient, DatabaseSchema } from "@database";

@Injectable()
export class CheckinStaffAssignmentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findByUserId(userId: string): Promise<CheckinStaffAssignment | null>
   */
  async findByUserId(userId: string) {
    // TODO: Query assignment record WHERE user_id = ?
  }

  /**
   * upsert(userId: string, workshopIds: string[]): Promise<CheckinStaffAssignment>
   * Insert or update with ON CONFLICT DO UPDATE
   */
  async upsert(userId: string, workshopIds: string[]) {
    // TODO: INSERT ... ON CONFLICT DO UPDATE
    // Store workshopIds as JSON or in separate junction table
  }
}
