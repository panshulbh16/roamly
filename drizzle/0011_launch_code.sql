ALTER TABLE `orders` ADD `coupon` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `created_at` integer;--> statement-breakpoint
CREATE INDEX `idx_orders_coupon` ON `orders` (`coupon`,`status`);