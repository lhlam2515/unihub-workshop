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

/** Matches OpenAPI Registration schema (detail / create response). */
export interface RegistrationDto {
  id: string;
  workshopId: string;
  status: string;
  qrCode: string | null;
  registeredAt: Date;
  nextStep?: NextStepInfo | null;
}

/** Matches OpenAPI RegistrationListItem — extends Registration with nested workshop. */
export interface RegistrationListItemDto extends RegistrationDto {
  workshop: RegistrationWorkshopDto;
}

export class RegistrationResponseBuilder {
  /**
   * Maps a Registration database entity to a RegistrationListItemDto.
   *
   * Strips internal DB fields (studentId, confirmedAt, cancelledAt) not exposed
   * in the OpenAPI Registration / RegistrationListItem schemas.
   * Includes qrCode only when status ∈ {CONFIRMED, PAID}.
   *
   * @param registration - The Registration row from the database.
   * @param options - Optional nextStep for paid-pending flow and nested workshop data.
   * @returns RegistrationListItemDto safe for API responses.
   */
  static from(
    registration: Registration,
    options?: {
      nextStep?: NextStepInfo | null;
      workshop?: RegistrationWorkshopDto;
    }
  ): RegistrationListItemDto {
    return {
      id: registration.registrationId,
      workshopId: registration.workshopId,
      status: registration.status,
      qrCode:
        registration.status === "CONFIRMED" || registration.status === "PAID"
          ? registration.qrCode
          : null,
      registeredAt: registration.registeredAt,
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
