import { Injectable } from '@nestjs/common';

import { NotificationDispatchService } from '../services/notification-dispatch.service';

/**
 * NotificationWorker
 *
 * Queue consumer for notification delivery.
 * Listens to 'notification' queue and processes each job.
 *
 * Job format:
 * {
 *   notification_id: string,
 *   type: 'REGISTRATION_CONFIRMED' | 'PAYMENT_SUCCESS' | 'WORKSHOP_CANCELLED',
 *   retry_count?: number,
 *   max_retries?: number (default: 5)
 * }
 *
 * Handler method:
 * - process(job) → Process notification delivery with retry logic
 *
 * TODO: Implement queue listener and retry logic
 */
@Injectable()
export class NotificationWorker {
  constructor(private readonly dispatchService: NotificationDispatchService) {}

  // TODO: Implement queue listener setup
  // Use @Processor('notification') if using Bull/BullMQ
  // Or EventEmitter2 listener if using event-based approach

  // TODO: Implement process method
  // @Process() — for Bull/BullMQ
  async process(job: any): Promise<any> {
    // 1. Extract notificationId from job.data
    // 2. Read retry_count (start at 0)
    // 3. Call dispatchService.dispatch(notificationId)
    //
    // 4. Handle response:
    //    a) If success: Job complete, return result
    //
    //    b) If failure:
    //       - Increment retry_count
    //       - If retry_count < max_retries:
    //         * Re-queue with exponential backoff:
    //           - Attempt 1: 5s delay
    //           - Attempt 2: 10s delay
    //           - Attempt 3: 20s delay
    //           - etc.
    //       - Else: Move to failed queue, log error
    //
    // 5. Update notification_logs in database with attempt count
  }

  // TODO: Implement exponential backoff calculation
  private calculateBackoffDelay(retryCount: number): number {
    // Base delay: 5s
    // Formula: base * 2^(retryCount - 1)
    // Example: 5s, 10s, 20s, 40s, 80s
    // Max cap: 300s (5 minutes)
    return Math.min(5000 * Math.pow(2, retryCount - 1), 300000);
  }
}
