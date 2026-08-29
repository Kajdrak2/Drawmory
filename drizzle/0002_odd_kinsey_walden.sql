ALTER TABLE `drawings` ADD `city` text;--> statement-breakpoint
ALTER TABLE `drawings` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `drawings` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `drawings` ADD `location_precision` text DEFAULT 'NONE' NOT NULL;