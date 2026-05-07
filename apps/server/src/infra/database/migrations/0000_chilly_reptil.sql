CREATE TYPE "public"."ai_summary_status" AS ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."checkin_source" AS ENUM('ONLINE', 'OFFLINE_SYNC');--> statement-breakpoint
CREATE TYPE "public"."document_upload_status" AS ENUM('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('APP', 'EMAIL', 'TELEGRAM');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('REGISTRATION_CONFIRMED', 'REGISTRATION_CANCELLED', 'WORKSHOP_UPDATED', 'WORKSHOP_CANCELLED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'CHECKIN_REMINDER');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('VNPAY', 'STRIPE', 'MOMO', 'MOCK');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'TIMEOUT');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'WAITLISTED');--> statement-breakpoint
CREATE TYPE "public"."sync_error_reason" AS ENUM('DUPLICATE', 'INVALID_FORMAT', 'MISSING_FIELD', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('ACTIVE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('STUDENT', 'ORGANIZER', 'CHECKIN_STAFF');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."workshop_status" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"summary_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"raw_text" text,
	"summary_text" text,
	"model_used" varchar(100),
	"status" "ai_summary_status" DEFAULT 'PENDING' NOT NULL,
	"generated_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_summary_document" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "notification_channel_configs" (
	"channel_config_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_type" "notification_channel" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_channel_config_type" UNIQUE("channel_type")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workshop_id" uuid,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_sync_errors" (
	"error_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" text NOT NULL,
	"error_reason" "sync_error_reason" NOT NULL,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_sync_jobs" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file_name" varchar(500) NOT NULL,
	"status" "sync_job_status" DEFAULT 'RUNNING' NOT NULL,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"completed_at" timestamp with time zone,
	"error_log_url" varchar(1000),
	CONSTRAINT "chk_sync_rows" CHECK (("student_sync_jobs"."processed_rows" IS NULL OR "student_sync_jobs"."processed_rows" >= 0) AND ("student_sync_jobs"."error_rows" IS NULL OR "student_sync_jobs"."error_rows" >= 0))
);
--> statement-breakpoint
CREATE TABLE "workshop_documents" (
	"document_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"file_url" varchar(1000) NOT NULL,
	"original_name" varchar(500),
	"file_size_bytes" bigint,
	"upload_status" "document_upload_status" DEFAULT 'UPLOADED' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"room_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"building" varchar(100),
	"floor" smallint,
	"capacity" smallint NOT NULL,
	"floor_plan_url" varchar(1000),
	"facilities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_rooms_capacity" CHECK ("rooms"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"speaker_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"title" varchar(255),
	"bio" text,
	"avatar_url" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_slots" (
	"slot_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"total_capacity" smallint NOT NULL,
	"locked_count" smallint DEFAULT 0 NOT NULL,
	"confirmed_count" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_workshop_slots_workshop" UNIQUE("workshop_id"),
	CONSTRAINT "chk_slot_capacity" CHECK ("workshop_slots"."total_capacity" > 0),
	CONSTRAINT "chk_slot_counts" CHECK ("workshop_slots"."locked_count" >= 0 AND "workshop_slots"."confirmed_count" >= 0 AND ("workshop_slots"."locked_count" + "workshop_slots"."confirmed_count") <= "workshop_slots"."total_capacity")
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"workshop_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"speaker_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" smallint NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"price" numeric(12, 2),
	"status" "workshop_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_workshops_time" CHECK ("workshops"."ends_at" > "workshops"."starts_at"),
	CONSTRAINT "chk_workshops_capacity" CHECK ("workshops"."capacity" > 0),
	CONSTRAINT "chk_workshops_price" CHECK (("workshops"."is_paid" = false AND "workshops"."price" IS NULL) OR ("workshops"."is_paid" = true AND "workshops"."price" > 0))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"student_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"student_code" varchar(20) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"faculty" varchar(100),
	"class_year" smallint,
	"email_edu" varchar(255),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_students_student_code" UNIQUE("student_code"),
	CONSTRAINT "uq_students_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_users_email" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "checkin_records" (
	"checkin_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone,
	"checked_in_by" uuid NOT NULL,
	"source" "checkin_source" DEFAULT 'ONLINE' NOT NULL,
	"device_id" varchar(100),
	CONSTRAINT "uq_checkin_ticket_workshop" UNIQUE("ticket_id","workshop_id")
);
--> statement-breakpoint
CREATE TABLE "offline_checkin_queue" (
	"local_id" uuid PRIMARY KEY NOT NULL,
	"qr_token" varchar(255) NOT NULL,
	"workshop_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"checked_in_by" uuid NOT NULL,
	"sync_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"synced_at" timestamp with time zone,
	"conflict_reason" text,
	CONSTRAINT "offline_checkin_queue_sync_status_check" CHECK ("offline_checkin_queue"."sync_status" IN ('PENDING', 'SYNCED', 'CONFLICT'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"payment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'VND' NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"gateway_txn_id" varchar(255),
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"timeout_at" timestamp with time zone,
	"raw_gateway_response" jsonb,
	CONSTRAINT "uq_payments_idempotency" UNIQUE("idempotency_key"),
	CONSTRAINT "chk_payments_amount" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"registration_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_registrations_student_workshop" UNIQUE("student_id","workshop_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"ticket_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"qr_token" varchar(255) NOT NULL,
	"status" "ticket_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "uq_tickets_registration" UNIQUE("registration_id"),
	CONSTRAINT "uq_tickets_qr_token" UNIQUE("qr_token"),
	CONSTRAINT "chk_tickets_void" CHECK (("tickets"."status" = 'ACTIVE' AND "tickets"."voided_at" IS NULL) OR ("tickets"."status" = 'VOID' AND "tickets"."voided_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_document_id_workshop_documents_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."workshop_documents"("document_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sync_errors" ADD CONSTRAINT "student_sync_errors_job_id_student_sync_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."student_sync_jobs"("job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_documents" ADD CONSTRAINT "workshop_documents_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_documents" ADD CONSTRAINT "workshop_documents_uploaded_by_users_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_slots" ADD CONSTRAINT "workshop_slots_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_speaker_id_speakers_speaker_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("speaker_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_room_id_rooms_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("room_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_registration_id_registrations_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("registration_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_ticket_id_tickets_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("ticket_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_checked_in_by_users_user_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_registrations_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("registration_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_workshop_id_workshops_workshop_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("workshop_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_registration_id_registrations_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("registration_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_summary_workshop_id" ON "ai_summaries" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "idx_summary_status" ON "ai_summaries" USING btree ("status") WHERE "ai_summaries"."status" IN ('PENDING', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "idx_notif_user_id" ON "notification_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notif_workshop_id" ON "notification_logs" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "idx_notif_status" ON "notification_logs" USING btree ("status") WHERE "notification_logs"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_sync_error_job_id" ON "student_sync_errors" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_sync_job_status" ON "student_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sync_job_triggered" ON "student_sync_jobs" USING btree ("triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_doc_workshop_id" ON "workshop_documents" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "idx_rooms_name" ON "rooms" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_workshops_status" ON "workshops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workshops_starts_at" ON "workshops" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_workshops_speaker_id" ON "workshops" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "idx_workshops_room_id" ON "workshops" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workshops_room_time_slot" ON "workshops" USING btree ("room_id","starts_at","ends_at") WHERE "workshops"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "idx_students_user_id" ON "students" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_students_student_code" ON "students" USING btree ("student_code");--> statement-breakpoint
CREATE INDEX "idx_students_email_edu" ON "students" USING btree ("email_edu");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_checkin_workshop_id" ON "checkin_records" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "idx_checkin_student_id" ON "checkin_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_checkin_source" ON "checkin_records" USING btree ("source") WHERE "checkin_records"."source" = 'OFFLINE_SYNC';--> statement-breakpoint
CREATE INDEX "idx_payments_registration_id" ON "payments" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "idx_payments_student_id" ON "payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payments_gateway" ON "payments" USING btree ("gateway");--> statement-breakpoint
CREATE INDEX "idx_payments_pending" ON "payments" USING btree ("initiated_at") WHERE "payments"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_registrations_student_id" ON "registrations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_workshop_id" ON "registrations" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_status" ON "registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_qr_token" ON "tickets" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "tickets" USING btree ("status");