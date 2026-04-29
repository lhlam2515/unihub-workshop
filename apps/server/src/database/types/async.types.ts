import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

import {
  aiSummaries,
  notificationChannelConfigs,
  notificationLogs,
  studentSyncErrors,
  studentSyncJobs,
  workshopDocuments,
} from "@/database/schema";

export const notificationChannelConfigsSelectSchema = createSelectSchema(
  notificationChannelConfigs
);
export const notificationChannelConfigsInsertSchema = createInsertSchema(
  notificationChannelConfigs
);
export const notificationChannelConfigsUpdateSchema = createUpdateSchema(
  notificationChannelConfigs
);

export type NotificationChannelConfig = z.infer<
  typeof notificationChannelConfigsSelectSchema
>;
export type NewNotificationChannelConfig = z.infer<
  typeof notificationChannelConfigsInsertSchema
>;
export type NotificationChannelConfigUpdate = z.infer<
  typeof notificationChannelConfigsUpdateSchema
>;

export const notificationLogsSelectSchema =
  createSelectSchema(notificationLogs);
export const notificationLogsInsertSchema =
  createInsertSchema(notificationLogs);
export const notificationLogsUpdateSchema =
  createUpdateSchema(notificationLogs);

export type NotificationLog = z.infer<typeof notificationLogsSelectSchema>;
export type NewNotificationLog = z.infer<typeof notificationLogsInsertSchema>;
export type NotificationLogUpdate = z.infer<
  typeof notificationLogsUpdateSchema
>;

export const workshopDocumentsSelectSchema =
  createSelectSchema(workshopDocuments);
export const workshopDocumentsInsertSchema =
  createInsertSchema(workshopDocuments);
export const workshopDocumentsUpdateSchema =
  createUpdateSchema(workshopDocuments);

export type WorkshopDocument = z.infer<typeof workshopDocumentsSelectSchema>;
export type NewWorkshopDocument = z.infer<typeof workshopDocumentsInsertSchema>;
export type WorkshopDocumentUpdate = z.infer<
  typeof workshopDocumentsUpdateSchema
>;

export const aiSummariesSelectSchema = createSelectSchema(aiSummaries);
export const aiSummariesInsertSchema = createInsertSchema(aiSummaries);
export const aiSummariesUpdateSchema = createUpdateSchema(aiSummaries);

export type AiSummary = z.infer<typeof aiSummariesSelectSchema>;
export type NewAiSummary = z.infer<typeof aiSummariesInsertSchema>;
export type AiSummaryUpdate = z.infer<typeof aiSummariesUpdateSchema>;

export const studentSyncJobsSelectSchema = createSelectSchema(studentSyncJobs);
export const studentSyncJobsInsertSchema = createInsertSchema(studentSyncJobs);
export const studentSyncJobsUpdateSchema = createUpdateSchema(studentSyncJobs);

export type StudentSyncJob = z.infer<typeof studentSyncJobsSelectSchema>;
export type NewStudentSyncJob = z.infer<typeof studentSyncJobsInsertSchema>;
export type StudentSyncJobUpdate = z.infer<typeof studentSyncJobsUpdateSchema>;

export const studentSyncErrorsSelectSchema =
  createSelectSchema(studentSyncErrors);
export const studentSyncErrorsInsertSchema =
  createInsertSchema(studentSyncErrors);
export const studentSyncErrorsUpdateSchema =
  createUpdateSchema(studentSyncErrors);

export type StudentSyncError = z.infer<typeof studentSyncErrorsSelectSchema>;
export type NewStudentSyncError = z.infer<typeof studentSyncErrorsInsertSchema>;
export type StudentSyncErrorUpdate = z.infer<
  typeof studentSyncErrorsUpdateSchema
>;
