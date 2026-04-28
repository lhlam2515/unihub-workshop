/**
 * Checkin Service
 *
 * scanQR(qrToken, workshopId, staffUserId, deviceId): lookup ticket bằng
 * idx_tickets_qr_token, kiểm tra status, tạo checkin_records.
 *
 * getWorkshopCheckinStatus(workshopId): truy vấn thống kê +
 * danh sách 20 check-in gần nhất.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class CheckinService {
  constructor(private readonly ticketService: any) {}

  /**
   * scanQR(qrToken: string, workshopId: string, staffUserId: string, deviceId?: string)
   *
   * TODO: Process single QR scan
   * 1. Lookup ticket by qr_token
   * 2. Verify ticket status is ACTIVE
   * 3. Create checkin_records entry with source=ONLINE
   * 4. Update ticket status to CHECKED_IN
   * 5. Return ticket details or error
   */
  async scanQR(
    qrToken: string,
    workshopId: string,
    staffUserId: string,
    deviceId?: string
  ) {
    // TODO: Implement
  }

  /**
   * getWorkshopCheckinStatus(workshopId: string)
   *
   * TODO: Get workshop statistics
   * - Total confirmed registrations
   * - Total checked-in
   * - List of last 20 check-ins
   */
  async getWorkshopCheckinStatus(workshopId: string) {
    // TODO: Implement
  }
}
