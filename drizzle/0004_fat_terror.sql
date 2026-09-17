CREATE TABLE `answer_bank` (
	`id` text PRIMARY KEY NOT NULL,
	`question_key` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`language` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `answer_bank_key_idx` ON `answer_bank` (`question_key`,`language`);