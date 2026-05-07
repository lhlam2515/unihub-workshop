import { z } from "zod";

import {
  aiSummaryStatusEnum,
  checkinSourceEnum,
  documentUploadStatusEnum,
  notificationChannelEnum,
  notificationStatusEnum,
  notificationTypeEnum,
  paymentGatewayEnum,
  paymentStatusEnum,
  registrationStatusEnum,
  syncErrorReasonEnum,
  syncJobStatusEnum,
  ticketStatusEnum,
  userRoleEnum,
  userStatusEnum,
  workshopStatusEnum,
} from "@/infra/database/schema";

export const userRoleSchema = z.enum(userRoleEnum.enumValues);
export const userStatusSchema = z.enum(userStatusEnum.enumValues);
export const workshopStatusSchema = z.enum(workshopStatusEnum.enumValues);
export const registrationStatusSchema = z.enum(
  registrationStatusEnum.enumValues
);
export const ticketStatusSchema = z.enum(ticketStatusEnum.enumValues);
export const paymentStatusSchema = z.enum(paymentStatusEnum.enumValues);
export const paymentGatewaySchema = z.enum(paymentGatewayEnum.enumValues);
export const notificationTypeSchema = z.enum(notificationTypeEnum.enumValues);
export const notificationChannelSchema = z.enum(
  notificationChannelEnum.enumValues
);
export const notificationStatusSchema = z.enum(
  notificationStatusEnum.enumValues
);
export const checkinSourceSchema = z.enum(checkinSourceEnum.enumValues);
export const syncJobStatusSchema = z.enum(syncJobStatusEnum.enumValues);
export const syncErrorReasonSchema = z.enum(syncErrorReasonEnum.enumValues);
export const aiSummaryStatusSchema = z.enum(aiSummaryStatusEnum.enumValues);
export const documentUploadStatusSchema = z.enum(
  documentUploadStatusEnum.enumValues
);

export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type WorkshopStatus = z.infer<typeof workshopStatusSchema>;
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentGateway = z.infer<typeof paymentGatewaySchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type CheckinSource = z.infer<typeof checkinSourceSchema>;
export type SyncJobStatus = z.infer<typeof syncJobStatusSchema>;
export type SyncErrorReason = z.infer<typeof syncErrorReasonSchema>;
export type AiSummaryStatus = z.infer<typeof aiSummaryStatusSchema>;
export type DocumentUploadStatus = z.infer<typeof documentUploadStatusSchema>;
