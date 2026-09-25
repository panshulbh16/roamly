import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
function database(){const db=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));return db;}
function trip(db,id='trip',status='open'){db.prepare("INSERT INTO outings(id,owner,city,destination,start_date,capacity,status,payload,meeting,created_at) VALUES (?,'host','Bareilly','Nainital','2099-01-01',2,?,'{}','private-address','today')").run(id,status);}
function join(db,member,id='trip'){db.prepare("INSERT INTO outing_requests(trip_id,member,name,message,created_at) VALUES (?,?,'Name','private-introduction','today')").run(id,member);}
function events(db){return db.prepare('SELECT recipient,type,trip_id FROM notifications ORDER BY rowid').all().map(r=>({...r}));}
test('notifications schema is migrated without backfilling old trips',()=>{const db=database();assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='notifications'").get(),'notification table must exist');trip(db);assert.equal(events(db).length,0);db.close();});
test('notification triggers deliver only to intended recipients and suppress no-op updates',()=>{
 const db=database();trip(db);join(db,'alice');join(db,'bob');
 assert.deepEqual(events(db),['alice','bob'].map(()=>({recipient:'host',type:'request_received',trip_id:'trip'})));
 db.exec("UPDATE outing_requests SET status='approved' WHERE member='alice'");
 db.exec("UPDATE outing_requests SET status='approved' WHERE member='alice'");
 db.exec("UPDATE outing_requests SET status='declined' WHERE member='bob'");
 db.exec("UPDATE outings SET meeting='private-new-address' WHERE id='trip'");
 db.exec("UPDATE outings SET meeting='private-new-address' WHERE id='trip'");
 assert.deepEqual(events(db).slice(2).map(e=>[e.recipient,e.type]),[['alice','request_approved'],['bob','request_declined'],['alice','meeting_updated']]);
 db.exec("UPDATE outing_requests SET status='removed' WHERE member='alice'");
 join(db,'carol');db.exec("UPDATE outing_requests SET status='withdrawn' WHERE member='carol'");
 assert.deepEqual(events(db).slice(-3).map(e=>[e.recipient,e.type]),[['alice','request_removed'],['host','request_received'],['host','request_withdrawn']]);
 const serialized=JSON.stringify(db.prepare('SELECT * FROM notifications').all());assert.doesNotMatch(serialized,/private-address|private-new-address|private-introduction/);db.close();
});
test('cancellation notifies pending and approved once; closed and discarded drafts do not notify',()=>{
 const db=database();trip(db);for(const m of ['pending','approved','declined','withdrawn'])join(db,m);
 for(const m of ['approved','declined','withdrawn'])db.prepare('UPDATE outing_requests SET status=? WHERE member=?').run(m,m);
 db.exec('DELETE FROM notifications');db.exec("UPDATE outings SET status='closed'");assert.equal(events(db).length,0);
 db.exec("UPDATE outings SET status='cancelled'");db.exec("UPDATE outings SET status='cancelled'");
 assert.deepEqual(events(db).map(e=>[e.recipient,e.type]).sort(),[['approved','trip_cancelled'],['pending','trip_cancelled']]);
 db.exec("UPDATE outings SET meeting='changed after cancellation'");assert.equal(events(db).length,2);
 trip(db,'draft','draft');db.exec("UPDATE outings SET status='discarded' WHERE id='draft'");assert.equal(events(db).length,2);db.close();
});
test('notification write failure rolls back the trip decision',()=>{
 const db=database();trip(db);join(db,'alice');db.exec("CREATE TRIGGER test_fail_notification BEFORE INSERT ON notifications WHEN NEW.type='request_approved' BEGIN SELECT RAISE(ABORT,'notification failure'); END;");
 assert.throws(()=>db.exec("UPDATE outing_requests SET status='approved' WHERE member='alice'"),/notification failure/);
 assert.equal(db.prepare("SELECT status FROM outing_requests WHERE member='alice'").get().status,'pending');assert.equal(events(db).length,1);db.close();
});
