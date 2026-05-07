export {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
  ALL_QUEUES,
  DEFAULT_JOB_OPTIONS,
} from "./queue.constants";

export type {
  NotificationJobData,
  AiSummaryJobData,
  StudentSyncJobData,
  PaymentEventData,
  WorkshopCancelledEventData,
  WorkshopUpdatedEventData,
} from "./event-contracts";

export { SharedQueueModule } from "./queue.module";
