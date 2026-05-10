import { Injectable } from "@nestjs/common";

import { checkinErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import {
  CheckinResultBuilder,
  type CheckinResultDto,
} from "../dto/checkin-result.dto";
import {
  CheckinStatusBuilder,
  type CheckinStatusDto,
} from "../dto/checkin-status.dto";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { RegistrationsRepository } from "../repositories/registrations.repository";

@Injectable()
export class CheckinService {
  constructor(
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly checkinRecordsRepo: CheckinRecordsRepository
  ) {}

  /**
   * Validates a QR code and records an online check-in.
   *
   * Business rules:
   * - Registration must exist and belong to the given workshop.
   * - Registration status must be PAID or CONFIRMED.
   * - Workshop must not be CANCELLED.
   * - Duplicate scans are caught by UNIQUE(registration_id, workshop_id) constraint.
   *
   * Side effects:
   * - Inserts a record into `checkin_records` with source=ONLINE.
   *
   * @param qrCode - The scanned QR code (UUID v4).
   * @param workshopId - UUID of the workshop where the scan is occurring.
   * @param staffUserId - UUID of the CHECKIN_STAFF performing the scan.
   * @param checkedInAt - Timestamp of the scan from the device.
   * @returns OkResult with CheckinResultDto, or FailResult (QR_INVALID, REGISTRATION_NOT_ACTIVE,
   *   WORKSHOP_CANCELLED, WRONG_WORKSHOP, TICKET_ALREADY_CHECKEDIN).
   */
  async scanQR(
    qrCode: string,
    workshopId: string,
    staffUserId: string,
    checkedInAt: Date
  ): Promise<Result<CheckinResultDto>> {
    const regResult = await this.registrationsRepo.findByQRCode(qrCode);
    if (regResult.isFailure) return Result.fail(regResult.error);

    const registration = regResult.data;
    if (!registration) {
      return Result.fail(checkinErrors.qrInvalid(qrCode));
    }

    if (registration.workshop.status === "CANCELLED") {
      return Result.fail(
        checkinErrors.workshopCancelled(registration.workshopId)
      );
    }

    if (registration.workshopId !== workshopId) {
      return Result.fail(
        checkinErrors.wrongWorkshop(registration.registrationId, workshopId)
      );
    }

    if (registration.status !== "PAID" && registration.status !== "CONFIRMED") {
      return Result.fail(
        checkinErrors.registrationNotActive(registration.registrationId)
      );
    }

    // Validate client-provided timestamp
    const now = new Date();
    if (isNaN(checkedInAt.getTime()) || checkedInAt > now) {
      return Result.fail(checkinErrors.invalidTimestamp("checkedInAt"));
    }

    const checkinResult = await this.checkinRecordsRepo.create({
      registrationId: registration.registrationId,
      studentId: registration.studentId,
      workshopId,
      checkedInAt,
      checkedInBy: staffUserId,
      source: "ONLINE",
    });

    if (checkinResult.isFailure) return Result.fail(checkinResult.error);

    if (!checkinResult.data) {
      // Duplicate — fetch the original check-in record for the response
      const existingResult =
        await this.checkinRecordsRepo.findFirstByRegistrationId(
          registration.registrationId
        );

      if (existingResult.isFailure || !existingResult.data) {
        return Result.fail(
          checkinErrors.alreadyCheckedIn(
            registration.registrationId,
            workshopId
          )
        );
      }

      return Result.ok(
        CheckinResultBuilder.from({
          checkinId: existingResult.data.checkinId,
          registrationId: registration.registrationId,
          checkedInAt: checkedInAt,
          receivedAt: now,
          student: {
            studentCode: registration.student.studentId,
            fullName: registration.student.fullName,
          },
          duplicate: true,
          originallyCheckedInAt: existingResult.data.checkedInAt,
        })
      );
    }

    return Result.ok(
      CheckinResultBuilder.from({
        checkinId: checkinResult.data.checkinId,
        registrationId: registration.registrationId,
        checkedInAt: checkedInAt,
        receivedAt: now,
        student: {
          studentCode: registration.student.studentId,
          fullName: registration.student.fullName,
        },
        duplicate: false,
      })
    );
  }

  /**
   * Retrieves real-time check-in statistics and recent activity for a workshop.
   *
   * @param workshopId - UUID of the workshop to query.
   * @returns OkResult with CheckinStatusDto including counts and last 20 check-ins, or FailResult (INTERNAL_ERROR).
   */
  async getWorkshopCheckinStatus(
    workshopId: string
  ): Promise<Result<CheckinStatusDto>> {
    const [confirmedResult, checkedInResult, recentResult] = await Promise.all([
      this.checkinRecordsRepo.countConfirmedRegistrationsByWorkshopId(
        workshopId
      ),
      this.checkinRecordsRepo.countByWorkshopId(workshopId),
      this.checkinRecordsRepo.findByWorkshopId(workshopId, 20),
    ]);

    if (confirmedResult.isFailure) return Result.fail(confirmedResult.error);
    if (checkedInResult.isFailure) return Result.fail(checkedInResult.error);
    if (recentResult.isFailure) return Result.fail(recentResult.error);

    return Result.ok(
      CheckinStatusBuilder.from(
        confirmedResult.data,
        checkedInResult.data,
        recentResult.data
      )
    );
  }
}
