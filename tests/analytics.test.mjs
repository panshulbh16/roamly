import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {join} from 'node:path';
// Hooks run inline: effects fire immediately and the external store is read directly.
globalThis.__analyticsHooks={useEffect:fn=>fn(),useSyncExternalStore:(_s,get)=>get()};
const out=await build({entryPoints:['components/Analytics.tsx'],bundle:true,write:false,format:'esm',platform:'node',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'hooks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`export * from ${JSON.stringify(join(process.cwd(),'node_modules/react/index.js'))};export const useEffect=globalThis.__analyticsHooks.useEffect;export const useSyncExternalStore=globalThis.__analyticsHooks.useSyncExternalStore;`}));
}}]});
const {Analytics,openCookieSettings}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function browser(hostname){
  const store=new Map(),scripts=[];
  globalThis.window={location:{hostname}};globalThis.location=window.location;
  globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  globalThis.document={createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}};
  return {store,scripts};
}
const render=()=>Analytics({id:'G-TEST123',site:'Roamly',accent:'#25664f'});
const buttons=el=>{const found=[];const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);if(n.type==='button')found.push(n);walk(n.props?.children);};walk(el);return Object.fromEntries(found.map(b=>[b.props.children,b.props.onClick]));};
const calls=()=>window.dataLayer.map(a=>[...a]);
test('analytics is cookieless until Accept, never enables ads, remembers the choice and can be reopened',()=>{
  const {store,scripts}=browser('roamly.panshulbh16.workers.dev');
  const bar=render();assert.ok(bar,'first visit asks');
  assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  const [kind,mode,consent]=calls().find(c=>c[0]==='consent');
  assert.deepEqual([kind,mode,consent],['consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'}]);
  assert.ok(calls().some(c=>c[0]==='config'&&c[1]==='G-TEST123'));
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
test.after(()=>{for(const k of ['window','location','localStorage','document','__analyticsHooks'])delete globalThis[k];});
