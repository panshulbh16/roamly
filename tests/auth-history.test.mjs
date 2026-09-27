import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
const sql=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
class Statement{constructor(q,values=[]){this.q=q;this.values=values}bind(...values){return new Statement(this.q,values)}async first(){return sql.prepare(this.q).get(...this.values)??null}async all(){return {results:sql.prepare(this.q).all(...this.values),success:true,meta:{}}}async run(){const r=sql.prepare(this.q).run(...this.values);return {success:true,results:[],meta:{changes:Number(r.changes)}}}}
const jar=new Map();const context={env:{DB:{prepare:q=>new Statement(q),batch:async list=>{sql.exec('BEGIN');try{const out=[];for(const st of list)out.push(await st.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}},headers:new Headers(),jar,redirect:p=>{throw Error('REDIRECT:'+p)}};
globalThis.__roamlyTest=context;
const compiled=await build({entryPoints:['tests/auth-history-entry.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-runtime',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='cloudflare:workers'?'export const env=globalThis.__roamlyTest.env':args.path==='next/navigation'?'export const redirect=globalThis.__roamlyTest.redirect':`export async function headers(){return globalThis.__roamlyTest.headers} export async function cookies(){const jar=globalThis.__roamlyTest.jar;return {get:n=>jar.has(n)?{name:n,value:jar.get(n).value}:undefined,getAll:()=>Array.from(jar,([name,c])=>({name,value:c.value})),set:(name,value,options)=>jar.set(name,{value,options}),delete:name=>jar.delete(name)}}`}));}}]});
const app=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const input={destination:'Auckland',startDate:'',days:5,travelers:2,budget:'Comfort',pace:'Balanced',interests:['Nature'],needs:'',homeCity:''};
function providerStream(raw, ending='message_stop') {
  const events=[];
  for(const text of raw) events.push({type:'content_block_delta',delta:{type:'text_delta',text}});
  if(ending) events.push({type:ending});
  return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
}
test('API write methods reject foreign origins and invalid identifiers',async()=>{
  user('boundary-test');
  for(const [handler,path] of [[app.trips.POST,'/api/trips'],[app.trips.DELETE,'/api/trips'],[app.history.DELETE,'/api/history'],[app.waitlist.POST,'/api/waitlist'],[app.email.POST,'/api/auth/email'],[app.verify.POST,'/api/auth/verify'],[app.google.POST,'/api/auth/google'],[app.logout.POST,'/api/auth/logout']]) {
    const request=req(path,{});request.headers.set('origin','https://foreign.test');
    assert.equal((await handler(request)).status,403,path);
  }
  for(const offset of ['-1','1.5','100001','NaN','Infinity'])assert.equal((await app.history.GET(req('/api/history?offset='+offset,undefined,'GET'))).status,400);
  assert.equal((await app.history.GET(req('/api/history?id=bad',undefined,'GET'))).status,400);
  assert.equal((await app.history.GET(req('/api/history?id='+crypto.randomUUID(),undefined,'GET'))).status,404);
  for(const route of [app.history,app.trips])assert.equal((await route.DELETE(req('/api/delete',{id:'bad'},'DELETE'))).status,400);
  context.headers=new Headers();
});
test('planner handles refusal, empty text, invalid JSON and output truncation without exposing provider data',async()=>{
  const original=globalThis.fetch;
  try {
    for(const payload of [{content:[],stop_reason:'refusal'},{content:[{type:'text',text:'not JSON'}]},{content:[{type:'text',text:'{}'}]},{content:[],stop_reason:'max_tokens'}]) {
      globalThis.fetch=async()=>Response.json(payload);
      await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days:1}),e=>e.status===502);
    }
    globalThis.fetch=async()=>new Response('provider private detail',{status:429});
    await assert.rejects(()=>new app.planner.AnthropicPlanner().generate(input),e=>e.status===502&&!e.message.includes('private'));
    globalThis.fetch=async()=>new Response('data: {"type":"error"}\n\n');
    await assert.rejects(()=>new app.planner.AnthropicPlanner().generate(input,()=>{}),e=>e.status===502);
    const controller=new AbortController();controller.abort();
    globalThis.fetch=async(_,options)=>{options.signal.throwIfAborted();};
    await assert.rejects(()=>new app.planner.AnthropicPlanner().generate(input,()=>{},controller.signal),e=>e.name==='AbortError');
  } finally {globalThis.fetch=original;}
});
test('stream route delivers a preview before completion and stores only validated trips',async()=>{
  const original=globalThis.fetch;
  user('stream-test');
  Object.assign(context.env,{ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'claude-opus-5',AI_MONTHLY_REQUEST_LIMIT:'100'});
  const itinerary={title:'Auckland',summary:'Harbour',days:[{title:'Day 1',activities:[{time:'Morning',title:'Walk',description:'Walk',place:'Harbour'}]}],tips:[],destinationAdvice:{highlights:['Harbour','Parks'],watchOutFor:['Rain; bring a coat.','Hills; check access.']}};
  try {
    for(const success of [true,false]) {
      let release;
      const gate=new Promise(r=>{release=r;});
      globalThis.fetch=async()=>new Response(new ReadableStream({async start(c){
        const emit=e=>c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(e)+'\n\n'));
        emit({type:'content_block_delta',delta:{type:'text_delta',text:'{"title":"Auckland",'}});
        await gate;
        if(success){emit({type:'content_block_delta',delta:{type:'text_delta',text:JSON.stringify(itinerary).slice('{"title":"Auckland",'.length)}});emit({type:'message_stop'});}
        c.close();
      }}));
      const request=req('/api/generate',{...input,days:1});request.headers.set('accept','application/x-ndjson');
      const response=await app.generate.POST(request);
      assert.match(response.headers.get('content-type'),/ndjson/);
      const reader=response.body.getReader();
      const first=await reader.read();
      assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type,'preview');
      assert.equal(sql.prepare("SELECT count(*) n FROM search_history WHERE owner='stream-test' AND status='pending'").get().n,1);
      release();
      let rest='';while(true){const {done,value}=await reader.read();if(done)break;rest+=new TextDecoder().decode(value);}
      const events=rest.trim().split('\n').map(JSON.parse);
      assert.equal(events.at(-1).type,success?'complete':'error');
      if(success) assert.deepEqual(events.at(-1).trip.itinerary,itinerary);
      assert.equal(sql.prepare("SELECT status FROM search_history WHERE owner='stream-test'").get().status,success?'completed':'failed');
      sql.exec("DELETE FROM search_history WHERE owner='stream-test'");
    }
  } finally {
    globalThis.fetch=original;context.headers=new Headers();
    for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_MODEL','AI_MONTHLY_REQUEST_LIMIT'])delete context.env[key];
    sql.exec("DELETE FROM search_history WHERE owner='stream-test'; DELETE FROM usage;");
  }
});
test('streaming provider emits complete sections for all 1–10 days and rejects a truncated stream',async()=>{
  const original=globalThis.fetch;
  context.env.ANTHROPIC_MODEL='claude-opus-5';
  try {
    for(let days=1;days<=10;days++) {
      const itinerary={title:'Auckland',summary:'Harbour days',days:Array.from({length:days},(_,i)=>({title:'Day '+(i+1),activities:[{time:'Morning',title:'Walk',description:'Harbour walk',place:'Auckland'}]})),tips:[],destinationAdvice:{highlights:['Waterfront','Parks'],watchOutFor:['Rain; pack a coat.','Hills; check access.']}};
      globalThis.fetch=async(_,options)=>{assert.equal(JSON.parse(options.body).stream,true);return providerStream(JSON.stringify(itinerary));};
      const previews=[];
      assert.deepEqual(await new app.planner.AnthropicPlanner().generate({...input,days},p=>previews.push(p)),itinerary);
      assert.ok(previews.some(p=>p.title&&!p.days));
      for(let n=1;n<=days;n++) assert.ok(previews.some(p=>p.days?.length===n));
      globalThis.fetch=async()=>providerStream(JSON.stringify(itinerary),'');
      await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days},()=>{}),/incomplete response/);
    }
  } finally {globalThis.fetch=original;delete context.env.ANTHROPIC_MODEL;}
});
const origin='https://roamly.test';
const destinationAdvice={highlights:['Harbour walks offer waterfront views.','Volcanic viewpoints provide city panoramas.'],watchOutFor:['Hills can be steep; choose accessible routes.','Weather changes quickly; carry a rain layer.']};
test('planner sends optional workspace header and validates the provider itinerary',async()=>{
  const originalFetch=globalThis.fetch;
  const itinerary={title:'Auckland',summary:'A short visit',days:[{title:'Day 1',activities:[{time:'Morning',title:'Walk',description:'Explore the waterfront',place:'Auckland'}]}],tips:[],destinationAdvice};
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='claude-opus-5';
  context.env.AI_MONTHLY_REQUEST_LIMIT='100';
  try {
    for(const workspace of [undefined,'wrkspc_fixture']) {
      if(workspace) context.env.ANTHROPIC_WORKSPACE_ID=workspace;
      else delete context.env.ANTHROPIC_WORKSPACE_ID;
      globalThis.fetch=async(url,options)=>{
        assert.equal(url,'https://api.anthropic.com/v1/messages');
        const headers=new Headers(options.headers);
        assert.equal(headers.get('anthropic-workspace-id'),workspace??null);
        assert.equal(headers.get('x-api-key'),'fixture-key');
        assert.equal(JSON.parse(options.body).model,'claude-opus-5');
        assert.deepEqual(JSON.parse(options.body).output_config,{effort:'low'});
        assert.deepEqual(JSON.parse(options.body).thinking,{type:'disabled'});
        assert.equal(JSON.parse(options.body).max_tokens,5000);
        assert.match(JSON.parse(options.body).system,/destinationAdvice/);
        assert.match(JSON.parse(options.body).system,/exactly the requested number of days/);
        assert.match(JSON.parse(options.body).system,/under 12 words/);
        assert.match(JSON.parse(options.body).system,/compact JSON without indentation/);
        assert.doesNotMatch(JSON.parse(options.body).system,/under 45 words/);
        return Response.json({content:[{type:'text',text:JSON.stringify(itinerary)}],stop_reason:'end_turn'});
      };
      assert.deepEqual(await new app.planner.AnthropicPlanner().generate({...input,days:1}),itinerary);
    }
    for (const advice of [undefined, {highlights: [], watchOutFor: []}]) {
      globalThis.fetch=async()=>Response.json({content:[{type:'text',text:JSON.stringify({...itinerary,destinationAdvice:advice})}],stop_reason:'end_turn'});
      await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days:1}),/validate this itinerary/);
    }
  } finally {
    globalThis.fetch=originalFetch;
    delete context.env.ANTHROPIC_API_KEY; delete context.env.ANTHROPIC_MODEL; delete context.env.ANTHROPIC_WORKSPACE_ID; delete context.env.AI_MONTHLY_REQUEST_LIMIT;
  }
});
test('planner turns provider timeouts into a clear 504',async()=>{
  const originalFetch=globalThis.fetch;
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='fixture-model';
  globalThis.fetch=async()=>{throw new DOMException('timed out','TimeoutError')};
  try {
    await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days:1}),/planning service took too long/);
  } finally {
    globalThis.fetch=originalFetch;
    delete context.env.ANTHROPIC_API_KEY; delete context.env.ANTHROPIC_MODEL;
  }
});
test('planner turns malformed provider JSON into a clear 502',async()=>{
  const originalFetch=globalThis.fetch;
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='fixture-model';
  context.env.AI_MONTHLY_REQUEST_LIMIT='100';
  globalThis.fetch=async()=>Response.json({error:'upstream'});
  try {
    await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days:1}),/planning service returned an incomplete response/);
  } finally {
    globalThis.fetch=originalFetch;
    delete context.env.ANTHROPIC_API_KEY; delete context.env.ANTHROPIC_MODEL; delete context.env.AI_MONTHLY_REQUEST_LIMIT;
  }
});
test('planner rejects null and malformed content blocks with a controlled provider error',async()=>{
  const originalFetch=globalThis.fetch;
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='fixture-model';
  context.env.AI_MONTHLY_REQUEST_LIMIT='100';
  try {
    for (const payload of [null,{content:[null]},{content:[{type:'text',text:{}}]}]) {
      globalThis.fetch=async()=>Response.json(payload);
      await assert.rejects(()=>new app.planner.AnthropicPlanner().generate({...input,days:1}),/incomplete response/);
    }
  } finally {
    globalThis.fetch=originalFetch;
    delete context.env.ANTHROPIC_API_KEY; delete context.env.ANTHROPIC_MODEL; delete context.env.AI_MONTHLY_REQUEST_LIMIT;
  }
});
const platformHost='roamly.pb116.chatgpt.site';
function user(id='alice'){context.headers=new Headers({host:platformHost,'oai-authenticated-user-id':id,'oai-authenticated-user-email':id+'@example.test'});}

