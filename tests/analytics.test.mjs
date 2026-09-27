import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {join} from 'node:path';
// Hooks run inline: effects fire immediately and the external store is read directly.
globalThis.__analyticsHooks={useEffect:fn=>fn(),useSyncExternalStore:(_s,get)=>get(),usePathname:()=>globalThis.location.pathname};
const out=await build({entryPoints:['components/Analytics.tsx'],bundle:true,write:false,format:'esm',platform:'node',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'hooks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'next/navigation',namespace:'nav'}));
  b.onLoad({filter:/.*/,namespace:'nav'},()=>({loader:'js',contents:'export const usePathname=()=>globalThis.__analyticsHooks.usePathname();'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`export * from ${JSON.stringify(join(process.cwd(),'node_modules/react/index.js'))};export const useEffect=globalThis.__analyticsHooks.useEffect;export const useSyncExternalStore=globalThis.__analyticsHooks.useSyncExternalStore;`}));
}}]});
const {Analytics,openCookieSettings}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function browser(hostname,path='/',referrer=''){
  const store=new Map(),scripts=[];
  globalThis.window={location:{}};globalThis.location=window.location;go('https://'+hostname+path);
  globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  globalThis.document={createElement:()=>({}),head:{appendChild:s=>scripts.push(s)},referrer,title:'Roamly'};
  return {store,scripts};
}
function go(href){const u=new URL(href);Object.assign(location,{href:u.href,origin:u.origin,hostname:u.hostname,pathname:u.pathname,search:u.search});}
const render=()=>Analytics({id:'G-TEST123',site:'Roamly',accent:'#25664f'});
const buttons=el=>{const found=[];const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);if(n.type==='button')found.push(n);walk(n.props?.children);};walk(el);return Object.fromEntries(found.map(b=>[b.props.children,b.props.onClick]));};
const calls=()=>window.dataLayer.map(a=>[...a]);
test('analytics is cookieless until Accept, never enables ads, remembers the choice and can be reopened',()=>{
  const {store,scripts}=browser('roamly.panshulbh16.workers.dev');
  const bar=render();assert.ok(bar,'first visit asks');
  assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  const [kind,mode,consent]=calls().find(c=>c[0]==='consent');
  assert.deepEqual([kind,mode,consent],['consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'}]);
  assert.ok(calls().some(c=>c[0]==='config'&&c[1]==='G-TEST123'&&c[2].send_page_view===false),'GA does not send raw page views itself');
  buttons(bar).Accept();
  assert.equal(store.get('analytics-consent'),'granted');
  assert.deepEqual(calls().at(-1),['consent','update',{analytics_storage:'granted'}]);
  assert.equal(render(),null,'no bar once decided');
  openCookieSettings();assert.ok(render(),'Cookie settings reopens the bar');
  buttons(render()).Decline();assert.equal(store.get('analytics-consent'),'denied');
  assert.deepEqual(calls().at(-1),['consent','update',{analytics_storage:'denied'}]);
  assert.ok(!calls().some(c=>c[0]==='consent'&&c[2]?.ad_storage==='granted'),'ads are never granted');
});
test('a returning visitor who accepted starts with analytics granted; localhost loads nothing',()=>{
  const {store}=browser('roamly.panshulbh16.workers.dev');store.set('analytics-consent','granted');
  assert.equal(render(),null);assert.equal(calls().find(c=>c[0]==='consent')[2].analytics_storage,'granted');
  const local=browser('localhost');assert.equal(render(),null);assert.equal(local.scripts.length,0);assert.equal(window.gtag,undefined);
});
test('Google never sees invite tokens, share IDs, trip IDs or other query strings',()=>{
  const token='tok_'+'x'.repeat(40);
  browser('heyroamly.com','/together/invite?t='+token,'https://mail.example.com/inbox/123?msg=abc');
  render();
  const views=()=>calls().filter(c=>c[0]==='event'&&c[1]==='page_view').map(c=>c[2]);
  assert.deepEqual(views()[0],{page_location:'https://heyroamly.com/together/invite',page_referrer:'https://mail.example.com/',page_title:'Roamly'});
  go('https://heyroamly.com/together?trip=3f0c2d1e-0000-4000-8000-000000000000');render();
  go('https://heyroamly.com/share/3f0c2d1e-0000-4000-8000-000000000000');render();
  go('https://heyroamly.com/pricing?checkout=activated');render();
  assert.deepEqual(views().slice(1).map(v=>[v.page_location,v.page_referrer]),[
    ['https://heyroamly.com/together','https://heyroamly.com/together/invite'],
    ['https://heyroamly.com/share/:id','https://heyroamly.com/together'],
    ['https://heyroamly.com/pricing','https://heyroamly.com/share/:id'],
  ]);
  assert.deepEqual(calls().filter(c=>c[0]==='set').at(-1)[1],{page_location:'https://heyroamly.com/pricing',page_referrer:'https://heyroamly.com/share/:id'},'GA\'s own events use the clean address too');
  const sent=JSON.stringify(calls());
  for(const secret of [token,'3f0c2d1e','checkout=','msg=abc','inbox'])assert.ok(!sent.includes(secret),secret+' never reaches Google');
});
test('campaign tags reach Google so a Reddit post gets credit; nothing else in the query does',()=>{
  browser('heyroamly.com','/?utm_source=reddit&utm_medium=social&utm_campaign=r_sideproject&t=tok_secret&utm_content=me@example.com&utm_term=a%20b');
  render();
  go('https://heyroamly.com/share/3f0c2d1e-0000-4000-8000-000000000000?utm_source=reddit&ref=abc');render();
  go('https://heyroamly.com/pricing');render();
  const views=calls().filter(c=>c[0]==='event'&&c[1]==='page_view').map(c=>[c[2].page_location,c[2].page_referrer]);
  assert.deepEqual(views,[
    ['https://heyroamly.com/?utm_source=reddit&utm_medium=social&utm_campaign=r_sideproject',''],
    ['https://heyroamly.com/share/:id?utm_source=reddit','https://heyroamly.com/?utm_source=reddit&utm_medium=social&utm_campaign=r_sideproject'],
    ['https://heyroamly.com/pricing','https://heyroamly.com/share/:id?utm_source=reddit'],
  ]);
  const sent=JSON.stringify(calls());
  for(const secret of ['tok_secret','example.com','ref=','3f0c2d1e','utm_term'])assert.ok(!sent.includes(secret),secret+' never reaches Google');
});
test.after(()=>{for(const k of ['window','location','localStorage','document','__analyticsHooks'])delete globalThis[k];});
