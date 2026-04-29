CREATE TABLE `app_session` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'CHECKIN_STAFF' NOT NULL,
	`allowed_workshop_ids` text DEFAULT '[]' NOT NULL,
	`access_token_exp` integer NOT NULL,
	`refresh_token_exp` integer NOT NULL,
	`access_token_key` text DEFAULT 'unihub_access_token' NOT NULL,
	`refresh_token_key` text DEFAULT 'unihub_refresh_token' NOT NULL,
	`logged_in_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "chk_singleton" CHECK("app_session"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `cache_metadata` (
	`workshop_id` text PRIMARY KEY NOT NULL,
	`last_fetched_at` integer NOT NULL,
	`ticket_count` integer DEFAULT 0 NOT NULL,
	`cache_status` text DEFAULT 'FRESH' NOT NULL,
	`etag` text
);
--> statement-breakpoint
CREATE TABLE `cached_tickets` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`qr_token` text NOT NULL,
	`registration_id` text NOT NULL,
	`workshop_id` text NOT NULL,
	`student_name` text NOT NULL,
	`student_code` text NOT NULL,
	`student_id` text NOT NULL,
	`ticket_status` text DEFAULT 'ACTIVE' NOT NULL,
	`cached_at` integer NOT NULL,
	`workshop_starts_at` integer,
	`workshop_title` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cached_tickets_qr_token` ON `cached_tickets` (`qr_token`);--> statement-breakpoint
CREATE INDEX `idx_cached_tickets_workshop` ON `cached_tickets` (`workshop_id`);--> statement-breakpoint
CREATE TABLE `checkin_queue` (
	`local_id` text PRIMARY KEY NOT NULL,
	`qr_token` text NOT NULL,
	`ticket_id` text NOT NULL,
	`workshop_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_name` text NOT NULL,
	`student_code` text NOT NULL,
	`checked_in_at` integer NOT NULL,
	`device_id` text NOT NULL,
	`checked_in_by` text NOT NULL,
	`sync_status` text DEFAULT 'PENDING' NOT NULL,
	`synced_at` integer,
	`error_detail` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_checkin_queue_sync_status` ON `checkin_queue` (`sync_status`);--> statement-breakpoint
CREATE INDEX `idx_checkin_queue_checked_in_at` ON `checkin_queue` (`checked_in_at`);--> statement-breakpoint
CREATE INDEX `idx_checkin_queue_workshop` ON `checkin_queue` (`workshop_id`,`sync_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_checkin_queue_ticket_workshop` ON `checkin_queue` (`ticket_id`,`workshop_id`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`log_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`total_records` integer DEFAULT 0 NOT NULL,
	`synced_count` integer DEFAULT 0 NOT NULL,
	`conflict_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_detail` text
);
