CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`answers` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interview_sessions_role_idx` ON `interview_sessions` (`role_id`);