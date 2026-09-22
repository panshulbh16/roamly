CREATE TABLE `trip_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`trip_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shares_owner_trip` ON `trip_shares` (`owner`,`trip_id`);