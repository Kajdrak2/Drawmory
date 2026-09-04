ALTER TABLE `claim_drafts` ADD `is_nsfw` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `drawings` ADD `is_nsfw` integer DEFAULT 0 NOT NULL;