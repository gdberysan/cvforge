CREATE TABLE `cv_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`focus` text NOT NULL,
	`language` text NOT NULL,
	`market` text NOT NULL,
	`cv` text,
	`report` text,
	`evidence_hash` text,
	`composed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
