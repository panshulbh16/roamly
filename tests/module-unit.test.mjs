import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';

const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE usage (key TEXT PRIMARY KEY, count INTEGER NOT NULL)');
const database={prepare(query){return {bind(...values){return {async first(){return sql.prepare(query).get(...values)??null;}};}};}};
const env={DB:database};
globalThis.__unitEnv=env;
globalThis.__unitUser={id:'unit',email:'unit@example.test'};
globalThis.__unitClient=null;
const compiled=await build({stdin:{contents:`export * as context from './lib/server/context'; export * as config from './lib/auth/config'; export * as requests from './lib/auth/requests'; export * as planner from './lib/server/planner'; export * as utils from './lib/utils';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'unit-runtime',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'unit'}));
  b.onResolve({filter:/auth\/server$|^\.\/server$/},()=>({path:'auth',namespace:'unit'}));
  b.onLoad({filter:/.*/,namespace:'unit'},({path})=>({contents:path==='env'?'export const env=globalThis.__unitEnv;':'export async function currentUser(){return globalThis.__unitUser;} export async function authClient(){return globalThis.__unitClient;}',loader:'js'}));
}}]});
const app=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
afterEach(()=>{for(const key of Object.keys(env))delete env[key];env.DB=database;sql.exec('DELETE FROM usage');globalThis.__unitUser={id:'unit'};globalThis.__unitClient=null;});

test('auth configuration fails closed for disabled, absent and malformed settings',()=>{
  assert.equal(app.config.authConfig().enabled,false);
  Object.assign(env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_AUTH_ENABLED:'true'});
  assert.equal(app.config.authConfig().enabled,true);
  for(const url of ['',null,42,'invalid','http://fixture.test','https://user:pass@fixture.test','https://fixture.test/path']) {
    env.SUPABASE_URL=url;assert.equal(app.config.authConfig().enabled,false,String(url));
  }
  env.SUPABASE_URL='https://fixture.test';env.SUPABASE_AUTH_ENABLED='false';assert.equal(app.config.authConfig().enabled,false);
  env.SUPABASE_AUTH_ENABLED='true';env.SUPABASE_PUBLISHABLE_KEY='';assert.equal(app.config.authConfig().enabled,false);
  assert.equal(app.config.authCookieOptions.httpOnly,true);assert.equal(app.config.authCookieOptions.sameSite,'lax');
});
test('email normalization, rejection and required-client readiness',async()=>{
  assert.equal(app.requests.emailSchema.parse('  ME@Example.com  '),'me@example.com');
  for(const value of ['',null,'not-an-email','a'.repeat(255)+'@test.com'])assert.equal(app.requests.emailSchema.safeParse(value).success,false);
  await assert.rejects(app.requests.requiredClient,e=>e.status===503);
  globalThis.__unitClient={fixture:true};assert.deepEqual(await app.requests.requiredClient(),{fixture:true});
});
test('auth request limits are exact, action-specific and use hashed email keys',async()=>{
  for(let i=0;i<5;i++)await app.requests.authRateLimit('one@example.test','send');
  await assert.rejects(()=>app.requests.authRateLimit('one@example.test','send'),e=>e.status===429);
  for(let i=0;i<12;i++)await app.requests.authRateLimit('one@example.test','verify');
  await assert.rejects(()=>app.requests.authRateLimit('one@example.test','verify'),e=>e.status===429);
  await app.requests.authRateLimit('two@example.test','send');
  for(const row of sql.prepare('SELECT key FROM usage').all())assert.ok(!row.key.includes('@'));
});
test('AI readiness rejects missing and invalid limits',()=>{
  Object.assign(env,{ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture'});
  for(const limit of [undefined,'','0','-1','1.5','NaN','Infinity']){env.AI_MONTHLY_REQUEST_LIMIT=limit;assert.equal(app.planner.aiEnabled(),false);}
  env.AI_MONTHLY_REQUEST_LIMIT='100';assert.equal(app.planner.aiEnabled(),true);
  delete env.ANTHROPIC_API_KEY;assert.equal(app.planner.aiEnabled(),false);
});
test('planner daily quota isolates accounts and monthly quota stops new requests',async()=>{
  await assert.rejects(()=>app.planner.reserveUsage('a'),e=>e.status===503);
  Object.assign(env,{ANTHROPIC_API_KEY:'fixture',ANTHROPIC_MODEL:'fixture',AI_MONTHLY_REQUEST_LIMIT:'6'});
  for(let i=0;i<5;i++)await app.planner.reserveUsage('a');
  await assert.rejects(()=>app.planner.reserveUsage('a'),e=>e.status===429&&/today/.test(e.message));
  await app.planner.reserveUsage('b');
  await assert.rejects(()=>app.planner.reserveUsage('c'),e=>e.status===429&&/month/.test(e.message));
});
test('context protects identity, storage and origin boundaries',async()=>{
  assert.equal((await app.context.identity()).id,'unit');
  globalThis.__unitUser=null;await assert.rejects(app.context.identity,e=>e.status===401);
  assert.equal(app.context.db(),database);delete env.DB;assert.throws(app.context.db,e=>e.status===503);
  app.context.sameOrigin(new Request('https://roamly.test/api',{headers:{origin:'https://roamly.test'}}));
  for(const origin of [undefined,'https://other.test','http://roamly.test'])assert.throws(()=>app.context.sameOrigin(new Request('https://roamly.test/api',{headers:origin?{origin}:{}})),e=>e.status===403);
});
test('body reads fragmented Unicode JSON and rejects missing, malformed and oversized bodies',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({destination:'京都'}));
  const request=new Request('https://roamly.test',{method:'POST',duplex:'half',body:new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}})});
  assert.deepEqual(await app.context.body(request),{destination:'京都'});
  for(const body of [undefined,'{'])await assert.rejects(()=>app.context.body(new Request('https://roamly.test',{method:'POST',body})),e=>e.status===400);
  await assert.rejects(()=>app.context.body(new Request('https://roamly.test',{method:'POST',body:'x'.repeat(96001)})),e=>e.status===413);
});
test('failure preserves safe errors and hides internal exception details',async()=>{
  const safe=app.context.failure(new app.context.ApiError(409,'Try again'));assert.equal(safe.status,409);assert.deepEqual(await safe.json(),{error:'Try again'});
  const unexpected=app.context.failure(new Error('secret-database-connection'));assert.equal(unexpected.status,500);assert.ok(!JSON.stringify(await unexpected.json()).includes('secret-database'));
});
test('class utility combines conditions and resolves conflicting Tailwind classes',()=>{
  assert.equal(app.utils.cn('px-2',false,['text-sm'],{'font-bold':true},'px-4'),'text-sm font-bold px-4');
});
