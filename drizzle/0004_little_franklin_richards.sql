CREATE TABLE `outing_reports` (
	`trip_id` text NOT NULL,
	`reporter` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`trip_id`, `reporter`),
	FOREIGN KEY (`trip_id`) REFERENCES `outings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outing_requests` (
	`trip_id` text NOT NULL,
	`member` text NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`trip_id`, `member`),
	FOREIGN KEY (`trip_id`) REFERENCES `outings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_outing_requests_member` ON `outing_requests` (`member`);--> statement-breakpoint
CREATE TABLE `outings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`city` text NOT NULL,
	`destination` text NOT NULL,
	`start_date` text NOT NULL,
	`capacity` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`payload` text NOT NULL,
	`meeting` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outings_owner` ON `outings` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_outings_status_date` ON `outings` (`status`,`start_date`);