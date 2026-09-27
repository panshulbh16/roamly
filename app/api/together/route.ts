import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { hasPlus, membership } from "@/lib/billing/razorpay";
import { ApiError, body, db, failure, identity, privateHeaders, sameOrigin } from "@/lib/server/context";
import { outingSchema, travellerHandle, upcoming, type OutingInput } from "@/lib/trips/together";
import { INVITE_DAYS, invitesReady, newToken, refreshInvites, sendInviteEmail, sha256 } from "@/lib/trips/invites";
import { lookupKey, seal, unseal, unsealJson } from "@/lib/server/vault";
import { emailSchema } from "@/lib/auth/requests";
type Row={id:string;owner:string;payload:string;meeting:string;status:string;start_date:string;capacity:number;approved:number;request_status:string|null};
const counts = `SELECT o.*, (SELECT count(*) FROM outing_requests r WHERE r.trip_id=o.id AND r.status='approved') approved,
 (SELECT status FROM outing_requests r WHERE r.trip_id=o.id AND r.member=?) request_status FROM outings o`;
async function view(r:Row,owner?:string) {
  const payload=await unsealJson<Omit<OutingInput,"meeting">>(r.payload,'outings.payload');
  return {...payload,status:r.status,isHost:r.owner===owner,approved:r.approved,requestStatus:r.request_status,
    ...(r.owner===owner || (r.request_status==='approved' && r.status!=='cancelled') ? {meeting:await unseal(r.meeting,'outings.meeting')}: {})};
}
type RequestRow={member:string;name:string;message:string;status:string};
export async function GET(r:Request) {
  try {
    const user=await currentUser(), url=new URL(r.url), id=url.searchParams.get('id');
    if(id) {
      if(!z.string().uuid().safeParse(id).success) throw new ApiError(400,'Invalid trip link.');
      const row=await db().prepare(counts+' WHERE o.id=?').bind(user?.id??'',id).first<Row>();
      if(!row || (['draft','discarded'].includes(row.status) && row.owner!==user?.id)) throw new ApiError(404,'This trip is unavailable.');
      const host=row.owner===user?.id;
      const requests=host ? await Promise.all((await db().prepare('SELECT member,name,message,status FROM outing_requests WHERE trip_id=? ORDER BY created_at').bind(id).all<RequestRow>()).results
        .map(async q=>({member:await travellerHandle(id,q.member),name:await unseal(q.name,'outing_requests.name'),message:await unseal(q.message,'outing_requests.message'),status:q.status}))) : [];
      const invites=host ? await Promise.all((await db().prepare("SELECT email,CASE WHEN status='sent' AND expires_at<=? THEN 'expired' ELSE status END status FROM outing_invites WHERE trip_id=? ORDER BY created_at DESC").bind(Math.floor(Date.now()/1000),id).all<{email:string;status:string}>()).results
        .map(async i=>({email:await unseal(i.email,'outing_invites.email'),status:i.status}))) : [];
      return Response.json({trip:await view(row,user?.id),requests,invites},{headers:privateHeaders});
    }
    const mine=url.searchParams.get('mine')==='1';
    if(mine && !user) throw new ApiError(401,'Please sign in to see your activity.');
    const city=url.searchParams.get('city')?.trim()??'', destination=url.searchParams.get('destination')?.trim()??'', date=url.searchParams.get('date')??'';
    if(city.length>100 || destination.length>100 || (date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new ApiError(400,'Check your search filters.');
    const rows=mine
      ? await db().prepare(counts+' WHERE o.owner=? OR EXISTS (SELECT 1 FROM outing_requests r WHERE r.trip_id=o.id AND r.member=?) ORDER BY o.created_at DESC LIMIT 100').bind(user!.id,user!.id,user!.id).all<Row>()
      : await db().prepare(counts+` WHERE o.status='open' AND o.start_date>=? AND instr(lower(o.city),lower(?))>0 AND instr(lower(o.destination),lower(?))>0 AND (?='' OR o.start_date=?) ORDER BY o.start_date LIMIT 50`).bind(user?.id??'',new Date().toISOString().slice(0,10),city,destination,date,date).all<Row>();
    return Response.json({trips:await Promise.all(rows.results.map(row=>view(row,user?.id)))},{headers:privateHeaders});
  } catch(e) {return failure(e);}
}
const actionSchema=z.object({action:z.enum(['save','publish','close','cancel','join','withdraw','approve','decline','remove','meeting','report','invite']),id:z.string().uuid()});
export async function POST(r:Request) {
  try {
    sameOrigin(r); const user=await identity(), input=await body(r);
    const parsed=actionSchema.safeParse(input);
    if(!parsed.success) throw new ApiError(400,'Check your trip details.');
    const {action,id}=parsed.data; let sent:number|undefined;
    if(action==='save') {
      if(!hasPlus(await membership(user.id))) throw new ApiError(403,'Roamly Plus is required to create or edit a draft.');
      const valid=outingSchema.safeParse(input.trip);
      if(!valid.success || valid.data.id!==id) throw new ApiError(400,'Add a title, host name, both cities and a date, with up to 10 days and 1–20 places.');
      const {meeting,...trip}=valid.data;
      if(!upcoming(trip.startDate)) throw new ApiError(400,'Choose today or a future departure date.');
      const saved=await db().prepare(`INSERT INTO outings (id,owner,city,destination,start_date,capacity,payload,meeting,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM outings WHERE owner=?)<100 OR EXISTS (SELECT 1 FROM outings WHERE id=? AND owner=?)
        ON CONFLICT(id) DO UPDATE SET city=excluded.city,destination=excluded.destination,start_date=excluded.start_date,capacity=excluded.capacity,payload=excluded.payload,meeting=excluded.meeting
        WHERE outings.owner=excluded.owner AND outings.status IN ('draft','open','closed')
          AND excluded.capacity>=(SELECT count(*) FROM outing_requests WHERE trip_id=outings.id AND status='approved') RETURNING id`).bind(id,user.id,trip.city,trip.destination,trip.startDate,trip.capacity,await seal(JSON.stringify(trip),'outings.payload'),await seal(meeting,'outings.meeting'),new Date().toISOString(),user.id,id,user.id).first();
      if(!saved) throw new ApiError(409,'This trip can’t be edited: it was cancelled, or guest places are below approved travellers. You can store up to 100 trips.');
      // Publishing straight from the editor skips the separate draft step.
      if(input.publish===true) await db().prepare("UPDATE outings SET status='open' WHERE id=? AND status='draft'").bind(id).run();
    } else {
      const row=await db().prepare('SELECT * FROM outings WHERE id=?').bind(id).first<Row>();
      if(!row || (['draft','discarded'].includes(row.status) && row.owner!==user.id)) throw new ApiError(404,'This trip is unavailable.');
      const host=row.owner===user.id;
      if(['publish','close','cancel','approve','decline','remove','meeting','invite'].includes(action) && !host) throw new ApiError(403,'Only the host can do that.');
      if(action==='publish') {
        if(!hasPlus(await membership(user.id))) throw new ApiError(403,'Roamly Plus is required to publish a trip.');
        if(!upcoming(row.start_date)) throw new ApiError(400,'This trip date has passed.');
        const changed=await db().prepare("UPDATE outings SET status='open' WHERE id=? AND status IN ('draft','closed') RETURNING id").bind(id).first();
        if(!changed) throw new ApiError(409,'This trip cannot be published.');
      } else if(action==='close' || action==='cancel') {
        const changed=await db().prepare(`UPDATE outings SET status=${action==='close'?"'closed'":"CASE WHEN status='draft' THEN 'discarded' ELSE 'cancelled' END"} WHERE id=? AND status IN (${action==='close'?"'open'":"'draft','open','closed'"}) RETURNING id`).bind(id).first();
        if(!changed) throw new ApiError(409,'This trip is already cancelled.');
      } else if(action==='meeting') {
        const note=z.string().trim().max(2000).safeParse(input.meeting);
        if(!note.success) throw new ApiError(400,'Keep meeting details under 2,000 characters.');
        await db().prepare('UPDATE outings SET meeting=? WHERE id=?').bind(await seal(note.data,'outings.meeting'),id).run();
      } else if(action==='join') {
        const join=z.object({name:z.string().trim().min(1).max(60),message:z.string().trim().min(10).max(500)}).safeParse(input);
        if(!join.success) throw new ApiError(400,'Add a public name and a short introduction (10–500 characters).');
        if(host) throw new ApiError(400,'You are already hosting this trip.');
        const changed=await db().prepare(`INSERT INTO outing_requests (trip_id,member,name,message,created_at)
          SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM outings WHERE id=? AND status='open' AND start_date>=? AND capacity>(SELECT count(*) FROM outing_requests WHERE trip_id=? AND status='approved'))
          AND (SELECT count(*) FROM outing_requests WHERE member=?)<100 AND (SELECT count(*) FROM outing_requests WHERE trip_id=?)<100
          ON CONFLICT(trip_id,member) DO NOTHING RETURNING member`).bind(id,user.id,await seal(join.data.name,'outing_requests.name'),await seal(join.data.message,'outing_requests.message'),new Date().toISOString(),id,new Date().toISOString().slice(0,10),id,user.id,id).first();
        if(!changed) throw new ApiError(409,'You already requested this trip, or it is full, closed or at its request limit.');
      } else if(action==='withdraw') {
        await db().prepare("UPDATE outing_requests SET status='withdrawn' WHERE trip_id=? AND member=? AND status IN ('pending','approved')").bind(id,user.id).run();
      } else if(['approve','decline','remove'].includes(action)) {
        // input.member is the traveller's per-trip handle from GET, never an account ID.
        const handle=z.string().regex(/^[0-9a-f]{32}$/).safeParse(input.member);
        if(!handle.success) throw new ApiError(400,'Choose a traveller.');
        const requested=(await db().prepare('SELECT member FROM outing_requests WHERE trip_id=?').bind(id).all<{member:string}>()).results;
        const member=(await Promise.all(requested.map(async q=>await travellerHandle(id,q.member)===handle.data?q.member:''))).find(Boolean)??'';
        const status=action==='approve'?'approved':action==='decline'?'declined':'removed';
        const changed=await db().prepare(`UPDATE outing_requests SET status=? WHERE trip_id=? AND member=? AND status=?
          AND EXISTS (SELECT 1 FROM outings WHERE id=? AND owner=? ${action==='approve'?"AND status='open' AND start_date>=? AND capacity>(SELECT count(*) FROM outing_requests WHERE trip_id=? AND status='approved')":''}) RETURNING member`)
          .bind(status,id,member,action==='remove'?'approved':'pending',id,user.id,...(action==='approve'?[new Date().toISOString().slice(0,10),id]:[])).first();
        if(!changed) throw new ApiError(409,'Request changed, or this trip has no available places. Refresh to see its status.');
      } else if(action==='invite') {
        if(!invitesReady()) throw new ApiError(503,'Email invites aren’t set up yet.');
        const emails=z.array(emailSchema).min(1).max(10).safeParse(input.emails);
        if(!emails.success) throw new ApiError(400,'Add 1–10 valid email addresses.');
        if(!['open','closed'].includes(row.status)) throw new ApiError(409,'Publish the trip before inviting people.');
        if(!upcoming(row.start_date)) throw new ApiError(400,'This trip date has passed.');
        // Emails that already joined are skipped; unaccepted invites hold a place so a trip can't be over-promised.
        // Emails are sealed, so they're matched by their lookup keys.
        await refreshInvites(id);
        const joined=new Set((await db().prepare("SELECT email_key FROM outing_invites WHERE trip_id=? AND status='accepted'").bind(id).all<{email_key:string}>()).results.map(r=>r.email_key));
        const keyed=await Promise.all([...new Set(emails.data)].map(async e=>({email:e,key:await lookupKey(e)})));
        const list=keyed.filter(e=>!joined.has(e.key)), now=Math.floor(Date.now()/1000);
        sent=0;
        if(list.length) {
          const room=await db().prepare(`SELECT o.capacity-(SELECT count(*) FROM outing_requests WHERE trip_id=o.id AND status='approved')
            -(SELECT count(*) FROM outing_invites WHERE trip_id=o.id AND status='sent' AND expires_at>? AND email_key NOT IN (SELECT value FROM json_each(?))) places,
            (SELECT count(*) FROM outing_invites WHERE trip_id=o.id) total FROM outings o WHERE o.id=?`).bind(now,JSON.stringify(list.map(e=>e.key)),id).first<{places:number;total:number}>();
          if(!room || list.length>room.places) throw new ApiError(409,`Only ${Math.max(0,room?.places??0)} ${room?.places===1?'place is':'places are'} left, counting invites that haven’t been accepted yet.`);
          if(room.total+list.length>50) throw new ApiError(409,'A trip can have up to 50 invites.');
          const quota=await db().prepare("INSERT INTO usage (key,count) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count WHERE count+excluded.count<=50 RETURNING count").bind(`invite:${user.id}:${new Date().toISOString().slice(0,10)}`,list.length).first();
          if(!quota) throw new ApiError(429,'You can send up to 50 invites a day. Try again tomorrow.');
          const trip=await unsealJson<OutingInput>(row.payload,'outings.payload'), origin=new URL(r.url).origin;
          for(const {email,key} of list) {
            const token=newToken();
            await db().prepare(`INSERT INTO outing_invites (id,trip_id,email,email_key,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(trip_id,email_key) DO UPDATE SET email=excluded.email,token_hash=excluded.token_hash,status='sent',created_at=excluded.created_at,expires_at=excluded.expires_at`)
              .bind(crypto.randomUUID(),id,await seal(email,'outing_invites.email'),key,await sha256(token),new Date().toISOString(),now+INVITE_DAYS*86400).run();
            await sendInviteEmail(email,trip,`${origin}/together/invite?t=${token}`);
            sent++;
          }
        }
      } else if(action==='report') {
        const reason=z.string().trim().min(10).max(1000).safeParse(input.reason);
        if(!reason.success) throw new ApiError(400,'Describe the concern in 10–1,000 characters.');
        const reported=await db().prepare(`INSERT INTO outing_reports (trip_id,reporter,reason,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM outing_reports WHERE reporter=?)<100 ON CONFLICT(trip_id,reporter) DO NOTHING RETURNING trip_id`).bind(id,user.id,reason.data,new Date().toISOString(),user.id).first();
        if(!reported) throw new ApiError(409,'You already reported this trip or reached the reporting limit.');
      }
    }
    return Response.json({ok:true,id,...(sent===undefined?{}:{sent})},{headers:privateHeaders});
  } catch(e) {return failure(e);}
}
