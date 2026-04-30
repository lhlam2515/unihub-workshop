CREATE TABLE "checkin_staff_assignments" (
	"assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workshop_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_checkin_staff_assignments_user" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "checkin_staff_assignments" ADD CONSTRAINT "checkin_staff_assignments_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_checkin_staff_assignments_user" ON "checkin_staff_assignments" USING btree ("user_id");