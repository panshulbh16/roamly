CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`payment_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_orders_owner` ON `orders` (`owner`);