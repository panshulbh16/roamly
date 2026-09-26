CREATE TABLE `outing_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`member` text,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `outings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outing_invites_trip_email` ON `outing_invites` (`trip_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outing_invites_token` ON `outing_invites` (`token_hash`);--> statement-breakpoint
CREATE TRIGGER notify_invite_accepted AFTER UPDATE OF status ON outing_invites
WHEN OLD.status='sent' AND NEW.status='accepted'
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT owner,NEW.trip_id,'invite_accepted' FROM outings WHERE id=NEW.trip_id;
END;
