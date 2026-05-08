import type { Registration } from "@/infra/database/types/transaction.types";

export interface NextStepInfo {
  action: string;
  endpoint: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

export interface RegistrationDto {
  id: string;
  studentId: string;
  workshopId: string;
  status: string;
  qrCode: string | null;
  registeredAt: Date;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  nextStep?: NextStepInfo | null;
}

export class RegistrationResponseBuilder {
  /**
   * Maps a Registration database entity to a client-safe RegistrationDto.
   *
   * Includes qrCode for confirmed registrations and nextStep for pending payment.
   *
   * @param registration - The Registration row from the database.
   * @param options - Optional payment info and next step details.
   * @returns A clean RegistrationDto with no internal DB fields exposed.
   */
  static from(
    registration: Registration,
    options?: {
      nextStep?: NextStepInfo | null;
    }
  ): RegistrationDto {
    return {
      id: registration.registrationId,
      studentId: registration.studentId,
      workshopId: registration.workshopId,
      status: registration.status,
      qrCode:
        registration.status === "CONFIRMED" || registration.status === "PAID"
          ? registration.qrCode
          : null,
      registeredAt: registration.registeredAt,
      confirmedAt: registration.confirmedAt ?? null,
      cancelledAt: registration.cancelledAt ?? null,
      nextStep: options?.nextStep ?? null,
    };
  }
}
