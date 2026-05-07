// Queue names & DI tokens
export {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
  ALL_QUEUES,
  DEFAULT_JOB_OPTIONS,
  MESSAGING_TOKEN,
  PER_QUEUE_OPTIONS,
} from "./messaging.constants";

// Event payload types
export type {
  NotificationJobData,
  AiSummaryJobData,
  StudentSyncJobData,
  PaymentEventData,
  RegistrationEventData,
  WorkshopCancelledEventData,
  WorkshopUpdatedEventData,
} from "./event-contracts";

// Messaging interfaces
export type {
  JobName,
  JobPayloadMap,
  ITypedMessageQueue,
  IJobHandler,
} from "./messaging.interfaces";

// Messaging errors
export { MessagingError, FatalJobError } from "./messaging.errors";

// Adapter
export { BullMQAdapter } from "./bullmq.adapter";

// Module
export { MessagingModule } from "./messaging.module";

// Publishers
export { NotificationPublisher } from "./notification-publisher";
