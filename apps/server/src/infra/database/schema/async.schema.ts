import { sql } from "drizzle-orm";
import { check, index, pgTable, unique } from "drizzle-orm/pg-core";

import {
  aiSummaryStatusEnum,
  documentUploadStatusEnum,
  notificationChannelEnum,
  notificationStatusEnum,
  notificationTypeEnum,
  syncErrorReasonEnum,
  syncJobStatusEnum,
} from "./enums.schema";
import { workshops } from "./event-core.schema";
import { users } from "./identity.schema";

export const notificationChannelConfigs = pgTable(
  "notification_channel_configs",
  (t) => ({
    channelConfigId: t.uuid("channel_config_id").primaryKey().defaultRandom(),
    channelType: notificationChannelEnum("channel_type").notNull(),
    isActive: t.boolean("is_active").notNull().default(true),
    configJson: t
      .jsonb("config_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [unique("uq_channel_config_type").on(table.channelType)]
);

export const notificationLogs = pgTable(
  "notification_logs",
  (t) => ({
    notificationId: t.uuid("notification_id").primaryKey().defaultRandom(),
    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => users.userId),
    workshopId: t.uuid("workshop_id").references(() => workshops.workshopId, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationStatusEnum("status").notNull().default("SENT"),
    payload: t
      .jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sentAt: t.timestamp("sent_at", { withTimezone: true }),
    errorMessage: t.text("error_message"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    index("idx_notif_user_id").on(table.userId),
    index("idx_notif_workshop_id").on(table.workshopId),
    index("idx_notif_status")
      .on(table.status)
      .where(sql`${table.status} IN ('FAILED', 'TIMEOUT')`),
  ]
);

export const workshopDocuments = pgTable(
  "workshop_documents",
  (t) => ({
    documentId: t.uuid("document_id").primaryKey().defaultRandom(),
    workshopId: t
      .uuid("workshop_id")
      .notNull()
      .references(() => workshops.workshopId, { onDelete: "cascade" }),
    fileUrl: t.varchar("file_url", { length: 1000 }).notNull(),
    originalName: t.varchar("original_name", { length: 500 }),
    fileSizeBytes: t.bigint("file_size_bytes", { mode: "number" }),
    uploadStatus: documentUploadStatusEnum("upload_status")
      .notNull()
      .default("UPLOADED"),
    uploadedBy: t
      .uuid("uploaded_by")
      .notNull()
      .references(() => users.userId),
    uploadedAt: t
      .timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [index("idx_doc_workshop_id").on(table.workshopId)]
);

export const aiSummaries = pgTable(
  "ai_summaries",
  (t) => ({
    summaryId: t.uuid("summary_id").primaryKey().defaultRandom(),
    documentId: t
      .uuid("document_id")
      .notNull()
      .references(() => workshopDocuments.documentId, { onDelete: "cascade" }),
    workshopId: t
      .uuid("workshop_id")
      .notNull()
      .references(() => workshops.workshopId, { onDelete: "cascade" }),
    rawText: t.text("raw_text"),
    summaryText: t.text("summary_text"),
    modelUsed: t.varchar("model_used", { length: 100 }),
    status: aiSummaryStatusEnum("status").notNull().default("NONE"),
    generatedAt: t.timestamp("generated_at", { withTimezone: true }),
    errorMessage: t.text("error_message"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_summary_document").on(table.documentId),
    index("idx_summary_workshop_id").on(table.workshopId),
    index("idx_summary_status")
      .on(table.status)
      .where(sql`${table.status} IN ('QUEUED', 'PROCESSING')`),
  ]
);

export const studentSyncJobs = pgTable(
  "student_sync_jobs",
  (t) => ({
    jobId: t.uuid("job_id").primaryKey().defaultRandom(),
    triggeredAt: t
      .timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceFileName: t.varchar("source_file_name", { length: 500 }).notNull(),
    status: syncJobStatusEnum("status").notNull().default("RUNNING"),
    totalRows: t.integer("total_rows"),
    processedRows: t.integer("processed_rows").default(0),
    errorRows: t.integer("error_rows").default(0),
    completedAt: t.timestamp("completed_at", { withTimezone: true }),
    errorLogUrl: t.varchar("error_log_url", { length: 1000 }),
  }),
  (table) => [
    check(
      "chk_sync_rows",
      sql`(${table.processedRows} IS NULL OR ${table.processedRows} >= 0) AND (${table.errorRows} IS NULL OR ${table.errorRows} >= 0)`
    ),
    index("idx_sync_job_status").on(table.status),
    index("idx_sync_job_triggered").on(table.triggeredAt.desc()),
  ]
);

export const studentSyncErrors = pgTable(
  "student_sync_errors",
  (t) => ({
    errorId: t.uuid("error_id").primaryKey().defaultRandom(),
    jobId: t
      .uuid("job_id")
      .notNull()
      .references(() => studentSyncJobs.jobId, { onDelete: "cascade" }),
    rowNumber: t.integer("row_number").notNull(),
    rawData: t.text("raw_data").notNull(),
    errorReason: syncErrorReasonEnum("error_reason").notNull(),
    errorDetail: t.text("error_detail"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [index("idx_sync_error_job_id").on(table.jobId)]
);
