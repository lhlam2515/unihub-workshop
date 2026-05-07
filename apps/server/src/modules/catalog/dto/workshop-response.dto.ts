import type { Workshop } from "@/infra/database/types/event-core.types";

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
  created_by: string;
  status: string;
}

export class WorkshopResponseBuilder {
  static fromSummary(
    workshop: Workshop,
    speakerName: string,
    availableSeats: number
  ): WorkshopSummaryDto {
    const priceNum = workshop.price ? Number(workshop.price) : 0;
    return {
      workshop_id: workshop.workshopId,
      title: workshop.title,
      speaker_name: speakerName,
      starts_at: workshop.startsAt,
      available_seats: availableSeats,
      is_paid: priceNum > 0,
      price: priceNum > 0 ? priceNum : undefined,
    };
  }

  static fromDetail(
    workshop: Workshop,
    speakerName: string,
    roomName: string,
    availableSeats: number
  ): WorkshopDetailDto {
    const summary = this.fromSummary(workshop, speakerName, availableSeats);
    return {
      ...summary,
      description: workshop.description ?? undefined,
      room_name: roomName,
      ends_at: workshop.endsAt,
    };
  }

  static fromAdminDetail(
    workshop: Workshop,
    speakerName: string,
    roomName: string,
    availableSeats: number
  ): WorkshopAdminDetailDto {
    const detail = this.fromDetail(
      workshop,
      speakerName,
      roomName,
      availableSeats
    );
    return {
      ...detail,
      created_by: workshop.createdBy,
      status: workshop.status,
    };
  }
}
