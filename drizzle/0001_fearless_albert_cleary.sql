CREATE TABLE `journey_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`voter_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_journey_votes_journey_voter` ON `journey_votes` (`journey_id`,`voter_hash`);--> statement-breakpoint
CREATE INDEX `idx_journey_votes_journey` ON `journey_votes` (`journey_id`);