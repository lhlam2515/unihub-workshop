/**
 * Checkin Status Response DTO
 *
 * Shape: { confirmed_count, checked_in_count, pending_count, recent_checkins: [] }
 */

export interface CheckinStatusDto {
  confirmed_count: number;
  checked_in_count: number;
  pending_count: number;
  recent_checkins: Array<{
    ticket_id: string;
    student_name: string;
    checked_in_at: Date;
  }>;
}

export class CheckinStatusBuilder {
  static from(workshopStats: any, recentCheckins: any[]): CheckinStatusDto {
    // TODO: Map to response shape
    return {
      confirmed_count: 0,
      checked_in_count: 0,
      pending_count: 0,
      recent_checkins: [],
    };
  }
}
