/**
 * Checkin Staff Assignment Service
 *
 * Quản lý phân công workshop cho nhân sự:
 * - assignWorkshops(userId, workshopIds)
 * - getAssignedWorkshops(userId)
 *
 * Lưu vào bảng assignment trong DB.
 * Đính kèm Eventual Consistency warning trong result.
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class CheckinStaffAssignmentService {
  constructor(
    private readonly assignmentRepo: any // TODO: Inject CheckinStaffAssignmentsRepository
  ) {}

  /**
   * assignWorkshops(userId: string, workshopIds: string[])
   *
   * TODO: Assign workshops to checkin staff
   * 1. Validate that user exists and role is CHECKIN_STAFF
   * 2. Upsert assignment record
   * 3. Return result with eventual consistency warning
   */
  async assignWorkshops(userId: string, workshopIds: string[]) {
    // TODO: Implement
  }

  /**
   * getAssignedWorkshops(userId: string)
   *
   * TODO: Get list of assigned workshops
   * - Query assignment record
   * - Return workshop IDs
   */
  async getAssignedWorkshops(userId: string) {
    // TODO: Implement
  }
}
