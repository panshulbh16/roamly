import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
const sql=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
class Statement{constructor(q,values=[]){this.q=q;this.values=values}bind(...values){return new Statement(this.q,values)}async first(){return sql.prepare(this.q).get(...this.values)??null}async all(){return {results:sql.prepare(this.q).all(...this.values),success:true,meta:{}}}async run(){sql.prepare(this.q).run(...this.values);return {success:true,results:[],meta:{}}}}
const jar=new Map();const context={env:{DB:{prepare:q=>new Statement(q)}},headers:new Headers(),jar,redirect:p=>{throw Error('REDIRECT:'+p)}};
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
function user(id='alice'){context.headers=new Headers({'oai-authenticated-user-id':id,'oai-authenticated-user-email':id+'@example.test'});}
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
test('platform handoff only clears external cookies on same-origin POST',async()=>{jar.clear();jar.set('sb-test',{value:'session',options:{}});const get=await app.platform.GET(req('/auth/platform?returnTo=%2Fhistory',undefined,'GET'));assert.equal(get.status,303);assert.ok(jar.has('sb-test'));const hostile=new Request(origin+'/auth/platform?returnTo=%2Fhistory',{method:'POST',headers:{origin:'https://evil.test'}});assert.equal((await app.platform.POST(hostile)).status,403);assert.ok(jar.has('sb-test'));const post=await app.platform.POST(req('/auth/platform?returnTo=%2Fhistory',undefined,'POST'));assert.equal(post.status,303);assert.equal(jar.has('sb-test'),false);jar.clear()});
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

test('Razorpay checkout verifies price, reuses subscriptions, verifies signed webhooks and enforces paid limits',async()=>{
  jar.clear();user('subscriber');const original=globalThis.fetch;
  const settings={RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'fixture',RAZORPAY_KEY_SECRET:'fixture',RAZORPAY_PLAN_ID:'plan_fixture',RAZORPAY_WEBHOOK_SECRET:'webhook-fixture',ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture',AI_MONTHLY_REQUEST_LIMIT:'10000'};
  Object.assign(context.env,settings);
  let amount=49900,creates=0,cancels=0;
  let sub={id:'sub_fixture',plan_id:'plan_fixture',status:'created',paid_count:0,current_end:null,quantity:1,short_url:'https://rzp.io/test'};
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/v1/plans/plan_fixture')return Response.json({id:'plan_fixture',period:'monthly',interval:1,item:{amount,currency:'INR'}});
    if(path==='/v1/subscriptions'){creates++;return Response.json(sub);}
    if(path==='/v1/subscriptions/sub_fixture/cancel'){cancels++;assert.equal(JSON.parse(options.body).cancel_at_cycle_end,true);return Response.json(sub);}
    if(path==='/v1/subscriptions/sub_fixture')return Response.json(sub);
    throw Error('Unexpected billing path');
  };
  try{
    amount=50000;assert.equal((await app.checkout.POST(req('/api/billing/checkout',{}))).status,503);assert.equal(creates,0);
    amount=49900;
    assert.equal((await app.checkout.POST(req('/api/billing/checkout',{}))).status,200);
    assert.equal((await app.checkout.POST(req('/api/billing/checkout',{}))).status,200);assert.equal(creates,1);
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    const event=JSON.stringify({payload:{subscription:{entity:{id:'sub_fixture',status:'active'}}}});
    const bad=new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':'0'.repeat(64)},body:event});
    assert.equal((await app.webhook.POST(bad)).status,401);
    sub={...sub,status:'active',paid_count:1,current_end:Math.floor(Date.now()/1000)+3600};
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(settings.RAZORPAY_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(event))).toString('hex');
    const webhook=()=>new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':signature},body:event});
    assert.equal((await app.webhook.POST(webhook())).status,200);assert.equal((await app.webhook.POST(webhook())).status,200);
    assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),true);
    for(let i=0;i<20;i++)await app.planner.reserveUsage('subscriber');
    await assert.rejects(()=>app.planner.reserveUsage('subscriber'),e=>e.status===429);
    for(let i=0;i<5;i++)await app.planner.reserveUsage('free-subscriber');
    await assert.rejects(()=>app.planner.reserveUsage('free-subscriber'),e=>e.status===429);
    user('other-subscriber');assert.equal((await app.cancelSubscription.POST(req('/api/billing/cancel',{}))).status,404);assert.equal(cancels,0);
    user('subscriber');assert.equal((await app.cancelSubscription.POST(req('/api/billing/cancel',{}))).status,200);assert.equal(cancels,1);
    sub={...sub,status:'cancelled'};await app.webhook.POST(webhook());assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    sub={...sub,status:'active',paid_count:0};await app.webhook.POST(webhook());assert.equal(app.billing.hasPlus(await app.billing.membership('subscriber')),false);
    assert.throws(()=>app.billing.checkoutUrl('https://evil.example/pay'));
  }finally{globalThis.fetch=original;for(const key of Object.keys(settings))delete context.env[key];}
});
