CREATE TABLE `search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`intake` text NOT NULL,
	`trip` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_history_owner_created` ON `search_history` (`owner`,`created_at`,`id`);