import type { Registration } from "@/infra/database/types/transaction.types";

export interface NextStepInfo {
  action: string;
  endpoint: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

export interface RegistrationWorkshopDto {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  seatsTotal: number;
  seatsAvailable: number;
  price: number;
  currency: string;
  status: string;
  speaker: {
    id: string;
    fullName: string;
    title: string | null;
    avatarUrl: string | null;
  } | null;
  room: {
    id: string;
    name: string;
    building: string | null;
    floor: number | null;
    floorPlanUrl: string | null;
  } | null;
  isRegistered: boolean | null;
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
  workshop: RegistrationWorkshopDto;
}

export class RegistrationResponseBuilder {
  /**
   * Maps a Registration database entity to a client-safe RegistrationDto.
   *
   * Includes qrCode for confirmed/paid registrations and nextStep for pending payment.
   *
   * @param registration - The Registration row from the database.
   * @param options - Optional payment info and next step details.
   * @returns A clean RegistrationDto with no internal DB fields exposed.
   */
  static from(
    registration: Registration,
    options?: {
      nextStep?: NextStepInfo | null;
      workshop?: RegistrationWorkshopDto;
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
      workshop: options?.workshop ?? {
        id: "",
        title: "",
        startsAt: new Date(),
        endsAt: new Date(),
        seatsTotal: 0,
        seatsAvailable: 0,
        price: 0,
        currency: "VND",
        status: "",
        speaker: null,
        room: null,
        isRegistered: null,
      },
    };
  }
}

/**
 * Admin view of a registration — includes student info and check-in status.
 *
 * Matches OpenAPI RegistrationAdmin schema.
 */
export interface RegistrationAdminDto {
  id: string;
  workshopId: string;
  student: {
    studentId: string;
    fullName: string;
    email: string;
  };
  status: string;
  registeredAt: Date;
  checkedInAt: Date | null;
}

export class RegistrationAdminBuilder {
  static from(params: {
    registrationId: string;
    workshopId: string;
    studentId: string;
    status: string;
    registeredAt: Date;
    studentName: string;
    studentEmail: string;
    checkedInAt: Date | null;
  }): RegistrationAdminDto {
    return {
      id: params.registrationId,
      workshopId: params.workshopId,
      student: {
        studentId: params.studentId,
        fullName: params.studentName,
        email: params.studentEmail,
      },
      status: params.status,
      registeredAt: params.registeredAt,
      checkedInAt: params.checkedInAt,
    };
  }
}
