import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { UsersRepository } from "../repositories/users.repository";

@Injectable()
export class CheckinStaffAssignmentService {
  constructor(
    private readonly assignmentRepo: CheckinStaffAssignmentsRepository,
    private readonly usersRepo: UsersRepository
  ) {}

  /**
   * Assigns a set of workshops to a check-in staff member.
   *
   * Business rules:
   * - Only users with role CHECKIN_STAFF can be assigned workshops.
   * - The assignment replaces any previous workshop list (not a merge).
   * - Changes take effect on the staff member's next login only (eventual consistency),
   *   because workshop IDs are embedded in the JWT at login time.
   *
   * Side effects: Upserts a row in the checkin_staff_assignments table.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   * @param workshopIds - Array of workshop UUIDs to assign.
   * @returns OkResult with the assignment details and an eventual consistency warning,
   *          or FailResult with USER_NOT_FOUND or VALIDATION_FAILED.
   */
  async assignWorkshops(
    userId: string,
    workshopIds: string[]
  ): Promise<
    Result<{ userId: string; workshopIds: string[]; warning: string }>
  > {
    const userResult = await this.usersRepo.findById(userId);
    if (userResult.isFailure) return Result.fail(userResult.error);
    if (!userResult.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `User ${userId} not found.`,
      });
    }

    const user = userResult.data;
    if (user.role !== "CHECKIN_STAFF") {
      return Result.fail({
        category: "VALIDATION" as const,
        code: "VALIDATION_FAILED" as const,
        message: "User is not a check-in staff member.",
      });
    }

    const upsertResult = await this.assignmentRepo.upsert(userId, workshopIds);
    if (upsertResult.isFailure) return Result.fail(upsertResult.error);

    return Result.ok({
      userId,
      workshopIds,
      warning:
        "Changes take effect on the staff member's next login (JWT is immutable). " +
        "The staff member needs to log out and log back in to receive updated permissions.",
    });
  }

  /**
   * Retrieves the list of workshop IDs currently assigned to a check-in staff member.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   * @returns OkResult with the workshop ID list matching the OpenAPI spec `{ workshopIds }`.
   */
  async getAssignedWorkshops(
    userId: string
  ): Promise<Result<{ workshopIds: string[] }>> {
    const result = await this.assignmentRepo.findByUserId(userId);
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      workshopIds: result.data?.workshopIds ?? [],
    });
  }
}
