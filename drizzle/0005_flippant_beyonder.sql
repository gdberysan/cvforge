CREATE TABLE `dismissed_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`dismissed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
