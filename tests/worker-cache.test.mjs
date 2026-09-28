import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
let response;
globalThis.__cacheResponse=()=>response;
globalThis.__sealRuns=0;
const result=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^vinext\/server\/|lib\/server\/backfill$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('backfill')?'export const sealLegacyData=async()=>{globalThis.__sealRuns++;return 0;}':a.path.endsWith('app-router-entry')?'export default {fetch:()=>globalThis.__cacheResponse()}':'export const DEFAULT_DEVICE_SIZES=[],DEFAULT_IMAGE_SIZES=[];export const handleImageOptimization=()=>{};'}));}}]});
const app={'X-Roamly-Client':'web'};
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('only public successful destination GETs are cacheable; shared links cannot leak through referrers',async()=>{
  for(const [path,method,status,cookie,cache] of [['/api/destinations','GET',200,false,true],['/api/destinations','GET',400,false,false],['/api/destinations','POST',200,false,false],['/api/destinations','GET',200,true,false],['/api/trips','GET',200,false,false],['/share/test','GET',200,false,false]]){
    response=new Response('{}',{status,headers:{'Cache-Control':'public, max-age=3600',...(cookie?{'Set-Cookie':'fixture=value'}:{})}});
    const r=await worker.fetch(new Request('https://roamly.test'+path,{method,headers:app}),{},{});
    assert.equal(r.headers.get('cache-control'),cache?'public, max-age=3600':'private, no-store');
    if(path.startsWith('/share'))assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  }
});
test('pages are never cached, so a deploy shows on the next request; the live commit is exposed',async()=>{
  response=new Response('<!doctype html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, s-maxage=31536000'}});
  let r=await worker.fetch(new Request('https://roamly.test/explore'),{GIT_SHA:'abc123'},{});
  assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-roamly-version'),'abc123');
  response=new Response('x',{headers:{'Content-Type':'text/javascript','Cache-Control':'public, max-age=31536000, immutable'}});
  r=await worker.fetch(new Request('https://roamly.test/assets/app-3f2a.js'),{},{});
  assert.equal(r.headers.get('cache-control'),'public, max-age=31536000, immutable','hashed assets stay cacheable');assert.equal(r.headers.get('x-roamly-version'),null);
});
test('old addresses send page visits to heyroamly.com, but APIs like the Razorpay webhook keep working there',async()=>{
  response=new Response('<!doctype html>',{headers:{'Content-Type':'text/html'}});
  for(const host of ['roamly.panshulbh16.workers.dev','www.heyroamly.com']){
    const r=await worker.fetch(new Request(`https://${host}/together?trip=abc`),{},{});
    assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://heyroamly.com/together?trip=abc');
    const api=await worker.fetch(new Request(`https://${host}/api/billing/webhook`,{method:'POST',body:'{}'}),{},{});
    assert.notEqual(api.status,301,'webhooks are not redirected');
  }
  const post=await worker.fetch(new Request('https://roamly.panshulbh16.workers.dev/auth/platform',{method:'POST'}),{},{});
  assert.notEqual(post.status,301,'only GET/HEAD page visits redirect');
  assert.equal((await worker.fetch(new Request('https://heyroamly.com/'),{},{})).status,200);
});
test('the API answers only Roamly pages; typed-in addresses, other sites and scripts get a 404',async()=>{
  const call=async(path,init={},page=false)=>{
    response=page?new Response('<!doctype html>',{headers:{'Content-Type':'text/html'}}):Response.json({secret:'data'});
    const r=await worker.fetch(new Request('https://heyroamly.com'+path,init),{},{});return [r.status,await r.text()];
  };
  assert.deepEqual(await call('/api/billing/status',{headers:{...app,'sec-fetch-site':'same-origin'}}),[200,'{"secret":"data"}'],'the app itself');
  assert.deepEqual(await call('/api/trips',{headers:app}),[200,'{"secret":"data"}'],'non-browser callers that know the header still meet auth checks inside');
  for(const [why,path,init] of [
    ['address typed into the browser','/api/billing/status',{headers:{'sec-fetch-site':'none','sec-fetch-mode':'navigate'}}],
    ['bare script','/api/trips',{}],
    ['another site, even with the header','/api/trips',{headers:{...app,'sec-fetch-site':'cross-site'}}],
    ['sibling subdomain','/api/trips',{headers:{...app,'sec-fetch-site':'same-site'}}],
    ['CORS preflight','/api/trips',{method:'OPTIONS',headers:{'sec-fetch-site':'cross-site','access-control-request-headers':'x-roamly-client'}}],
    ['wrong header value','/api/trips',{headers:{'X-Roamly-Client':'curl'}}],
    ['percent-encoded path','/%61pi/trips',{}],['double slash','//api/trips',{}],['upper case','/API/trips',{}],
  ]){const [status,body]=await call(path,init);assert.equal(status,404,why);assert.doesNotMatch(body,/secret/,why);}
  // The payment providers' calls come from outside and prove themselves (signatures, or asking Stripe).
  for(const path of ['/api/billing/callback','/api/billing/webhook','/api/billing/stripe/return','/api/billing/stripe/webhook','/api/billing/dodo/return','/api/billing/dodo/webhook'])
    assert.equal((await call(path,{method:'POST',headers:{'sec-fetch-site':'cross-site'}}))[0],200,path);
  assert.equal((await call('/pricing',{headers:{'sec-fetch-site':'none'}},true))[0],200,'pages are unaffected');
});
test('every response forces HTTPS and refuses to be framed by other sites',async()=>{
  for(const [path,type] of [['/pricing','text/html'],['/api/trips','application/json']]){
    response=new Response('x',{headers:{'Content-Type':type}});
    const r=await worker.fetch(new Request('https://heyroamly.com'+path,{headers:app}),{},{});
    assert.equal(r.headers.get('strict-transport-security'),'max-age=31536000; includeSubDomains',path);
    assert.equal(r.headers.get('x-frame-options'),'DENY',path);assert.equal(r.headers.get('content-security-policy'),"frame-ancestors 'none'",path);
  }
  response=new Response('x',{headers:{'Content-Type':'text/html','Content-Security-Policy':"img-src 'self'"}});
  assert.equal((await worker.fetch(new Request('https://heyroamly.com/'),{},{})).headers.get('content-security-policy'),"img-src 'self'; frame-ancestors 'none'",'an existing policy is extended, not replaced');
  response=new Response('x',{headers:{'Content-Type':'text/html'}});
  const embedded=await worker.fetch(new Request('https://roamly.chatgpt.site/'),{},{});
  assert.equal(embedded.headers.get('x-frame-options'),null,'ChatGPT hosting may still embed the app');
});
test('pages reach the API only through lib/client/api.ts, so every call carries the client header',()=>{
  const offenders=[];
  for(const dir of ['components','hooks'])for(const file of readdirSync(dir,{recursive:true}))
    if(/\.tsx?$/.test(file)&&/\bfetch\(/.test(readFileSync(join(dir,file),'utf8')))offenders.push(join(dir,file));
  assert.deepEqual(offenders,[],'call api() from lib/client/api.ts instead of fetch()');
});
test('the scheduled run seals old rows in the background',async()=>{
  const waits=[];await worker.scheduled({},{},{waitUntil:p=>waits.push(p)});await Promise.all(waits);assert.equal(globalThis.__sealRuns,1);
});
test.after(()=>{delete globalThis.__cacheResponse;delete globalThis.__sealRuns;});
