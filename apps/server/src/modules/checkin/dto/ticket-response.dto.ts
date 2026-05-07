interface TicketInput {
  ticketId: string;
  registrationId: string;
  qrToken: string;
  status: string;
  issuedAt: Date;
  registration: {
    workshopId: string;
    workshop: {
      workshopId: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
    };
    student: { studentId: string; fullName: string; email?: string | null };
  };
}

export interface TicketResponseDto {
  ticket_id: string;
  registration_id: string;
  qr_token: string;
  status: string;
  workshop: {
    workshop_id: string;
    title: string;
    starts_at: Date;
    ends_at: Date;
  };
  student: {
    student_id: string;
    full_name: string;
  };
  issued_at: Date;
}

export class TicketResponseBuilder {
  /**
   * Builds a TicketResponseDto from a ticket domain entity with joined relations.
   *
   * Transformation rules:
   * - Flattens camelCase DB fields to snake_case response shape.
   * - Embeds workshop and student as nested objects (strips internal IDs from student).
   * - Strips raw registration fields — only registration_id is exposed.
   *
   * @param ticket - Ticket entity with registration, workshop, and student relations.
   * @returns Serializable TicketResponseDto safe for client consumption.
   */
  static from(ticket: TicketInput): TicketResponseDto {
    return {
      ticket_id: ticket.ticketId,
      registration_id: ticket.registrationId,
      qr_token: ticket.qrToken,
      status: ticket.status,
      workshop: {
        workshop_id: ticket.registration.workshop.workshopId,
        title: ticket.registration.workshop.title,
        starts_at: ticket.registration.workshop.startsAt,
        ends_at: ticket.registration.workshop.endsAt,
      },
      student: {
        student_id: ticket.registration.student.studentId,
        full_name: ticket.registration.student.fullName,
      },
      issued_at: ticket.issuedAt,
    };
  }
}
