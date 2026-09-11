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
const origin='https://roamly.test';
const destinationAdvice={highlights:['Harbour walks offer waterfront views.','Volcanic viewpoints provide city panoramas.'],watchOutFor:['Hills can be steep; choose accessible routes.','Weather changes quickly; carry a rain layer.']};
test('planner sends optional workspace header and validates the provider itinerary',async()=>{
  const originalFetch=globalThis.fetch;
  const itinerary={title:'Auckland',summary:'A short visit',days:[{title:'Day 1',activities:[{time:'Morning',title:'Walk',description:'Explore the waterfront',place:'Auckland'}]}],tips:[],destinationAdvice};
  context.env.ANTHROPIC_API_KEY='fixture-key';
  context.env.ANTHROPIC_MODEL='fixture-model';
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
        assert.equal(JSON.parse(options.body).model,'fixture-model');
        assert.equal(JSON.parse(options.body).max_tokens,5000);
        assert.match(JSON.parse(options.body).system,/destinationAdvice/);
        assert.match(JSON.parse(options.body).system,/exactly the requested number of days/);
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
test('anonymous users cannot read history or submit searches',async()=>{context.headers=new Headers();assert.equal((await app.history.GET(req('/api/history',undefined,'GET'))).status,401);assert.equal((await app.generate.POST(req('/api/generate',input))).status,401);assert.equal(sql.prepare('SELECT count(*) AS n FROM search_history').get().n,0)});
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
  const destinations=['LA','São Paulo, Brazil','Tokyo / Kyoto','Café, Québec — 旅','Z'.repeat(120)];
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
