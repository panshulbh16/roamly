ALTER TABLE `orders` ADD `provider` text DEFAULT 'razorpay' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_orders_payment` ON `orders` (`payment_id`);