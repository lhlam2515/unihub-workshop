export interface CheckinResultDto {
  id: string;
  registrationId: string;
  checkedInAt: string;
  receivedAt: string;
  student?: { code: string; name: string } | null;
  duplicate: boolean;
  originallyCheckedInAt?: string | null;
}

export class CheckinResultBuilder {
  static from(params: {
    checkinId: string;
    registrationId: string;
    checkedInAt: Date;
    receivedAt: Date;
    student?: { studentCode: string; fullName: string } | null;
    duplicate: boolean;
    originallyCheckedInAt?: Date | null;
  }): CheckinResultDto {
    return {
      id: params.checkinId,
      registrationId: params.registrationId,
      checkedInAt: params.checkedInAt.toISOString(),
      receivedAt: params.receivedAt.toISOString(),
      student: params.student
        ? { code: params.student.studentCode, name: params.student.fullName }
        : null,
      duplicate: params.duplicate,
      originallyCheckedInAt:
        params.originallyCheckedInAt?.toISOString() ?? null,
    };
  }
}
