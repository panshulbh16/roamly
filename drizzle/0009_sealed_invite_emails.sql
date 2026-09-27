DROP INDEX `idx_outing_invites_trip_email`;--> statement-breakpoint
ALTER TABLE `outing_invites` ADD `email_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outing_invites_trip_email_key` ON `outing_invites` (`trip_id`,`email_key`);--> statement-breakpoint
-- Personal data is now sealed at rest (lib/server/vault.ts). Sealing is deterministic, so real edits still
-- change the stored text; the extra condition keeps a plaintext -> sealed rewrite of old rows silent.
DROP TRIGGER notify_trip_updated;--> statement-breakpoint
CREATE TRIGGER notify_trip_updated AFTER UPDATE OF payload ON outings
WHEN OLD.payload<>NEW.payload AND NEW.status IN ('open','closed') AND (OLD.payload LIKE 'enc1:%')=(NEW.payload LIKE 'enc1:%')
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT member,NEW.id,'trip_updated' FROM outing_requests
  WHERE trip_id=NEW.id AND status IN ('pending','approved');
END;--> statement-breakpoint
DROP TRIGGER notify_meeting_updated;--> statement-breakpoint
CREATE TRIGGER notify_meeting_updated AFTER UPDATE OF meeting ON outings
WHEN OLD.meeting<>NEW.meeting AND NEW.status IN ('open','closed') AND (OLD.meeting LIKE 'enc1:%')=(NEW.meeting LIKE 'enc1:%')
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT member,NEW.id,'meeting_updated' FROM outing_requests
  WHERE trip_id=NEW.id AND status='approved';
END;
