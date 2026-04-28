/**
 * Ticket Response DTO
 *
 * Shape: { ticket_id, registration_id, qr_token, status, workshop, created_at }
 */

export interface TicketResponseDto {
  ticket_id: string;
  registration_id: string;
  qr_token: string;
  status: string;
  workshop: any; // TODO: WorkshopSummaryDto
  created_at: Date;
}

export class TicketResponseBuilder {
  static from(ticket: any, workshop?: any): TicketResponseDto {
    // TODO: Map to response shape
    return {
      ticket_id: '',
      registration_id: '',
      qr_token: '',
      status: '',
      workshop,
      created_at: new Date(),
    };
  }
}
