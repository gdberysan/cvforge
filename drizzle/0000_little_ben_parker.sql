CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`company` text NOT NULL,
	`job_title` text NOT NULL,
	`market` text NOT NULL,
	`document_language` text NOT NULL,
	`posting_raw` text NOT NULL,
	`posting_hash` text NOT NULL,
	`status` text DEFAULT 'triaged' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`coverage` text,
	`documents` text,
	`grounding_report` text
);
--> statement-breakpoint
CREATE INDEX `applications_hash_idx` ON `applications` (`posting_hash`);--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`text` text NOT NULL,
	`metrics` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text,
	`strength` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evidence_source_idx` ON `evidence_items` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`strength` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mappings_app_idx` ON `mappings` (`application_id`);--> statement-breakpoint
CREATE TABLE `outcome_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`at` text NOT NULL,
	`type` text NOT NULL,
	`note` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outcome_app_idx` ON `outcome_events` (`application_id`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`text` text NOT NULL,
	`keyword` text NOT NULL,
	`variants` text DEFAULT '[]' NOT NULL,
	`kind` text NOT NULL,
	`mandatory` integer NOT NULL,
	`weight` integer DEFAULT 2 NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `requirements_app_idx` ON `requirements` (`application_id`);