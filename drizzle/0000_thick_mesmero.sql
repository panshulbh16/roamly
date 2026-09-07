CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trips_owner_created` ON `trips` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`owner` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
