import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let response;
globalThis.__cacheResponse=()=>response;
const result=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^vinext\/server\//},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('app-router-entry')?'export default {fetch:()=>globalThis.__cacheResponse()}':'export const DEFAULT_DEVICE_SIZES=[],DEFAULT_IMAGE_SIZES=[];export const handleImageOptimization=()=>{};'}));}}]});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('only public successful destination GETs are cacheable; shared links cannot leak through referrers',async()=>{
  for(const [path,method,status,cookie,cache] of [['/api/destinations','GET',200,false,true],['/api/destinations','GET',400,false,false],['/api/destinations','POST',200,false,false],['/api/destinations','GET',200,true,false],['/api/trips','GET',200,false,false],['/share/test','GET',200,false,false]]){
    response=new Response('{}',{status,headers:{'Cache-Control':'public, max-age=3600',...(cookie?{'Set-Cookie':'fixture=value'}:{})}});
    const r=await worker.fetch(new Request('https://roamly.test'+path,{method}),{},{});
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
test.after(()=>delete globalThis.__cacheResponse);
