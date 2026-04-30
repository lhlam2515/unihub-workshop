import type { Registration, Ticket } from "@/database/types/transaction.types";
import type { WorkshopSummaryDto } from "@/modules/catalog/dto/workshop-response.dto";

export interface PaymentDeadlineInfo {
  payment_deadline?: Date;
  amount?: number;
}

export interface RegistrationDto {
  registration_id: string;
  student_id: string;
  workshop_id: string;
  status: string;
  registered_at: Date;
  confirmed_at?: Date;
  cancelled_at?: Date;
  payment_deadline?: Date;
  amount?: number;
}

export interface TicketDto {
  ticket_id: string;
  qr_token: string;
  status: string;
  issued_at: Date;
}

export interface RegistrationWithDetailsDto extends RegistrationDto {
  workshop: WorkshopSummaryDto;
  ticket?: TicketDto;
  payment?: any;
}

export class RegistrationResponseBuilder {
  /**
   * Maps a Registration database entity to a client-safe RegistrationDto.
   *
   * Converts camelCase database columns to snake_case API response fields.
   * Optionally includes payment deadline and amount for paid workshop responses.
   *
   * @param registration - The Registration row from the database.
   * @param paymentInfo - Optional payment deadline and amount for PENDING_PAYMENT registrations.
   * @returns A clean RegistrationDto with no internal DB fields exposed.
   */
  static from(
    registration: Registration,
    paymentInfo?: PaymentDeadlineInfo
  ): RegistrationDto {
    return {
      registration_id: registration.registrationId,
      student_id: registration.studentId,
      workshop_id: registration.workshopId,
      status: registration.status,
      registered_at: registration.registeredAt,
      confirmed_at: registration.confirmedAt ?? undefined,
      cancelled_at: registration.cancelledAt ?? undefined,
      payment_deadline: paymentInfo?.payment_deadline,
      amount: paymentInfo?.amount,
    };
  }

  /**
   * Extends the base registration DTO with workshop, ticket, and payment details.
   *
   * Used for detailed views (single registration lookup) where related entity
   * data is needed alongside the core registration fields.
   *
   * @param registration - The Registration row from the database.
   * @param workshop - Workshop summary with title, dates, and room info.
   * @param ticket - Optional ticket entity for CONFIRMED registrations.
   * @param payment - Optional payment entity for paid registrations.
   * @param paymentInfo - Optional payment deadline and amount.
   * @returns A full RegistrationWithDetailsDto including workshop, ticket, and payment sub-objects.
   */
  static fromWithDetails(
    registration: Registration,
    workshop?: WorkshopSummaryDto,
    ticket?: Ticket,
    payment?: any,
    paymentInfo?: PaymentDeadlineInfo
  ): RegistrationWithDetailsDto {
    const base = this.from(registration, paymentInfo);

    let ticketDto: TicketDto | undefined;
    if (ticket) {
      ticketDto = {
        ticket_id: ticket.ticketId,
        qr_token: ticket.qrToken,
        status: ticket.status,
        issued_at: ticket.issuedAt,
      };
    }

    return {
      ...base,
      workshop: workshop!,
      ticket: ticketDto,
      payment,
    };
  }
}
