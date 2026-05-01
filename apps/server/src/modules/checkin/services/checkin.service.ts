import { Injectable } from "@nestjs/common";

import { ticketErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import {
  CheckinStatusBuilder,
  type CheckinStatusDto,
} from "../dto/checkin-status.dto";
import { CheckinRecordsRepository } from "../repositories/checkin-records.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

@Injectable()
export class CheckinService {
  constructor(
    private readonly ticketsRepo: TicketsRepository,
    private readonly checkinRecordsRepo: CheckinRecordsRepository
  ) {}

  /**
   * Validates a QR token and records an online check-in.
   *
   * Business rules:
   * - Ticket must exist and belong to the given workshop.
   * - Ticket must be ACTIVE (not VOID).
   * - WorkshopScopeGuard on the controller enforces the staff's workshop assignment.
   * - Duplicate scans are caught by the UNIQUE(ticket_id, workshop_id) constraint and returned as TICKET_ALREADY_CHECKEDIN.
   *
   * Side effects:
   * - Inserts a record into `checkin_records` with source=ONLINE.
   *
   * @param qrToken - The scanned QR token value.
   * @param workshopId - UUID of the workshop where the scan is occurring.
   * @param staffUserId - UUID of the CHECKIN_STAFF performing the scan (from jwt.sub).
   * @param deviceId - Optional device identifier for audit tracking.
   * @returns OkResult with the created checkin record, or FailResult (TICKET_NOT_FOUND, TICKET_VOID, TICKET_ALREADY_CHECKEDIN, INTERNAL_ERROR).
   */
  async scanQR(
    qrToken: string,
    workshopId: string,
    staffUserId: string,
    deviceId?: string
  ): Promise<Result<{ checkinId: string; checkedInAt: Date }>> {
    const ticketResult = await this.ticketsRepo.findByQRToken(qrToken);
    if (ticketResult.isFailure) return Result.fail(ticketResult.error);

    if (!ticketResult.data) {
      return Result.fail(ticketErrors.notFound(qrToken));
    }

    const ticket = ticketResult.data;

    if (ticket.status === "VOID") {
      return Result.fail(ticketErrors.void(ticket.ticketId));
    }

    if (ticket.registration.workshopId !== workshopId) {
      return Result.fail(ticketErrors.notFound(qrToken));
    }

    const now = new Date();
    const checkinResult = await this.checkinRecordsRepo.create({
      registrationId: ticket.registrationId,
      ticketId: ticket.ticketId,
      studentId: ticket.registration.studentId,
      workshopId,
      checkedInAt: now,
      checkedInBy: staffUserId,
      source: "ONLINE",
      deviceId,
    });

    if (checkinResult.isFailure) return Result.fail(checkinResult.error);

    if (!checkinResult.data) {
      return Result.fail(
        ticketErrors.alreadyCheckedIn(ticket.ticketId, workshopId)
      );
    }

    return Result.ok({
      checkinId: checkinResult.data.checkinId,
      checkedInAt: checkinResult.data.checkedInAt,
    });
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
