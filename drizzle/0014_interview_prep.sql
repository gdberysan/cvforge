CREATE TABLE `application_people` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`outcome_event_id` text,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`role_quote` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`outcome_event_id`) REFERENCES `outcome_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `people_app_idx` ON `application_people` (`application_id`);--> statement-breakpoint
CREATE TABLE `interview_preps` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`outcome_event_id` text,
	`language` text NOT NULL,
	`content` text NOT NULL,
	`report` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preps_app_idx` ON `interview_preps` (`application_id`);--> statement-breakpoint
CREATE TABLE `prep_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`evidence_ids` text NOT NULL,
	`part` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prep_answers_app_idx` ON `prep_answers` (`application_id`);--> statement-breakpoint
ALTER TABLE `outcome_events` ADD `meeting_url` text;