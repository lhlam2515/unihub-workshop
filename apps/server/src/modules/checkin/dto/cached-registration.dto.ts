export interface CachedRegistrationDto {
  registrationId: string;
  qrCode: string;
  workshopId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  registrationStatus: string;
  workshopStartsAt: Date;
  workshopTitle: string;
}

export class CachedRegistrationBuilder {
  static from(registration: {
    registrationId: string;
    qrCode: string;
    workshopId: string;
    studentId: string;
    student: { fullName: string; studentId: string };
    status: string;
    workshop: { startsAt: Date; title: string };
  }): CachedRegistrationDto {
    return {
      registrationId: registration.registrationId,
      qrCode: registration.qrCode,
      workshopId: registration.workshopId,
      studentId: registration.studentId,
      studentName: registration.student.fullName,
      studentCode: registration.student.studentId,
      registrationStatus: registration.status,
      workshopStartsAt: registration.workshop.startsAt,
      workshopTitle: registration.workshop.title,
    };
  }
}
