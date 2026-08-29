CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`handoff_id` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`reveal_started_at` integer,
	`reservation_expires_at` integer NOT NULL,
	`submitted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claims_session_hash` ON `claims` (`session_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_claims_journey` ON `claims` (`journey_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `drawings` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`country_code` text DEFAULT 'UNKNOWN' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_drawings_journey_step` ON `drawings` (`journey_id`,`step_index`);--> statement-breakpoint
CREATE INDEX `idx_drawings_journey` ON `drawings` (`journey_id`);--> statement-breakpoint
CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`mode` text NOT NULL,
	`token_hash` text,
	`code_hash` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`claimed_at` integer,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_handoffs_token_hash` ON `handoffs` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_handoffs_code_hash` ON `handoffs` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_handoffs_journey_status` ON `handoffs` (`journey_id`,`status`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`public_slug` text NOT NULL,
	`status` text NOT NULL,
	`target_redraws` integer NOT NULL,
	`redraw_count` integer DEFAULT 0 NOT NULL,
	`handoff_mode` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`reservation_expires_at` integer,
	`previous_available_state` text,
	`current_drawing_id` text,
	`flagged` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_journeys_public_slug` ON `journeys` (`public_slug`);--> statement-breakpoint
CREATE INDEX `idx_journeys_world_queue` ON `journeys` (`status`,`flagged`,`updated_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_token_hash` ON `receipts` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_receipts_journey_step` ON `receipts` (`journey_id`,`step_index`);