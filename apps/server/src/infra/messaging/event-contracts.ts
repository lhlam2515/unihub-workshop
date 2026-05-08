/**
 * TypeScript interfaces for all cross-module BullMQ event payloads.
 *
 * Ensures type safety between job producers and consumers by defining
 * the exact shape of every message flowing through the shared queues.
 * Type union aliases are duplicated from database enums to respect the
 * shared→database architectural boundary, kept in sync by convention.
 */
export type NotificationType =
  | "REGISTRATION_CONFIRMED"
  | "REGISTRATION_CANCELLED"
  | "WORKSHOP_UPDATED"
  | "WORKSHOP_CANCELLED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_CONFIRMED_LATE"
  | "PAYMENT_FAILED_RECONCILED"
  | "CHECKIN_REMINDER";

export type NotificationChannel = "APP" | "EMAIL" | "TELEGRAM";

type PaymentGateway = "VNPAY" | "STRIPE" | "MOMO" | "MOCK";

type PaymentEventType = "payment.success" | "payment.failed";

export interface NotificationJobData {
  notificationId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  payload: Record<string, unknown>;
}

export interface AiSummaryJobData {
  documentId: string;
  workshopId: string;
  fileUrl: string;
}

export interface StudentSyncJobData {
  jobId: string;
  sourceFileName: string;
}

export interface PaymentEventData {
  paymentId: string;
  registrationId: string;
  studentId: string;
  workshopId: string;
  amount: number;
  gateway: PaymentGateway;
  eventType: PaymentEventType;
}

export interface RegistrationEventData {
  registrationId: string;
  studentId: string;
  workshopId: string;
  eventType: "registration.confirmed" | "registration.cancelled";
}

export interface WorkshopCancelledEventData {
  workshopId: string;
  title: string;
  cancelledAt: string;
}

export interface WorkshopUpdatedEventData {
  workshopId: string;
  changes: {
    roomChanged: boolean;
    scheduleChanged: boolean;
  };
}
