import type { Workshop } from "@/infra/database/types/event-core.types";

export interface WorkshopSummaryDto {
  workshopId: string;
  title: string;
  speakerName: string;
  startsAt: Date;
  availableSeats: number;
  isPaid: boolean;
  price?: number;
}

export interface WorkshopDetailDto extends WorkshopSummaryDto {
  description?: string;
  roomName: string;
  endsAt: Date;
}

export interface WorkshopAdminDetailDto extends WorkshopDetailDto {
  createdBy: string;
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
      workshopId: workshop.workshopId,
      title: workshop.title,
      speakerName: speakerName,
      startsAt: workshop.startsAt,
      availableSeats: availableSeats,
      isPaid: priceNum > 0,
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
      roomName: roomName,
      endsAt: workshop.endsAt,
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
      createdBy: workshop.createdBy,
      status: workshop.status,
    };
  }
}
