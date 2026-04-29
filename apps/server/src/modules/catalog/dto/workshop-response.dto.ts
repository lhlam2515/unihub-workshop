/**
 * Workshop Response DTOs
 *
 * Three shapes for three contexts:
 * - WorkshopSummaryDto: public list
 * - WorkshopDetailDto: public detail
 * - WorkshopAdminDetailDto: admin detail (with confirmed_count, locked_count, created_by)
 *
 * Each class has static from() factory
 */

export interface WorkshopSummaryDto {
  workshop_id: string;
  title: string;
  speaker_name: string;
  starts_at: Date;
  available_seats: number;
  is_paid: boolean;
  price?: number;
}

export interface WorkshopDetailDto extends WorkshopSummaryDto {
  description?: string;
  room_name: string;
  ends_at: Date;
}

export interface WorkshopAdminDetailDto extends WorkshopDetailDto {
  confirmed_count: number;
  locked_count: number;
  created_by: string;
  status: string;
}

export class WorkshopResponseBuilder {
  static fromSummary(workshop: any): WorkshopSummaryDto {
    // TODO: Map to summary shape
    return {
      workshop_id: "",
      title: "",
      speaker_name: "",
      starts_at: new Date(),
      available_seats: 0,
      is_paid: false,
    };
  }

  static fromDetail(workshop: any): WorkshopDetailDto {
    // TODO: Map to detail shape
    return {
      workshop_id: "",
      title: "",
      speaker_name: "",
      starts_at: new Date(),
      available_seats: 0,
      is_paid: false,
      room_name: "",
      ends_at: new Date(),
    };
  }

  static fromAdminDetail(workshop: any): WorkshopAdminDetailDto {
    // TODO: Map to admin detail shape
    return {
      workshop_id: "",
      title: "",
      speaker_name: "",
      starts_at: new Date(),
      available_seats: 0,
      is_paid: false,
      room_name: "",
      ends_at: new Date(),
      confirmed_count: 0,
      locked_count: 0,
      created_by: "",
      status: "",
    };
  }
}
