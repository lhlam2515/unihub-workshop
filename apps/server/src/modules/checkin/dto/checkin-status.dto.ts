interface CheckinRecordInput {
  checkinId: string;
  checkedInAt: Date;
  source: string;
  student?: { fullName?: string; studentCode?: string } | null;
}

export interface CheckinStatusDto {
  confirmed_count: number;
  checked_in_count: number;
  pending_count: number;
  recent_checkins: Array<{
    checkin_id: string;
    student_name: string;
    student_code: string;
    checked_in_at: Date;
    source: string;
  }>;
}

export class CheckinStatusBuilder {
  /**
   * Builds a CheckinStatusDto from raw counts and recent check-in records.
   *
   * Transformation rules:
   * - pending_count is derived as confirmedCount - checkedInCount.
   * - student_name and student_code default to empty string if student relation is absent.
   * - recent_checkins is ordered by checked_in_at DESC (enforced at repository level).
   *
   * @param confirmedCount - Total confirmed registrations for the workshop.
   * @param checkedInCount - Total check-in records for the workshop.
   * @param recentCheckins - Up to 20 most recent check-in records with student details.
   * @returns CheckinStatusDto with counts and recent activity for the workshop dashboard.
   */
  static from(
    confirmedCount: number,
    checkedInCount: number,
    recentCheckins: CheckinRecordInput[]
  ): CheckinStatusDto {
    return {
      confirmed_count: confirmedCount,
      checked_in_count: checkedInCount,
      pending_count: confirmedCount - checkedInCount,
      recent_checkins: recentCheckins.map((r) => ({
        checkin_id: r.checkinId,
        student_name: r.student?.fullName ?? "",
        student_code: r.student?.studentCode ?? "",
        checked_in_at: r.checkedInAt,
        source: r.source,
      })),
    };
  }
}
