CREATE TABLE `claim_drafts` (
	`claim_id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`drawing_id` text NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`validated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_claim_drafts_journey` ON `claim_drafts` (`journey_id`);--> statement-breakpoint
ALTER TABLE `claims` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `claims` ADD `cancel_reason` text;