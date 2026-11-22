CREATE TABLE `open_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `api_calls` ADD `cost_known` integer DEFAULT true NOT NULL;