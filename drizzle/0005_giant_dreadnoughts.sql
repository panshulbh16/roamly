CREATE TABLE `notifications` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`recipient` text NOT NULL,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_created` ON `notifications` (`recipient`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_read` ON `notifications` (`recipient`,`read_at`);--> statement-breakpoint
-- Triggers keep state changes and alerts atomic. No historical backfill.
CREATE TRIGGER notify_request_insert AFTER INSERT ON outing_requests
WHEN NEW.status = 'pending'
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT owner,NEW.trip_id,'request_received' FROM outings
  WHERE id=NEW.trip_id AND owner<>NEW.member AND status='open';
END;
--> statement-breakpoint
CREATE TRIGGER notify_request_decision AFTER UPDATE OF status ON outing_requests
WHEN (OLD.status='pending' AND NEW.status IN ('approved','declined'))
  OR (OLD.status='approved' AND NEW.status='removed')
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  VALUES(NEW.member,NEW.trip_id,'request_' || NEW.status);
END;
--> statement-breakpoint
CREATE TRIGGER notify_request_withdrawal AFTER UPDATE OF status ON outing_requests
WHEN OLD.status IN ('pending','approved') AND NEW.status='withdrawn'
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT owner,NEW.trip_id,'request_withdrawn' FROM outings WHERE id=NEW.trip_id;
END;
--> statement-breakpoint
CREATE TRIGGER notify_trip_cancelled AFTER UPDATE OF status ON outings
WHEN OLD.status IN ('open','closed') AND NEW.status='cancelled'
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT member,NEW.id,'trip_cancelled' FROM outing_requests
  WHERE trip_id=NEW.id AND status IN ('pending','approved');
END;
--> statement-breakpoint
CREATE TRIGGER notify_meeting_updated AFTER UPDATE OF meeting ON outings
WHEN OLD.meeting<>NEW.meeting AND NEW.status IN ('open','closed')
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT member,NEW.id,'meeting_updated' FROM outing_requests
  WHERE trip_id=NEW.id AND status='approved';
END;