test('ChatGPT identity headers are ignored off chatgpt.site, where clients could forge them',async()=>{
  jar.clear();
  for(const host of [undefined,'roamly.panshulbh16.workers.dev','chatgpt.site.evil.test','evilchatgpt.site']){
    context.headers=new Headers({...(host?{host}:{}),'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@example.test'});
    assert.equal(await app.identity.currentUser(),null,host);
    assert.equal((await app.history.GET(req('/api/history',undefined,'GET'))).status,401);
    assert.equal((await app.platform.GET(req('/auth/platform?returnTo=%2Fhistory',undefined,'GET'))).status,404);
  }
  user('victim');assert.equal((await app.identity.currentUser()).id,'victim');
  context.headers=new Headers();
});
function req(path,data,method='POST'){return new Request(origin+path,{method,headers:{origin,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})})}
test('guests cannot read history and unavailable planning does not create history',async()=>{context.headers=new Headers();assert.equal((await app.history.GET(req('/api/history',undefined,'GET'))).status,401);assert.equal((await app.generate.POST(req('/api/generate',input))).status,503);assert.equal(sql.prepare('SELECT count(*) AS n FROM search_history').get().n,0)});
test('guest JSON and streamed generation work without history and respect daily limits',async()=>{
  const original=globalThis.fetch;
  context.headers=new Headers();
  Object.assign(context.env,{ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture',AI_MONTHLY_REQUEST_LIMIT:'100'});
  const itinerary={title:'Auckland',summary:'Harbour trip',days:[{title:'Day 1',activities:[{time:'Morning',title:'Walk',description:'Walk along the harbour',place:'Auckland'}]}],tips:[],destinationAdvice};
  let calls=0;
  globalThis.fetch=async(_,options)=>{calls++;return JSON.parse(options.body).stream?providerStream(JSON.stringify(itinerary)):Response.json({content:[{type:'text',text:JSON.stringify(itinerary)}]});};
  const before=sql.prepare('SELECT count(*) n FROM search_history').get().n;
  try {
    for(let i=0;i<5;i++) {
      const request=req('/api/generate',{...input,days:1});
      if(i===0)request.headers.set('accept','application/x-ndjson');
      const response=await app.generate.POST(request);assert.equal(response.status,200);
      const result=i===0?JSON.parse((await response.text()).trim().split('\n').at(-1)):await response.json();
      assert.equal(result.historyId,null);assert.deepEqual(result.trip.itinerary,itinerary);
    }
    assert.equal((await app.generate.POST(req('/api/generate',{...input,days:1}))).status,429);
    assert.equal(calls,5);
    assert.equal(sql.prepare('SELECT count(*) n FROM search_history').get().n,before);
    assert.equal((await app.trips.GET()).status,401);
  } finally {globalThis.fetch=original;for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_MODEL','AI_MONTHLY_REQUEST_LIMIT'])delete context.env[key];sql.exec('DELETE FROM usage');}
});
test('configured public Supabase values do not sign in a local visitor while auth is disabled',async()=>{
  context.headers=new Headers();
  Object.assign(context.env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-public-key',SUPABASE_AUTH_ENABLED:'false'});
  try {
    assert.equal(await app.identity.currentUser(),null);
    assert.equal((await app.email.POST(req('/api/auth/email',{email:'local@example.test'}))).status,503);
    assert.equal((await app.history.GET(req('/api/history',undefined,'GET'))).status,401);
    assert.equal(jar.size,0);
  } finally {
    delete context.env.SUPABASE_URL; delete context.env.SUPABASE_PUBLISHABLE_KEY; delete context.env.SUPABASE_AUTH_ENABLED;
  }
});
test('intake accepts the full supported matrix of trip choices',async()=>{
  user('matrix-user');
  const destinations=['Auckland','São Paulo, Brazil','Tokyo, Japan','Rome, Italy','Zürich, Switzerland'];
  const interests=[[],['Nature'],['Nature','Food','Culture','Adventure','Photography','Relaxation','History','Art']];
  let expected=0;
  for(const destination of destinations)
    for(const days of Array.from({length:10},(_,i)=>i+1))
      for(const travelers of [1,10])
        for(const budget of ['Budget','Comfort','Luxury'])
          for(const pace of ['Relaxed','Balanced','Packed'])
            for(const selected of interests){
              const response=await app.generate.POST(req('/api/generate',{destination,startDate:'',days,travelers,budget,pace,interests:selected,needs:'',homeCity:''}));
              assert.equal(response.status,503,`${destination}/${days}/${travelers}/${budget}/${pace}`);
              expected++;
            }
  const row=sql.prepare("SELECT count(*) AS n FROM search_history WHERE owner='matrix-user'").get();
  assert.equal(row.n,expected);
  user();
});
test('intake rejects every invalid boundary before creating history',async()=>{
  user('invalid-input-user');
  const base={destination:'Auckland',startDate:'',days:5,travelers:2,budget:'Comfort',pace:'Balanced',interests:['Nature'],needs:'',homeCity:''};
  const cases=[
    ['short destination',{destination:'A'}],['long destination',{destination:'A'.repeat(121)}],
    ['bad date',{startDate:'2026-02-30'}],['too few days',{days:0}],['too many days',{days:11}],['fractional days',{days:1.5}],
    ['too few travelers',{travelers:0}],['too many travelers',{travelers:11}],['bad budget',{budget:'Free'}],['bad pace',{pace:'Chaotic'}],
    ['too many interests',{interests:Array.from({length:9},(_,i)=>`i${i}`)}],['long interest',{interests:['x'.repeat(36)]}],
    ['long needs',{needs:'x'.repeat(601)}],['long home city',{homeCity:'x'.repeat(101)}],
  ];
  const before=sql.prepare("SELECT count(*) AS n FROM search_history WHERE owner='invalid-input-user'").get().n;
  for(const [label,change] of cases){
    const response=await app.generate.POST(req('/api/generate',{...base,...change}));
    assert.equal(response.status,400,label);
  }
  const after=sql.prepare("SELECT count(*) AS n FROM search_history WHERE owner='invalid-input-user'").get().n;
  assert.equal(after,before);
  user();
});
test('unknown destinations are rejected before AI usage and history storage',async()=>{
  user('unknown-destination-user');
  const before=sql.prepare("SELECT count(*) AS n FROM search_history WHERE owner='unknown-destination-user'").get().n;
  for(const destination of ['bkldfmlb','Tokyo / Kyoto','Café, Québec — 旅','constructor','hasOwnProperty']) {
    const response=await app.generate.POST(req('/api/generate',{...input,destination}));
    assert.equal(response.status,422);
    assert.match((await response.json()).error,/city, town, country, or continent/);
  }
  assert.equal(sql.prepare("SELECT count(*) AS n FROM search_history WHERE owner='unknown-destination-user'").get().n,before);
  user();
});
test('provider itineraries for every supported day count are accepted',async()=>{
  const originalFetch=globalThis.fetch;
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='fixture-model';
  context.env.AI_MONTHLY_REQUEST_LIMIT='100';
  globalThis.fetch=async(_url,options)=>{
    const request=JSON.parse(options.body);
    const requested=JSON.parse(request.messages[0].content).days;
    return Response.json({content:[{type:'text',text:JSON.stringify({
      title:`Day count ${requested}`,
      summary:'Fixture itinerary',
      days:Array.from({length:requested},(_,i)=>({title:`Day ${i+1}`,activities:[{time:'Morning',title:'Walk',description:'A short walk.',place:'Local area'}]})),
      tips:[],
      destinationAdvice,
    })}],stop_reason:'end_turn'});
  };
  try {
    for(const days of Array.from({length:10},(_,i)=>i+1)){
      user(`all-days-${days}`);
      const response=await app.generate.POST(req('/api/generate',{...input,days}));
      const result=await response.json();
      assert.equal(response.status,200,`day count ${days}`);
      assert.equal(result.trip.itinerary.days.length,days);
    }
  } finally {
    globalThis.fetch=originalFetch;
    delete context.env.ANTHROPIC_API_KEY; delete context.env.ANTHROPIC_MODEL; delete context.env.AI_MONTHLY_REQUEST_LIMIT;
    user();
  }
});
test('saved trips can be created, listed, replaced, and deleted through the API',async()=>{
  user('save-user');
  const trip=structuredClone(app.sample.sampleTrip);
  trip.id='6a2b8f2d-67f4-4f9c-a9fb-4f2f0d1e7a11';
  const created=await app.trips.POST(req('/api/trips',trip));
  assert.equal(created.status,200);
  assert.deepEqual(await (await app.trips.GET(req('/api/trips',undefined,'GET'))).json(),{trips:[trip]});
  const changed={...trip,itinerary:{...trip.itinerary,title:'Updated example'}};
  assert.equal((await app.trips.POST(req('/api/trips',changed))).status,200);
  assert.equal((await (await app.trips.GET(req('/api/trips',undefined,'GET'))).json()).trips[0].itinerary.title,'Updated example');
  assert.equal((await app.trips.DELETE(req('/api/trips',{id:trip.id},'DELETE'))).status,200);
  assert.deepEqual(await (await app.trips.GET(req('/api/trips',undefined,'GET'))).json(),{trips:[]});
  user();
});
test('waitlist join is authenticated and idempotent',async()=>{
  user('waitlist-user');
  assert.equal((await app.waitlist.POST(req('/api/waitlist',{}))).status,200);
  assert.equal((await app.waitlist.POST(req('/api/waitlist',{}))).status,200);
  const row=sql.prepare("SELECT owner,email FROM waitlist WHERE owner='waitlist-user'").get();
  assert.equal(row.owner,'waitlist-user');
  assert.equal(row.email,'waitlist-user@example.test');
  assert.equal(sql.prepare("SELECT count(*) AS n FROM waitlist WHERE owner='waitlist-user'").get().n,1);
  user();
});
let aucklandId;
test('Auckland followed by Austria retains both searches when AI is unavailable',async()=>{user();for(const destination of ['Auckland','Austria'])assert.equal((await app.generate.POST(req('/api/generate',{...input,destination}))).status,503);const r=await app.history.GET(req('/api/history',undefined,'GET'));assert.equal(r.status,200);const {entries}=await r.json();assert.equal(entries.length,2);assert.deepEqual(new Set(entries.map(x=>x.intake.destination)),new Set(['Auckland','Austria']));assert.ok(entries.every(x=>x.status==='failed'));aucklandId=entries.find(x=>x.intake.destination==='Auckland').id;const restored=await (await app.history.GET(req('/api/history?id='+aucklandId,undefined,'GET'))).json();assert.equal(restored.entry.intake.destination,'Auckland');assert.equal(restored.entry.intake.days,5)});
test('another user cannot list, fetch or delete the first account’s searches',async()=>{user('bob');assert.deepEqual((await (await app.history.GET(req('/api/history',undefined,'GET'))).json()).entries,[]);assert.equal((await app.history.GET(req('/api/history?id='+aucklandId,undefined,'GET'))).status,404);await app.history.DELETE(req('/api/history',{id:aucklandId},'DELETE'));user();assert.equal((await app.history.GET(req('/api/history?id='+aucklandId,undefined,'GET'))).status,200)});
test('completed results are persisted and can be reopened without another AI call',async()=>{user();const id=await app.repository.startSearch(context.env.DB,'alice',input);await app.repository.completeSearch(context.env.DB,'alice',id,app.sample.sampleTrip);const entry=await app.repository.findSearch(context.env.DB,'alice',id);assert.equal(entry.status,'completed');assert.deepEqual(entry.trip,app.sample.sampleTrip)});
test('pagination retains older searches and never crosses account boundaries',async()=>{for(let i=0;i<22;i++)await app.repository.startSearch(context.env.DB,'pagination-user',{...input,destination:'Search '+i});const first=await app.repository.historyPage(context.env.DB,'pagination-user');const second=await app.repository.historyPage(context.env.DB,'pagination-user',20);assert.equal(first.entries.length,20);assert.equal(first.hasMore,true);assert.equal(second.entries.length,2);assert.equal(second.hasMore,false);assert.equal(new Set([...first.entries,...second.entries].map(x=>x.id)).size,22)});
test('CSRF and malformed requests are rejected before history insertion',async()=>{user();const n=sql.prepare('SELECT count(*) AS n FROM search_history').get().n;const bad=new Request(origin+'/api/generate',{method:'POST',headers:{origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal((await app.generate.POST(bad)).status,403);assert.equal((await app.generate.POST(req('/api/generate',{...input,days:100}))).status,400);assert.equal(sql.prepare('SELECT count(*) AS n FROM search_history').get().n,n)});
test('unconfigured Google/email methods fail closed and cannot create sessions',async()=>{assert.equal((await app.google.POST(req('/api/auth/google',{}))).status,503);assert.equal((await app.email.POST(req('/api/auth/email',{email:'a@example.test'}))).status,503);assert.equal((await app.verify.POST(req('/api/auth/verify',{email:'a@example.test',token:'123456'}))).status,503);assert.equal(jar.size,0)});
test('sign-out immediately prevents platform fallback and protects history',async()=>{user();assert.ok(await app.identity.currentUser());assert.equal((await app.logout.POST(req('/api/auth/logout',{}))).status,200);assert.equal(await app.identity.currentUser(),null);assert.equal((await app.history.GET(req('/api/history',undefined,'GET'))).status,401);assert.equal(jar.get('roamly-signed-out').options.httpOnly,true);jar.clear()});
test('redirect destinations cannot escape the site or loop into authentication',()=>{for(const p of ['https://evil.test','//evil.test','/\\evil.test','/auth/callback','/api/auth/google','/signout-with-chatgpt','/\n/evil'])assert.equal(app.policy.safeReturnTo(p),'/');assert.equal(app.policy.safeReturnTo('/?history=abc'),'/?history=abc')});
test('callback without a valid OAuth code never authenticates',async()=>{const r=await app.callback.GET(req('/auth/callback',undefined,'GET'));assert.equal(r.status,303);assert.equal(new URL(r.headers.get('Location')).pathname,'/auth');assert.equal(jar.size,0)});
test('failed OAuth callback preserves the original safe destination for retry',async()=>{jar.clear();jar.set('roamly-auth-return',{value:'/history',options:{}});const r=await app.callback.GET(req('/auth/callback',undefined,'GET'));const location=new URL(r.headers.get('Location'));assert.equal(location.pathname,'/auth');assert.equal(location.searchParams.get('error'),'callback');assert.equal(location.searchParams.get('returnTo'),'/history');assert.equal(jar.has('roamly-auth-return'),false)});
const mockUser={id:'ccff879e-8be1-4b9b-95eb-3604734052a3',aud:'authenticated',role:'authenticated',email:'verified@example.test',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{full_name:'Test Explorer'},identities:[],created_at:new Date().toISOString()};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const fakeAccess=[encode({alg:'HS256',typ:'JWT'}),encode({sub:mockUser.id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aud:'authenticated',role:'authenticated'}),'fixture-signature'].join('.');
const fakeSession={access_token:fakeAccess,refresh_token:'fixture-refresh-not-a-real-secret',expires_in:3600,token_type:'bearer',user:mockUser};
const realFetch=globalThis.fetch;let calls=[];
function enableMockProvider(){context.env.SUPABASE_URL='https://fixture.supabase.co';context.env.SUPABASE_PUBLISHABLE_KEY='fixture-public-key';context.env.SUPABASE_AUTH_ENABLED='true';globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url);assert.equal(u.origin,'https://fixture.supabase.co');calls.push(u.pathname);const data=init?.body?JSON.parse(init.body):{};if(u.pathname.endsWith('/otp'))return Response.json({});if(u.pathname.endsWith('/verify'))return data.token==='123456'?Response.json(fakeSession):Response.json({msg:'Token has expired or is invalid',code:'otp_expired'},{status:403});if(u.pathname.endsWith('/user'))return Response.json(mockUser);if(u.pathname.endsWith('/token')){assert.ok(data.code_verifier);return Response.json(fakeSession)}if(u.pathname.endsWith('/logout'))return new Response(null,{status:204});throw Error('Unexpected provider endpoint');};}
test('null JSON bodies are rejected before auth provider calls',async()=>{jar.clear();enableMockProvider();user();assert.equal((await app.email.POST(req('/api/auth/email',null))).status,400);assert.equal((await app.google.POST(req('/api/auth/google',null))).status,400);assert.equal(calls.includes('/auth/v1/otp'),false);assert.equal(calls.includes('/auth/v1/authorize'),false);globalThis.fetch=realFetch;context.env.SUPABASE_AUTH_ENABLED='false';delete context.env.SUPABASE_URL;delete context.env.SUPABASE_PUBLISHABLE_KEY;jar.clear()});
test('platform handoff only clears external cookies on same-origin POST',async()=>{jar.clear();context.headers=new Headers({host:platformHost});jar.set('sb-test',{value:'session',options:{}});const get=await app.platform.GET(req('/auth/platform?returnTo=%2Fhistory',undefined,'GET'));assert.equal(get.status,303);assert.ok(jar.has('sb-test'));const hostile=new Request(origin+'/auth/platform?returnTo=%2Fhistory',{method:'POST',headers:{origin:'https://evil.test'}});assert.equal((await app.platform.POST(hostile)).status,403);assert.ok(jar.has('sb-test'));const post=await app.platform.POST(req('/auth/platform?returnTo=%2Fhistory',undefined,'POST'));assert.equal(post.status,303);assert.equal(jar.has('sb-test'),false);jar.clear()});
test('email OTP uses the real SDK and establishes a server-verified HttpOnly session with a mocked provider',async()=>{jar.clear();enableMockProvider();const sent=await app.email.POST(req('/api/auth/email',{email:mockUser.email}));assert.equal(sent.status,200);const bad=await app.verify.POST(req('/api/auth/verify',{email:mockUser.email,token:'000000'}));assert.equal(bad.status,400);assert.ok(!jar.get('roamly-auth-provider'));const good=await app.verify.POST(req('/api/auth/verify',{email:mockUser.email,token:'123456',returnTo:'/history'}));assert.equal(good.status,200);assert.equal((await good.json()).redirectTo,'/history');assert.equal((await app.identity.currentUser()).id,'supabase:'+mockUser.id);assert.ok(Array.from(jar).filter(([k])=>k.startsWith('sb-')).every(([,v])=>v.options.httpOnly===true));assert.ok(calls.includes('/auth/v1/verify'));assert.ok(calls.includes('/auth/v1/user'));});
test('Google start stores PKCE and callback exchanges its code with the mocked provider',async()=>{jar.clear();const start=await app.google.POST(req('/api/auth/google',{returnTo:'/history'}));assert.equal(start.status,200);const {url}=await start.json();const u=new URL(url);assert.equal(u.origin,'https://fixture.supabase.co');assert.equal(u.searchParams.get('provider'),'google');assert.equal(u.searchParams.get('code_challenge_method'),'s256');assert.ok(u.searchParams.get('code_challenge'));assert.ok(Array.from(jar.keys()).some(k=>k.includes('code-verifier')));const callback=await app.callback.GET(req('/auth/callback?code=fixture-code',undefined,'GET'));assert.equal(callback.status,303);assert.equal(callback.headers.get('Location'),origin+'/history');assert.equal((await app.identity.currentUser()).id,'supabase:'+mockUser.id);});
test('expired external identity cannot silently fall back to another platform account',async()=>{jar.clear();jar.set('roamly-auth-provider',{value:'supabase',options:{}});user();assert.equal(await app.identity.currentUser(),null);});
test('external sign-out revokes session through provider and clears cookies',async()=>{jar.clear();await app.verify.POST(req('/api/auth/verify',{email:mockUser.email,token:'123456'}));assert.equal((await app.logout.POST(req('/api/auth/logout',{}))).status,200);assert.equal(await app.identity.currentUser(),null);assert.ok(!Array.from(jar.keys()).some(k=>k.startsWith('sb-')));assert.ok(calls.includes('/auth/v1/logout'));globalThis.fetch=realFetch;context.env.SUPABASE_AUTH_ENABLED='false';jar.clear();});

test('share snapshots omit private fields, isolate owners, revoke links and follow trip deletion',async()=>{
  jar.clear();user('share-owner');
  const trip={...structuredClone(app.sample.sampleTrip),id:crypto.randomUUID()};
  trip.intake.needs='PRIVATE preferences';trip.intake.homeCity='PRIVATE home';
  const response=await app.shares.POST(req('/api/shares',trip));
  assert.equal(response.status,200);const {id}=await response.json();
  const row=sql.prepare('SELECT payload FROM trip_shares WHERE id=?').get(id);
  assert.doesNotMatch(row.payload,/PRIVATE|homeCity|needs|startDate|email|owner/);
  assert.equal(JSON.parse(row.payload).itinerary.title,trip.itinerary.title);
  user('other');
  assert.deepEqual((await(await app.shares.GET(req('/api/shares?tripId='+trip.id,undefined,'GET'))).json()).shares,[]);
  await app.shares.DELETE(req('/api/shares',{id},'DELETE'));
  assert.ok(sql.prepare('SELECT id FROM trip_shares WHERE id=?').get(id));
  context.headers=new Headers();assert.equal((await app.shares.POST(req('/api/shares',trip))).status,401);
  user('share-owner');
  await app.shares.DELETE(req('/api/shares',{id},'DELETE'));
  assert.equal(sql.prepare('SELECT id FROM trip_shares WHERE id=?').get(id),undefined);
  await app.shares.POST(req('/api/shares',trip));
  await app.trips.POST(req('/api/trips',trip));
  await app.trips.DELETE(req('/api/trips',{id:trip.id},'DELETE'));
  assert.equal(sql.prepare('SELECT count(*) n FROM trip_shares WHERE trip_id=?').get(trip.id).n,0);
});

test('single-day regeneration keeps original needs and date, rejects invalid days before spending',async()=>{
  const original=globalThis.fetch;user('day-editor');
  Object.assign(context.env,{ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture',AI_MONTHLY_REQUEST_LIMIT:'1000'});
  const trip=structuredClone(app.sample.sampleTrip);trip.intake.startDate='2026-12-31';
  try{
    globalThis.fetch=async(_,options)=>{const payload=JSON.parse(JSON.parse(options.body).messages[0].content);assert.equal(payload.days,1);assert.equal(payload.startDate,'2027-01-01');assert.equal(payload.needs,trip.intake.needs);assert.equal(payload.replacement.dayNumber,2);assert.ok(payload.replacement.otherDays.length);return Response.json({content:[{type:'text',text:JSON.stringify({...trip.itinerary,days:[trip.itinerary.days[1]],destinationAdvice})}]});};
    assert.equal((await app.regenerate.POST(req('/api/regenerate',{trip,day:99}))).status,400);
    assert.equal((await app.regenerate.POST(req('/api/regenerate',{trip,day:1}))).status,200);
    assert.equal(trip.itinerary.days.length,3);
  }finally{globalThis.fetch=original;for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_MODEL','AI_MONTHLY_REQUEST_LIMIT'])delete context.env[key];}
});

test('Razorpay Plus pass: currency by country, verified callback and webhook, idempotent grant, paid limits',async()=>{
  jar.clear();user('subscriber');const original=globalThis.fetch;
  const settings={RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'fixture',RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'webhook-fixture',RAZORPAY_INTERNATIONAL:'true',ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture',AI_MONTHLY_REQUEST_LIMIT:'10000'};
  Object.assign(context.env,settings);
  const created=[];let n=0;
  globalThis.fetch=async(url,options)=>{
    if(new URL(url).pathname!=='/v1/orders')throw Error('Unexpected billing path');
    const body=JSON.parse(options.body);created.push(body);return Response.json({id:'order_fixture'+(++n),amount:body.amount,currency:body.currency});
  };
  const sign=async(secret,text)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))).toString('hex');};
  const withCountry=(country)=>{const r=req('/api/billing/checkout',{});r.headers.set('cf-ipcountry',country);return r;};
  const now=()=>Math.floor(Date.now()/1000);
  try{
    assert.equal(app.billing.billingCurrency('US'),'USD');assert.equal(app.billing.billingCurrency('IN'),'INR');assert.equal(app.billing.billingCurrency(null),'INR');assert.equal(app.billing.billingCurrency('XX'),'INR');
    const inr=await (await app.checkout.POST(withCountry('IN'))).json();
    assert.deepEqual([inr.amount,inr.currency,inr.keyId],[49900,'INR','fixture']);assert.equal(created[0].notes.roamly_owner,'subscriber');
    const usd=await (await app.checkout.POST(withCountry('US'))).json();
    assert.deepEqual([usd.amount,usd.currency],[1000,'USD']);
    context.env.RAZORPAY_INTERNATIONAL='false';
    assert.equal((await (await app.checkout.POST(withCountry('US'))).json()).currency,'INR');
    context.env.RAZORPAY_INTERNATIONAL='true';
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    // Razorpay posts checkout's result as a form from its own site, and the buyer's browser follows the redirect back.
    const callback=async(body,headers={})=>{const r=await app.billingCallback.POST(new Request(origin+'/api/billing/callback',{method:'POST',headers:{origin:'https://api.razorpay.com',...headers},body}));assert.equal(r.status,303);return r.headers.get('location');};
    const returned=outcome=>origin+'/pricing?checkout='+outcome;
    // Forged, empty and malformed callbacks are rejected and grant nothing, but still bring the buyer back.
    assert.equal(await callback(new URLSearchParams({razorpay_order_id:inr.orderId,razorpay_payment_id:'pay_1',razorpay_signature:'0'.repeat(64)})),returned('unverified'));
    assert.equal(await callback(new URLSearchParams()),returned('unverified'));
    assert.equal(await callback(JSON.stringify({razorpay_order_id:inr.orderId}),{'Content-Type':'application/json'}),returned('unverified'));
    // A declined payment (redirect mode posts Razorpay's error fields) is reported as failed.
    assert.equal(await callback(new URLSearchParams({'error[code]':'BAD_REQUEST_ERROR','error[description]':'Payment failed','error[metadata]':JSON.stringify({order_id:inr.orderId,payment_id:'pay_0'})})),returned('failed'));
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    const signed=async(order,payment)=>new URLSearchParams({razorpay_order_id:order,razorpay_payment_id:payment,razorpay_signature:await sign(settings.RAZORPAY_KEY_SECRET,order+'|'+payment)});
    // Verified but storage failed: the buyer hears the payment arrived; the order stays open for the webhook.
    const spare=await (await app.checkout.POST(withCountry('IN'))).json(),batch=context.env.DB.batch;
    context.env.DB.batch=async()=>{throw Error('D1 unavailable');};
    try{assert.equal(await callback(await signed(spare.orderId,'pay_spare')),returned('pending'));}finally{context.env.DB.batch=batch;}
    assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(spare.orderId).status,'created');
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    // The cross-site POST carries no session cookie; a signed result grants to the order's owner, never to whoever is signed in.
    context.headers=new Headers();
    const good=await signed(inr.orderId,'pay_1');
    assert.equal(await callback(good),returned('activated'));
    user('someone-else');
    assert.equal(app.billing.hasPlus(await app.billing.membership('someone-else')),false);
    user('subscriber');
    const first=await app.billing.membership('subscriber');
    assert.equal(app.billing.hasPlus(first),true);assert.ok(Math.abs(first.current_end-(now()+30*86400))<5);
    // Replayed callback and webhook for the same order do not extend the pass.
    const event=JSON.stringify({event:'order.paid',payload:{order:{entity:{id:inr.orderId}},payment:{entity:{id:'pay_1'}}}});
    const bad=new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':'0'.repeat(64)},body:event});
    assert.equal((await app.webhook.POST(bad)).status,401);
    const hook=async body=>new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':await sign(settings.RAZORPAY_WEBHOOK_SECRET,body)},body});
    assert.equal((await app.webhook.POST(await hook(event))).status,200);
    assert.equal(await callback(good),returned('activated'));
    assert.equal((await app.billing.membership('subscriber')).current_end,first.current_end);
    // A second pass (via webhook only, tab closed) stacks on top of the first.
    assert.equal((await app.webhook.POST(await hook(JSON.stringify({event:'order.paid',payload:{order:{entity:{id:usd.orderId}},payment:{entity:{id:'pay_2'}}}})))).status,200);
    const second=await app.billing.membership('subscriber');
    assert.equal(second.current_end,first.current_end+30*86400);assert.equal(second.paid_count,2);
    const status=await (await app.billingStatus.GET()).json();assert.equal(status.plus,true);assert.equal(status.until,second.current_end);
    for(let i=0;i<20;i++)await app.planner.reserveUsage('subscriber');
    const exhausted=await (await app.billingStatus.GET()).json();
    assert.equal(exhausted.usage.remaining,0);assert.equal(exhausted.usage.used,20);
    assert.ok(Date.parse(exhausted.usage.resetsAt)>Date.now());
    user('usage-other');const isolated=await (await app.billingStatus.GET()).json();
    assert.equal(isolated.usage.limit,5);assert.equal(isolated.usage.remaining,5);user('subscriber');
    await assert.rejects(()=>app.planner.reserveUsage('subscriber'),e=>e.status===429);
    for(let i=0;i<5;i++)await app.planner.reserveUsage('free-subscriber');
    await assert.rejects(()=>app.planner.reserveUsage('free-subscriber'),e=>e.status===429);
    sql.prepare("UPDATE subscriptions SET current_end=? WHERE owner='subscriber'").run(now()-1);
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    // Checkout and status need the signed-in app itself; checkouts are capped per day; other webhook events grant nothing.
    const foreign=withCountry('IN');foreign.headers.set('origin','https://evil.test');assert.equal((await app.checkout.POST(foreign)).status,403);
    context.headers=new Headers();assert.equal((await app.checkout.POST(withCountry('IN'))).status,401);assert.equal((await app.billingStatus.GET()).status,401);
    user('checkout-spammer');const tries=[];for(let i=0;i<21;i++)tries.push((await app.checkout.POST(withCountry('IN'))).status);
    assert.deepEqual([tries.filter(s=>s===200).length,tries.at(-1)],[20,429],'the 21st checkout in a day is refused');
    const other=await (async()=>{user('webhook-other');return (await app.checkout.POST(withCountry('IN'))).json();})();
    const captured=JSON.stringify({event:'payment.captured',payload:{order:{entity:{id:other.orderId}},payment:{entity:{id:'pay_x'}}}});
    assert.equal((await app.webhook.POST(await hook(captured))).status,200);assert.equal(app.billing.hasPlus(await app.billing.membership('webhook-other')),false,'only order.paid grants');
    assert.equal((await app.webhook.POST(await hook(JSON.stringify({event:'order.paid',payload:{order:{entity:{id:'order_unknown'}},payment:{entity:{id:'pay_y'}}}})))).status,200);
    assert.equal(sql.prepare("SELECT count(*) n FROM subscriptions WHERE subscription_id='order_unknown'").get().n,0,'a signed event for an order Roamly never created grants nothing');
    user('subscriber');
    delete context.env.RAZORPAY_ENABLED;assert.equal((await app.checkout.POST(withCountry('IN'))).status,503);
  }finally{globalThis.fetch=original;for(const key of Object.keys(settings))delete context.env[key];}
});

test('Travel Together: Plus hosting, private drafts, requests, capacity and lifecycle',async()=>{
  const id=crypto.randomUUID(), date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const trip={id,title:'Bareilly to Nainital',hostName:'Public Host',city:'Bareilly, UP',destination:'Nainital',startDate:date,capacity:1,summary:'A relaxed trip. Estimate includes travel.',cost:4000,days:['Morning: depart. Afternoon: lake walk.'],meeting:'PRIVATE phone and exact meeting point'};
  const post=(action,extra={})=>app.together.POST(req('/api/together',{action,id,...extra}));
  const get=()=>app.together.GET(req('/api/together?id='+id,undefined,'GET'));
  const guest=()=>{context.headers=new Headers();};
  const plus=()=>sql.prepare("INSERT INTO subscriptions (owner,status,current_end,paid_count) VALUES (?,'active',?,1)").run('together-host',Math.floor(Date.now()/1000)+86400);
  try{
    guest();assert.equal((await post('save',{trip})).status,401);
    user('together-host');assert.equal((await post('save',{trip})).status,403);plus();
    const foreign=req('/api/together',{action:'save',id,trip});foreign.headers.set('origin','https://foreign.test');assert.equal((await app.together.POST(foreign)).status,403);
    for(const patch of [{capacity:0},{capacity:21},{days:Array(11).fill('x')},{startDate:'2026-02-30'},{startDate:'2020-01-01'},{cost:-1},{title:'  '},{city:''},{hostName:''},{meeting:'x'.repeat(2001)}])assert.equal((await post('save',{trip:{...trip,...patch}})).status,400);
    assert.equal((await post('save',{trip})).status,200);
    assert.equal((await post('save',{trip})).status,200,'retry saves same draft');
    guest();assert.equal((await get()).status,404);
    user('together-stranger');assert.equal((await post('publish')).status,404);
    user('together-host');assert.equal((await post('close')).status,409,'cannot make unpublished draft public by closing it');
    assert.equal((await post('publish')).status,200);
    assert.equal((await post('join',{name:'Host',message:'Joining my own trip'})).status,400);
    guest();let publicView=await (await get()).json();assert.equal(publicView.trip.meeting,undefined);assert.equal(publicView.trip.owner,undefined);assert.deepEqual(publicView.requests,[]);
    const list=await (await app.together.GET(req('/api/together?city=bareilly&destination=nain&date='+date,undefined,'GET'))).json();assert.ok(list.trips.some(t=>t.id===id));assert.ok(!JSON.stringify(list).includes('PRIVATE'));
    assert.equal((await app.together.GET(req('/api/together?mine=1',undefined,'GET'))).status,401);
    user('together-one');assert.equal((await post('join',{name:'One',message:'Love quiet lake walks'})).status,200);assert.equal((await post('join',{name:'One',message:'Love quiet lake walks'})).status,409);
    assert.equal((await post('approve',{member:'together-one'})).status,403);assert.equal((await post('meeting',{meeting:'hijack'})).status,403);
    assert.equal((await (await get()).json()).trip.meeting,undefined);
    user('together-two');assert.equal((await post('join',{name:'Two',message:'Would love to join you'})).status,200);
    user('together-host');let detail=await (await get()).json();assert.equal(detail.requests.length,2);
    // Hosts get a per-trip handle for each traveller, never their account ID, and only handles are accepted.
    assert.ok(!JSON.stringify(detail).includes('together-one')&&!JSON.stringify(detail).includes('together-two'));
    const handles=Object.fromEntries(detail.requests.map(q=>[q.name==='One'?'together-one':'together-two',q.member]));assert.match(handles['together-one'],/^[0-9a-f]{32}$/);
    assert.equal((await post('approve',{member:'together-one'})).status,400,'raw account IDs are refused');
    const approvals=await Promise.all([post('approve',{member:handles['together-one']}),post('approve',{member:handles['together-two']})]);assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
    const approved=sql.prepare("SELECT member FROM outing_requests WHERE trip_id=? AND status='approved'").get(id).member;
    // Published trips are editable; everyone who requested or joined is told, and places can't drop below approvals.
    sql.prepare("INSERT INTO subscriptions (owner,status,current_end,paid_count) VALUES ('together-stranger','active',?,1)").run(Math.floor(Date.now()/1000)+86400);
    user('together-stranger');assert.equal((await post('save',{trip:{...trip,title:'Hijacked'}})).status,409,'a Plus member cannot edit someone else’s trip');
    user('together-host');assert.equal((await post('save',{trip:{...trip,title:'Nainital, slower',days:['Lake walk','']}})).status,200);
    assert.equal(sql.prepare("SELECT count(*) n FROM notifications WHERE trip_id=? AND type='trip_updated'").get(id).n,2);
    assert.equal(sql.prepare("SELECT status FROM outings WHERE id=?").get(id).status,'open','editing keeps it published');
    guest();assert.deepEqual((await (await get()).json()).trip.days,['Lake walk'],'empty days are dropped');
    user(approved);detail=await (await get()).json();assert.equal(detail.trip.meeting,trip.meeting);assert.deepEqual(detail.requests,[]);
    assert.equal((await post('report',{reason:'A concern that should stay private'})).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM outing_reports WHERE trip_id=?').get(id).n,1);
    user('together-host');sql.prepare("UPDATE subscriptions SET current_end=0 WHERE owner='together-host'").run();
    assert.equal((await post('meeting',{meeting:'Updated private note'})).status,200,'expired host can coordinate');
    assert.equal((await post('remove',{member:handles[approved]})).status,200,'expired host can remove');
    user(approved);assert.equal((await (await get()).json()).trip.meeting,undefined);
    user('together-host');assert.equal((await post('close')).status,200);assert.equal((await post('publish')).status,403,'expired host cannot republish');
    const other=approved==='together-one'?'together-two':'together-one';assert.equal((await post('approve',{member:handles[other]})).status,409);
    assert.equal((await post('cancel')).status,200);assert.equal((await (await get()).json()).trip.status,'cancelled');
    user('together-host');sql.prepare("UPDATE subscriptions SET current_end=? WHERE owner='together-host'").run(Math.floor(Date.now()/1000)+86400);assert.equal((await post('save',{trip})).status,409,'cancelled trips cannot be edited');
    user(other);assert.equal((await post('withdraw')).status,200);assert.equal((await (await get()).json()).trip.requestStatus,'withdrawn');
  } finally {
    sql.prepare('DELETE FROM outing_reports WHERE trip_id=?').run(id);sql.prepare('DELETE FROM outing_requests WHERE trip_id=?').run(id);sql.prepare('DELETE FROM outings WHERE id=?').run(id);sql.prepare("DELETE FROM subscriptions WHERE owner IN ('together-host','together-stranger')").run();sql.prepare('DELETE FROM notifications WHERE trip_id=?').run(id);guest();
  }
});

test('Together: publish straight from the editor with only the basics',async()=>{
  const id=crypto.randomUUID(), date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const basics={id,title:'Weekend in the hills',hostName:'Ana',city:'Delhi',destination:'Mussoorie',startDate:date,capacity:3,summary:'',cost:0,days:[''],meeting:''};
  sql.prepare("INSERT INTO subscriptions (owner,status,current_end,paid_count) VALUES ('quick-host','active',?,1)").run(Math.floor(Date.now()/1000)+86400);
  try {
    user('quick-host');
    assert.equal((await app.together.POST(req('/api/together',{action:'save',id,trip:basics,publish:true}))).status,200);
    context.headers=new Headers();const view=await (await app.together.GET(req('/api/together?id='+id,undefined,'GET'))).json();
    assert.equal(view.trip.status,'open');assert.deepEqual(view.trip.days,[]);assert.equal(view.trip.summary,'');
  } finally {sql.prepare('DELETE FROM outings WHERE id=?').run(id);sql.prepare("DELETE FROM subscriptions WHERE owner='quick-host'").run();context.headers=new Headers();}
});

const SEAL_KEY=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
for(const sealed of [false,true])test(`Together email invites${sealed?' with data sealed at rest':''}: host-only, hold places, sign the guest in once and add them to the trip`,async()=>{
  if(sealed)context.env.DATA_ENCRYPTION_KEY=SEAL_KEY;
  const id=crypto.randomUUID(), date=new Date(Date.now()+86400000).toISOString().slice(0,10), original=globalThis.fetch;
  const trip={id,title:'Lake weekend <b>',hostName:'Ana',city:'Delhi',destination:'Nainital',startDate:date,capacity:2,summary:'',cost:0,days:[],meeting:'Meet at gate 2'};
  const post=(action,extra={})=>app.together.POST(req('/api/together',{action,id,...extra}));
  const accept=token=>app.inviteAccept.POST(req('/api/together/invite',{token}));
  const settings={RESEND_API_KEY:'re_test',EMAIL_FROM:'Roamly <roamly@example.test>',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_URL:'https://sb.test/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_AUTH_ENABLED:'true'};
  const mails=[], guests={};
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url), body=options.body?JSON.parse(options.body):{};
    if(u.host==='api.resend.com'){mails.push(body);return Response.json({id:'email_'+mails.length});}
    if(u.pathname==='/auth/v1/admin/generate_link'){guests[body.email]??=crypto.randomUUID();return Response.json({id:guests[body.email],email:body.email,aud:'authenticated',action_link:'x',email_otp:'123456',hashed_token:'hash:'+body.email,redirect_to:'',verification_type:'magiclink'});}
    if(u.pathname==='/auth/v1/verify'){const email=body.token_hash.slice(5);return Response.json({access_token:'at',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'rt',user:{id:guests[email],email,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});}
    throw Error('Unexpected request '+url);
  };
  const tokenFor=email=>mails.findLast(m=>m.to===email).text.match(/\?t=([A-Za-z0-9_-]+)/)[1];
  sql.prepare("INSERT INTO subscriptions (owner,status,current_end,paid_count) VALUES ('invite-host','active',?,1)").run(Math.floor(Date.now()/1000)+86400);
  try{
    jar.clear();user('invite-host');assert.equal((await post('save',{trip,publish:true})).status,200);
    assert.equal((await post('invite',{emails:['a@x.test']})).status,503,'needs email + Supabase admin configured');
    Object.assign(context.env,settings);
    user('invite-stranger');assert.equal((await post('invite',{emails:['a@x.test']})).status,403);
    user('invite-host');
    assert.equal((await post('invite',{emails:['not-an-email']})).status,400);
    assert.equal((await post('invite',{emails:['a@x.test','b@x.test','c@x.test']})).status,409,'three invites cannot fit two places');
    const sent=await post('invite',{emails:['A@x.test','b@x.test']});assert.equal(sent.status,200);assert.equal((await sent.json()).sent,2);
    assert.deepEqual(mails.map(m=>m.to),['a@x.test','b@x.test']);assert.equal(mails[0].from,settings.EMAIL_FROM);
    assert.ok(mails[0].html.includes('Lake weekend &lt;b&gt;'),'trip text is escaped in the email');
    assert.equal((await post('invite',{emails:['c@x.test']})).status,409,'unaccepted invites hold their places');
    assert.equal(sql.prepare('SELECT count(*) n FROM outing_invites WHERE trip_id=? AND token_hash LIKE ?').get(id,'%'+tokenFor('a@x.test')+'%').n,0,'only a hash of the token is stored');
    let detail=await (await app.together.GET(req('/api/together?id='+id,undefined,'GET'))).json();assert.deepEqual(detail.invites.map(i=>i.status),['sent','sent']);
    context.headers=new Headers();jar.clear();
    assert.equal((await accept('x'.repeat(43))).status,409,'unknown token');
    const joined=await accept(tokenFor('a@x.test'));assert.equal(joined.status,200);assert.equal((await joined.json()).redirectTo,'/together?trip='+id);
    const member='supabase:'+guests['a@x.test'];
    assert.equal(sql.prepare('SELECT status FROM outing_requests WHERE trip_id=? AND member=?').get(id,member).status,'approved');
    assert.ok([...jar.keys()].some(k=>k.startsWith('sb-')),'the guest is signed in');assert.equal(jar.get('roamly-auth-provider').value,'supabase');
    assert.equal(sql.prepare("SELECT count(*) n FROM notifications WHERE recipient='invite-host' AND trip_id=? AND type='invite_accepted'").get(id).n,1);
    assert.equal((await accept(tokenFor('a@x.test'))).status,409,'each link works once');
    if(sealed){
      const stored=sql.prepare('SELECT email,email_key FROM outing_invites WHERE trip_id=?').all(id);
      assert.ok(stored.every(r=>r.email.startsWith('enc1:')&&r.email_key.startsWith('k1:')),'invite emails are sealed, matched by keyed hash');
      assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM outing_requests WHERE trip_id=?').all(id)).includes('Joined by invitation'),'join details are sealed');
      assert.ok(sql.prepare('SELECT payload FROM outings WHERE id=?').get(id).payload.startsWith('enc1:'));
    }
    sql.prepare("UPDATE outing_invites SET expires_at=1 WHERE trip_id=? AND email_key=?").run(id,await app.vault.lookupKey('b@x.test'));
    assert.equal((await accept(tokenFor('b@x.test'))).status,409,'expired links are refused');
    jar.clear();user('invite-host');mails.length=0;assert.equal((await (await post('invite',{emails:['a@x.test','b@x.test']})).json()).sent,1,'joined guests are not re-invited; expired ones get a fresh link');
    context.headers=new Headers();jar.clear();assert.equal((await accept(tokenFor('b@x.test'))).status,200,'resent link works');
  } finally {
    globalThis.fetch=original;for(const k of Object.keys(settings))delete context.env[k];delete context.env.DATA_ENCRYPTION_KEY;jar.clear();context.headers=new Headers();
    for(const t of ['notifications','outing_invites','outing_requests'])sql.prepare(`DELETE FROM ${t} WHERE trip_id=?`).run(id);
    sql.prepare('DELETE FROM outings WHERE id=?').run(id);sql.prepare("DELETE FROM subscriptions WHERE owner='invite-host'").run();
  }
});

test('discarding a private Together draft never exposes it',async()=>{
  const id=crypto.randomUUID();user('draft-host');
  sql.prepare("INSERT INTO outings (id,owner,city,destination,start_date,capacity,payload,meeting,created_at) VALUES (?,?,'Bareilly','Nainital','2099-01-01',1,'{}','secret','today')").run(id,'draft-host');
  try {
    assert.equal((await app.together.POST(req('/api/together',{id,action:'cancel'}))).status,200);
    context.headers=new Headers();assert.equal((await app.together.GET(req('/api/together?id='+id,undefined,'GET'))).status,404);
  } finally {sql.prepare('DELETE FROM outings WHERE id=?').run(id);}
});

test('notification API isolates accounts, pages tied timestamps and marks read idempotently',async()=>{
 assert.ok(app.notifications,'notification route must be exported');
 const get=(q='')=>app.notifications.GET(req('/api/notifications'+q,undefined,'GET'));
 const mark=id=>app.notifications.POST(req('/api/notifications',{id}));
 const stamp='2026-09-25T00:00:00.000Z';
 for(let i=1;i<=25;i++)sql.prepare('INSERT INTO notifications(id,recipient,trip_id,type,created_at) VALUES (?,?,?,?,?)').run(i.toString(16).padStart(32,'0'),'notify-alice','trip','request_approved',stamp);
 const foreign='f'.repeat(32);sql.prepare("INSERT INTO notifications(id,recipient,trip_id,type) VALUES (?,'notify-bob','trip','trip_cancelled')").run(foreign);
 try{
  context.headers=new Headers();assert.equal((await get()).status,401);assert.equal((await mark(foreign)).status,401);
  user('notify-alice');let response=await get();assert.equal(response.headers.get('Cache-Control'),'private, no-store');let first=await response.json();assert.equal(first.items.length,20);assert.equal(first.unreadCount,25);assert.ok(first.nextCursor);
  assert.ok(first.items.every(n=>!('recipient' in n)&&!('meeting' in n)));
  const second=await(await get('?cursor='+encodeURIComponent(first.nextCursor))).json();assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(n=>n.id)).size,25);
  assert.equal((await get('?cursor=broken')).status,400);assert.equal((await get('?cursor='+encodeURIComponent(JSON.stringify({createdAt:stamp,id:'bad'})))).status,400);
  assert.equal((await mark(foreign)).status,404);assert.equal((await mark('bad')).status,400);
  const request=req('/api/notifications',{id:first.items[0].id});request.headers.set('origin','https://foreign.test');assert.equal((await app.notifications.POST(request)).status,403);
  assert.equal((await mark(first.items[0].id)).status,200);const readAt=sql.prepare('SELECT read_at FROM notifications WHERE id=?').get(first.items[0].id).read_at;
  assert.equal((await mark(first.items[0].id)).status,200);assert.equal(sql.prepare('SELECT read_at FROM notifications WHERE id=?').get(first.items[0].id).read_at,readAt);
  assert.equal((await(await get()).json()).unreadCount,24);
  user('notify-bob');assert.equal((await(await get()).json()).items.length,1);
 }finally{sql.exec("DELETE FROM notifications WHERE recipient IN ('notify-alice','notify-bob')");context.headers=new Headers();}
});

test('personal data is sealed at rest, served in the clear, and old plaintext rows are sealed without side effects',async()=>{
  const trip=structuredClone(app.sample.sampleTrip);trip.id=crypto.randomUUID();trip.intake.needs='PRIVATE: wheelchair access';
  const outing=crypto.randomUUID(), legacyTrip=crypto.randomUUID(), date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const plan={id:outing,title:'Sealed trip',hostName:'Hosted',city:'Delhi',destination:'Agra',startDate:date,capacity:3,summary:'Secret summary',cost:0,days:['Day one'],meeting:'PRIVATE meeting point'};
  const together=(action,extra={})=>app.together.POST(req('/api/together',{action,id:outing,...extra}));
  const raw=(q,...a)=>JSON.stringify(sql.prepare(q).all(...a));
  sql.prepare("INSERT INTO subscriptions (owner,status,current_end,paid_count) VALUES ('seal-host','active',?,1)").run(Math.floor(Date.now()/1000)+86400);
  try{
    // No key: nothing changes, and a value that merely looks sealed still round-trips.
    assert.equal(await app.vault.seal('plain','t.f'),'plain');
    assert.equal(await app.vault.unseal(await app.vault.seal('enc1:not really','t.f'),'t.f'),'enc1:not really');
    context.env.DATA_ENCRYPTION_KEY='too-short';await assert.rejects(()=>app.vault.seal('x','t.f'),e=>e.status===503,'a malformed key fails closed');
    context.env.DATA_ENCRYPTION_KEY=SEAL_KEY;
    const box=await app.vault.seal('hello','t.f');assert.match(box,/^enc1:/);assert.equal(await app.vault.seal('hello','t.f'),box,'deterministic, so unchanged data keeps its ciphertext');
    assert.notEqual(await app.vault.seal('hello','t.g'),box);assert.equal(await app.vault.unseal(box,'t.f'),'hello');
    await assert.rejects(()=>app.vault.unseal(box,'t.g'),e=>e.status===503,'bound to its column');
    await assert.rejects(()=>app.vault.unseal(box.slice(0,-2)+(box.endsWith('A')?'B':'A')+box.slice(-1),'t.f'),e=>e.status===503,'tampering is detected');
    // Saved trips, share snapshots, search history and the waitlist are ciphertext in D1 but whole through the API.
    user('seal-owner');
    assert.equal((await app.trips.POST(req('/api/trips',trip))).status,200);
    assert.ok(!raw('SELECT payload FROM trips WHERE id=?',trip.id).includes('PRIVATE'));
    assert.equal((await (await app.trips.GET()).json()).trips.find(t=>t.id===trip.id).intake.needs,trip.intake.needs);
    const share=await (await app.shares.POST(req('/api/shares',trip))).json();
    assert.match(sql.prepare('SELECT payload FROM trip_shares WHERE id=?').get(share.id).payload,/^enc1:/);
    const search=await app.repository.startSearch(context.env.DB,'seal-owner',trip.intake);await app.repository.completeSearch(context.env.DB,'seal-owner',search,trip);
    assert.ok(!raw('SELECT intake,trip FROM search_history WHERE id=?',search).includes('PRIVATE'));
    assert.equal((await app.repository.findSearch(context.env.DB,'seal-owner',search)).intake.needs,trip.intake.needs);
    assert.equal((await app.waitlist.POST(req('/api/waitlist',{}))).status,200);
    assert.match(sql.prepare("SELECT email FROM waitlist WHERE owner='seal-owner'").get().email,/^enc1:/);
    // Together: plan, meeting point and join requests are sealed; unchanged re-saves don't notify anyone.
    user('seal-host');assert.equal((await together('save',{trip:plan,publish:true})).status,200);
    user('seal-guest');assert.equal((await together('join',{name:'Guest Name',message:'PRIVATE hello there'})).status,200);
    assert.ok(!raw('SELECT * FROM outings WHERE id=?',outing).match(/Secret|PRIVATE/)&&!raw('SELECT * FROM outing_requests WHERE trip_id=?',outing).match(/Guest|PRIVATE/));
    user('seal-host');const view=await (await app.together.GET(req('/api/together?id='+outing,undefined,'GET'))).json();
    assert.equal(view.trip.summary,'Secret summary');assert.equal(view.trip.meeting,plan.meeting);assert.equal(view.requests[0].name,'Guest Name');
    const notes=()=>sql.prepare('SELECT count(*) n FROM notifications WHERE trip_id=? AND type IN (?,?)').get(outing,'trip_updated','meeting_updated').n;
    assert.equal((await together('save',{trip:plan})).status,200);assert.equal(notes(),0,'re-saving the same trip is not an update');
    assert.equal((await together('save',{trip:{...plan,summary:'Changed'}})).status,200);assert.equal(notes(),1,'a real edit still notifies');
    // Rows stored before the key existed stay readable, and the sweep seals them silently.
    sql.prepare("INSERT INTO trips (id,owner,payload,created_at) VALUES (?,'seal-owner',?,?)").run(legacyTrip,JSON.stringify({...trip,id:legacyTrip}),new Date().toISOString());
    sql.prepare('UPDATE outings SET payload=?,meeting=? WHERE id=?').run(JSON.stringify({...plan,summary:'Legacy'}),'Legacy meeting',outing);
    sql.prepare("INSERT INTO outing_invites (id,trip_id,email,token_hash,created_at,expires_at) VALUES (?,?,'legacy@x.test','h',?,?)").run(crypto.randomUUID(),outing,new Date().toISOString(),Math.floor(Date.now()/1000)+3600);
    user('seal-owner');assert.ok((await (await app.trips.GET()).json()).trips.some(t=>t.id===legacyTrip));
    const before=notes();let swept=0,batch=0,runs=0;
    do{batch=await app.backfill.sealLegacyData();swept+=batch;}while(batch>0&&++runs<100);
    assert.ok(swept>=4);assert.equal(batch,0,'batches continue until nothing is left');assert.equal(notes(),before,'sealing old rows notifies no one');
    for(const [t,c] of [['trips','payload'],['outings','payload'],['outings','meeting'],['outing_invites','email']])
      assert.equal(sql.prepare(`SELECT count(*) n FROM ${t} WHERE ${c} NOT LIKE 'enc1:%'`).get().n,0,`${t}.${c} fully sealed`);
    assert.match(sql.prepare('SELECT email_key FROM outing_invites WHERE trip_id=?').get(outing).email_key,/^k1:/);
    user('seal-host');assert.equal((await (await app.together.GET(req('/api/together?id='+outing,undefined,'GET'))).json()).trip.meeting,'Legacy meeting');
    // Losing the key makes sealed data unavailable rather than wrong.
    delete context.env.DATA_ENCRYPTION_KEY;user('seal-owner');assert.equal((await app.trips.GET()).status,503);
  } finally {
    delete context.env.DATA_ENCRYPTION_KEY;context.headers=new Headers();
    for(const q of ["DELETE FROM trips WHERE owner='seal-owner'","DELETE FROM trip_shares WHERE owner='seal-owner'","DELETE FROM search_history WHERE owner='seal-owner'","DELETE FROM waitlist WHERE owner='seal-owner'","DELETE FROM subscriptions WHERE owner='seal-host'"])sql.exec(q);
    for(const t of ['notifications','outing_invites','outing_requests'])sql.prepare(`DELETE FROM ${t} WHERE trip_id=?`).run(outing);
    sql.prepare('DELETE FROM outings WHERE id=?').run(outing);
  }
});

test('Plus receipts and refunds: one receipt per purchase, a full refund takes back exactly its 30 days',async()=>{
  jar.clear();user('refund-buyer');const original=globalThis.fetch;
  const settings={RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'fixture',RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'webhook-fixture',RESEND_API_KEY:'re_test',EMAIL_FROM:'Roamly <billing@example.test>',DATA_ENCRYPTION_KEY:SEAL_KEY};
  Object.assign(context.env,settings);
  const mails=[];let n=0,resendDown=false;
  globalThis.fetch=async(url,options)=>{
    const u=new URL(url),body=JSON.parse(options.body);
    if(u.host==='api.resend.com'){if(resendDown)return new Response('down',{status:500});mails.push(body);return Response.json({id:'email_'+mails.length});}
    if(u.pathname==='/v1/orders')return Response.json({id:'order_refund'+(++n)+Date.now(),amount:body.amount,currency:body.currency});
    throw Error('Unexpected request '+url);
  };
  const sign=async(secret,text)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))).toString('hex');};
  const buy=async()=>{const r=req('/api/billing/checkout',{});r.headers.set('cf-ipcountry','IN');return (await app.checkout.POST(r)).json();};
  const pay=async(order,payment)=>(await app.billingCallback.POST(new Request(origin+'/api/billing/callback',{method:'POST',headers:{origin:'https://api.razorpay.com'},body:new URLSearchParams({razorpay_order_id:order,razorpay_payment_id:payment,razorpay_signature:await sign(settings.RAZORPAY_KEY_SECRET,order+'|'+payment)})}))).headers.get('location');
  const hook=async event=>{const body=JSON.stringify(event);return app.webhook.POST(new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':await sign(settings.RAZORPAY_WEBHOOK_SECRET,body)},body}));};
  const refund=(order,payment,status='full',refunded=49900,email)=>({event:'refund.processed',payload:{refund:{entity:{id:'rfnd_'+payment,amount:refunded,payment_id:payment,status:'processed'}},payment:{entity:{id:payment,order_id:order,amount:49900,amount_refunded:refunded,refund_status:status,email}}}});
  const pass=()=>sql.prepare("SELECT current_end,paid_count FROM subscriptions WHERE owner='refund-buyer'").get();
  const day=s=>new Date(s*1000).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  try{
    // A purchase sends one receipt, however many times Razorpay reports it.
    const a=await buy();
    assert.match(sql.prepare('SELECT email FROM orders WHERE id=?').get(a.orderId).email,/^enc1:/,'the receipt address is sealed');
    assert.equal(await pay(a.orderId,'pay_a'),origin+'/pricing?checkout=activated');
    await pay(a.orderId,'pay_a');
    assert.equal((await hook({event:'order.paid',payload:{order:{entity:{id:a.orderId}},payment:{entity:{id:'pay_a'}}}})).status,200);
    assert.equal(mails.length,1,'callback + replay + webhook = one receipt');
    const first=pass(),receipt=mails[0];
    assert.equal(receipt.to,'refund-buyer@example.test');assert.equal(receipt.from,settings.EMAIL_FROM);assert.equal(receipt.subject,'Your Roamly Plus receipt');
    for(const part of ['₹499.00',a.orderId,'pay_a',day(first.current_end),'not a tax invoice'])assert.ok(receipt.text.includes(part)&&receipt.html.includes(part),part);
    assert.ok(receipt.html.includes(origin+'/pricing'));
    // A second pass stacks, via the webhook alone.
    const b=await buy();
    assert.equal((await hook({event:'order.paid',payload:{order:{entity:{id:b.orderId}},payment:{entity:{id:'pay_b'}}}})).status,200);
    assert.equal(mails.length,2);const stacked=pass();assert.deepEqual([stacked.paid_count,stacked.current_end],[2,first.current_end+30*86400]);
    // Refunds: unsigned, partial, mismatched and unknown ones change nothing.
    assert.equal((await app.webhook.POST(new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':'0'.repeat(64)},body:JSON.stringify(refund(b.orderId,'pay_b'))}))).status,401);
    assert.equal((await hook(refund(b.orderId,'pay_b','partial',10000))).status,200);
    assert.equal((await hook(refund(b.orderId,'pay_a'))).status,200,'payment of a different order');
    assert.equal((await hook(refund('order_unknown','pay_x'))).status,200);
    assert.deepEqual(pass(),stacked);assert.equal(mails.length,2);
    // A full refund takes back exactly that pass's 30 days, once, and says so.
    assert.equal((await hook(refund(b.orderId,'pay_b'))).status,200);
    assert.equal((await hook(refund(b.orderId,'pay_b'))).status,200,'replayed');
    assert.deepEqual({...pass()},{current_end:first.current_end,paid_count:1});
    assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(b.orderId).status,'refunded');
    assert.equal(mails.length,3);assert.equal(mails[2].subject,'Your Roamly Plus refund');
    assert.ok(mails[2].text.includes('₹499.00')&&mails[2].text.includes('active until '+day(first.current_end)),'the other pass stays');
    assert.equal((await (await app.billingStatus.GET()).json()).plus,true);
    // Refunding the last pass ends Plus.
    assert.equal((await hook(refund(a.orderId,'pay_a'))).status,200);
    assert.equal(pass().paid_count,0);assert.equal((await (await app.billingStatus.GET()).json()).plus,false);
    assert.ok(mails[3].text.includes('Plus: ended'));
    // Email trouble never blocks a payment, and orders from before receipts (no address) just skip it.
    resendDown=true;const c=await buy();assert.equal(await pay(c.orderId,'pay_c'),origin+'/pricing?checkout=activated');
    assert.equal(pass().paid_count,1,'granted although the receipt failed');resendDown=false;
    const legacy=await buy();sql.prepare('UPDATE orders SET email=NULL WHERE id=?').run(legacy.orderId);
    assert.equal(await pay(legacy.orderId,'pay_legacy'),origin+'/pricing?checkout=activated');assert.equal(mails.length,4);
    // Refunding such an order still sends the notice, to the address Razorpay says paid; the stored one wins when present.
    assert.equal((await hook(refund(legacy.orderId,'pay_legacy','full',49900,'payer@example.test'))).status,200);
    assert.equal(mails.length,5);assert.equal(mails[4].to,'payer@example.test');assert.equal(mails[4].subject,'Your Roamly Plus refund');
    const legacy2=await buy();sql.prepare('UPDATE orders SET email=NULL WHERE id=?').run(legacy2.orderId);await pay(legacy2.orderId,'pay_legacy2');
    assert.equal((await hook(refund(legacy2.orderId,'pay_legacy2','full',49900,'a@b.test\nBcc: x@y.test'))).status,200);
    assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(legacy2.orderId).status,'refunded','refund stands without a usable address');
    assert.equal(mails.length,5,'a malformed address gets nothing');
    const d=await buy();await pay(d.orderId,'pay_d');assert.equal(mails.length,6);
    await hook(refund(d.orderId,'pay_d','full',49900,'someone-else@example.test'));
    assert.equal(mails[6].to,'refund-buyer@example.test','the stored address wins over the event');
  } finally {
    globalThis.fetch=original;for(const k of Object.keys(settings))delete context.env[k];context.headers=new Headers();
    sql.exec("DELETE FROM orders WHERE owner='refund-buyer'");sql.exec("DELETE FROM subscriptions WHERE owner='refund-buyer'");sql.exec("DELETE FROM usage WHERE key LIKE 'checkout:refund-buyer:%'");
  }
});
