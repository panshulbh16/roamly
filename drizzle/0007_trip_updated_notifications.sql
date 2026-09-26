-- Published trips are now editable; everyone who requested or joined hears about changes.
CREATE TRIGGER notify_trip_updated AFTER UPDATE OF payload ON outings
WHEN OLD.payload<>NEW.payload AND NEW.status IN ('open','closed')
BEGIN
  INSERT INTO notifications(recipient,trip_id,type)
  SELECT member,NEW.id,'trip_updated' FROM outing_requests
  WHERE trip_id=NEW.id AND status IN ('pending','approved');
END;
