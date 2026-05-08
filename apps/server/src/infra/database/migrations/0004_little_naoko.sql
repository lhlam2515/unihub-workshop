CREATE TYPE "public"."idempotency_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'UNRESOLVED');--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"device_token_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"platform" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_device_tokens_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"status" "idempotency_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"resource_type" varchar(20) NOT NULL,
	"response_body" jsonb,
	"status_code" smallint,
	"locked_until" timestamp with time zone DEFAULT NOW() + INTERVAL '30 seconds' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_device_tokens_student" ON "device_tokens" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_idempotency_stale" ON "idempotency_keys" USING btree ("status","locked_until");