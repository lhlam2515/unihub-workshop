import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "STUDENT",
  "BTC",
  "CHECKIN_STAFF",
]);

export const staffRoleEnum = pgEnum("staff_role", ["BTC", "CHECKIN_STAFF"]);

export const platformEnum = pgEnum("platform", ["IOS", "ANDROID"]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "PENDING_VERIFICATION",
]);

export const workshopStatusEnum = pgEnum("workshop_status", [
  "DRAFT",
  "OPEN",
  "CANCELLED",
  "COMPLETED",
]);

export const registrationStatusEnum = pgEnum("registration_status", [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "CANCELLED",
]);

export const ticketStatusEnum = pgEnum("ticket_status", ["ACTIVE", "VOID"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "INITIATED",
  "SUCCEEDED",
  "FAILED",
  "UNRESOLVED",
]);

export const paymentGatewayEnum = pgEnum("payment_gateway", [
  "VNPAY",
  "STRIPE",
  "MOMO",
  "MOCK",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "REGISTRATION_CONFIRMED",
  "REGISTRATION_CANCELLED",
  "WORKSHOP_UPDATED",
  "WORKSHOP_CANCELLED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "CHECKIN_REMINDER",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "APP",
  "EMAIL",
  "TELEGRAM",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "PENDING",
  "SENT",
  "FAILED",
  "TIMEOUT",
]);

export const checkinSourceEnum = pgEnum("checkin_source", [
  "ONLINE",
  "OFFLINE_SYNC",
]);

export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "RUNNING",
  "SUCCESS",
  "PARTIAL_FAILURE",
  "FAILED",
]);

export const syncErrorReasonEnum = pgEnum("sync_error_reason", [
  "DUPLICATE",
  "INVALID_FORMAT",
  "MISSING_FIELD",
  "UNKNOWN",
]);

export const aiSummaryStatusEnum = pgEnum("ai_summary_status", [
  "NONE",
  "QUEUED",
  "PROCESSING",
  "DONE",
  "FAILED",
]);

export const documentUploadStatusEnum = pgEnum("document_upload_status", [
  "UPLOADED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
]);
