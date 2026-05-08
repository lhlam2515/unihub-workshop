ALTER TABLE "workshop_slots" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;