export type {
  NotificationJobData,
  AiSummaryJobData,
  StudentSyncJobData,
  PaymentEventData,
  WorkshopCancelledEventData,
  WorkshopUpdatedEventData,
} from "./event-contracts";

export {
  MESSAGING_TOKEN,
  QUEUE_NAME_TOKEN,
  JOB_OPTIONS,
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
  ALL_QUEUES,
  DEFAULT_JOB_OPTIONS,
} from "./messaging.constants";

export type { JobName, JobPayloadMap } from "./messaging.interfaces";
export type {
  IMessageQueue,
  ITypedMessageQueue,
  IJobHandler,
} from "./messaging.interfaces";

export { MessagingError, FatalJobError } from "./messaging.errors";
export { BullMQAdapter } from "./bullmq.adapter";
export { WorkerHost, type HandlerRegistration } from "./worker.host";
export { MessagingModule } from "./messaging.module";
