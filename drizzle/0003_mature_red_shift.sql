CREATE TABLE `api_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL
);
