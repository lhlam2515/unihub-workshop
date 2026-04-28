/**
 * Registration Response DTOs
 *
 * RegistrationDto: fields cơ bản + payment_deadline? + amount?
 * RegistrationWithDetailsDto: extends với workshop, ticket?, payment?
 */

export interface RegistrationDto {
  registration_id: string;
  student_id: string;
  workshop_id: string;
  status: string;
  created_at: Date;
  payment_deadline?: Date;
  amount?: number;
}

export interface RegistrationWithDetailsDto extends RegistrationDto {
  workshop: any; // TODO: WorkshopSummaryDto
  ticket?: any; // TODO: TicketDto
  payment?: any; // TODO: PaymentDto
}

export class RegistrationResponseBuilder {
  static from(registration: any): RegistrationDto {
    // TODO: Implement factory
    return {
      registration_id: '',
      student_id: '',
      workshop_id: '',
      status: '',
      created_at: new Date(),
    };
  }

  static fromWithDetails(
    registration: any,
    workshop?: any,
    ticket?: any,
    payment?: any
  ): RegistrationWithDetailsDto {
    // TODO: Implement factory
    return {
      registration_id: '',
      student_id: '',
      workshop_id: '',
      status: '',
      created_at: new Date(),
      workshop,
      ticket,
      payment,
    };
  }
}
