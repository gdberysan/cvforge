CREATE TABLE `kit_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`not_before` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
