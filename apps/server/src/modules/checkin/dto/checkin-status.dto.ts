interface CheckinRecordInput {
  checkinId: string;
  checkedInAt: Date;
  source: string;
  student?: { fullName?: string; studentId?: string } | null;
}

export interface CheckinStatusDto {
  confirmedCount: number;
  checkedInCount: number;
  pendingCount: number;
  recentCheckins: Array<{
    checkinId: string;
    studentName: string;
    studentCode: string;
    checkedInAt: Date;
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
      confirmedCount: confirmedCount,
      checkedInCount: checkedInCount,
      pendingCount: confirmedCount - checkedInCount,
      recentCheckins: recentCheckins.map((r) => ({
        checkinId: r.checkinId,
        studentName: r.student?.fullName ?? "",
        studentCode: r.student?.studentId ?? "",
        checkedInAt: r.checkedInAt,
        source: r.source,
      })),
    };
  }
}
