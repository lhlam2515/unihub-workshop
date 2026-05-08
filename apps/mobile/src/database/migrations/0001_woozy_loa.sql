ALTER TABLE `cached_tickets` RENAME TO `cached_registrations`;--> statement-breakpoint
ALTER TABLE `cached_registrations` RENAME COLUMN "qr_token" TO "qr_code";--> statement-breakpoint
ALTER TABLE `cached_registrations` RENAME COLUMN "ticket_status" TO "registration_status";--> statement-breakpoint
ALTER TABLE `cache_metadata` RENAME COLUMN "ticket_count" TO "registration_count";--> statement-breakpoint
ALTER TABLE `checkin_queue` RENAME COLUMN "qr_token" TO "qr_code";--> statement-breakpoint
ALTER TABLE `checkin_queue` RENAME COLUMN "ticket_id" TO "registration_id";--> statement-breakpoint
CREATE TABLE `device_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`device_id` text NOT NULL,
	`app_version` text NOT NULL,
	`initialized_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `idx_cached_tickets_qr_token`;--> statement-breakpoint
DROP INDEX `idx_cached_tickets_workshop`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cached_registrations` (
	`registration_id` text PRIMARY KEY NOT NULL,
	`qr_code` text NOT NULL,
	`workshop_id` text NOT NULL,
	`student_name` text NOT NULL,
	`student_code` text NOT NULL,
	`student_id` text NOT NULL,
	`registration_status` text DEFAULT 'PAID' NOT NULL,
	`cached_at` integer NOT NULL,
	`workshop_starts_at` integer,
	`workshop_title` text
);
--> statement-breakpoint
INSERT INTO `__new_cached_registrations`("registration_id", "qr_code", "workshop_id", "student_name", "student_code", "student_id", "registration_status", "cached_at", "workshop_starts_at", "workshop_title") SELECT "registration_id", "qr_code", "workshop_id", "student_name", "student_code", "student_id", "registration_status", "cached_at", "workshop_starts_at", "workshop_title" FROM `cached_registrations`;--> statement-breakpoint
DROP TABLE `cached_registrations`;--> statement-breakpoint
ALTER TABLE `__new_cached_registrations` RENAME TO `cached_registrations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cached_registrations_qr_code` ON `cached_registrations` (`qr_code`);--> statement-breakpoint
CREATE INDEX `idx_cached_registrations_workshop` ON `cached_registrations` (`workshop_id`);--> statement-breakpoint
ALTER TABLE `cache_metadata` ADD `server_total` integer;--> statement-breakpoint
ALTER TABLE `cache_metadata` ADD `is_fully_loaded` integer DEFAULT false NOT NULL;--> statement-breakpoint
DROP INDEX `idx_checkin_queue_ticket_workshop`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_checkin_queue_qr_workshop` ON `checkin_queue` (`qr_code`,`workshop_id`);--> statement-breakpoint
ALTER TABLE `sync_log` ADD `workshop_id` text;