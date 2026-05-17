import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { StaffRepository } from "../repositories/staff.repository";

@Injectable()
export class CheckinStaffAssignmentService {
  constructor(
    private readonly assignmentRepo: CheckinStaffAssignmentsRepository,
    private readonly staffRepo: StaffRepository
  ) {}

  /**
   * Assigns a set of workshops to a check-in staff member.
   *
   * Business rules:
   * - Only staff with role CHECKIN_STAFF can be assigned workshops.
   * - The assignment replaces any previous workshop list (not a merge).
   * - Changes take effect on the staff member's next login only (eventual consistency),
   *   because workshop IDs are embedded in the JWT at login time.
   *
   * Side effects: Upserts a row in the checkin_staff_assignments table.
   *
   * @param staffId - The CHECKIN_STAFF UUID.
   * @param workshopIds - Array of workshop UUIDs to assign.
   * @returns OkResult with the assignment details and an eventual consistency warning,
   *          or FailResult with STAFF_NOT_FOUND or VALIDATION_FAILED.
   */
  async assignWorkshops(
    staffId: string,
    workshopIds: string[]
  ): Promise<
    Result<{ staffId: string; workshopIds: string[]; warning: string }>
  > {
    const staffResult = await this.staffRepo.findById(staffId);
    if (staffResult.isFailure) return Result.fail(staffResult.error);
    if (!staffResult.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `Staff ${staffId} not found.`,
      });
    }

    const staff = staffResult.data;
    if (staff.role !== "CHECKIN_STAFF") {
      return Result.fail({
        category: "VALIDATION" as const,
        code: "VALIDATION_FAILED" as const,
        message: "Staff member is not a check-in staff.",
      });
    }

    const upsertResult = await this.assignmentRepo.upsert(staffId, workshopIds);
    if (upsertResult.isFailure) return Result.fail(upsertResult.error);

    return Result.ok({
      staffId,
      workshopIds,
      warning:
        "Changes take effect on the staff member's next login (JWT is immutable). " +
        "The staff member needs to log out and log back in to receive updated permissions.",
    });
  }

  /**
   * Retrieves the list of workshop IDs currently assigned to a check-in staff member.
   *
   * @param staffId - The CHECKIN_STAFF UUID.
   * @returns OkResult with the workshop ID list matching the OpenAPI spec `{ workshopIds }`.
   */
  async getAssignedWorkshops(
    staffId: string
  ): Promise<Result<{ workshopIds: string[] }>> {
    const result = await this.assignmentRepo.findByStaffId(staffId);
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      workshopIds: result.data?.workshopIds ?? [],
    });
  }
}
