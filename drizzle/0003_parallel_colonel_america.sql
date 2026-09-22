CREATE TABLE `subscriptions` (
	`owner` text PRIMARY KEY NOT NULL,
	`subscription_id` text,
	`status` text DEFAULT 'creating' NOT NULL,
	`current_end` integer DEFAULT 0 NOT NULL,
	`paid_count` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_id` ON `subscriptions` (`subscription_id`);