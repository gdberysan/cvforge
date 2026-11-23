CREATE TABLE `follow_up_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`created_at` text NOT NULL,
	`to` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_up_drafts_app_idx` ON `follow_up_drafts` (`application_id`);