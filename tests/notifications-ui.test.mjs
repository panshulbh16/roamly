import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(process.cwd(),'.unit-notifications-')),state=[],refs=[];
let cursor=0,refCursor=0,effect;
globalThis.__notificationHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(initial){return refs[refCursor++]??={current:initial};},useEffect(fn){effect=fn;},useCallback(fn){return fn;}};
const compiled=await build({entryPoints:['components/trips/notifications.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'hooks',setup(b){
 b.onResolve({filter:/^next\/link$/},()=>({path:'next/link.js',external:true}));
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`export * from ${JSON.stringify(join(process.cwd(),'node_modules/react/index.js'))}; const h=globalThis.__notificationHooks; export const useState=h.useState,useRef=h.useRef,useEffect=h.useEffect,useCallback=h.useCallback;`}));
}}]});
writeFileSync(join(dir,'fixture.mjs'),compiled.outputFiles[0].text);
const {Notifications}=await import(pathToFileURL(join(dir,'fixture.mjs')));
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(' '):n?.props?text(n.props.children):'';
const render=()=>{cursor=refCursor=0;return Notifications();};
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n).trim().startsWith(label));
const tick=()=>new Promise(r=>setImmediate(r));
const notice=(id)=>({id,tripId:'trip',type:'request_approved',createdAt:'2026-09-25T00:00:00.000Z',readAt:null});
test.after(()=>{rmSync(dir,{recursive:true,force:true});delete globalThis.__notificationHooks;});
test('inbox preserves updates on failure, marks read and merges older pages',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldFetch=globalThis.fetch;let poll;
 globalThis.window={setInterval(fn){poll=fn;return 1;},clearInterval(){}};globalThis.document={visibilityState:'visible'};
 try{
  state.length=refs.length=0;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({items:[notice('a')],unreadCount:2,nextCursor:'next'});};
  render();assert.equal(calls,0);render().props.onOpenChange(true);render();const cleanup=effect();await tick();assert.match(text(render()),/Your request to join was approved/);
  globalThis.fetch=async()=>Response.json({error:'Temporary failure'},{status:503});await button(render(),'Refresh').props.onClick();await tick();assert.match(text(render()),/Temporary failure/);assert.match(text(render()),/Your request to join was approved/);
  await button(render(),'Mark read').props.onClick();await tick();assert.equal(state[2],2);assert.equal(state[1][0].readAt,null);
  globalThis.fetch=async()=>Response.json({ok:true});await button(render(),'Mark read').props.onClick();await tick();assert.equal(state[2],1);assert.ok(state[1][0].readAt);
  globalThis.fetch=async()=>Response.json({items:[notice('b')],unreadCount:1,nextCursor:null});await button(render(),'Load older updates').props.onClick();await tick();assert.equal(state[1].length,2);
  globalThis.fetch=async()=>Response.json({items:[{...notice('a'),readAt:'read'},notice('c')],unreadCount:2,nextCursor:'new'});poll();await tick();assert.equal(state[1].length,2);assert.equal(state[3],'new');cleanup();
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.fetch=oldFetch;}
});
test('closed inbox ignores late responses; polling can recover initial failure with pagination',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldFetch=globalThis.fetch;let poll,release;
 globalThis.window={setInterval(fn){poll=fn;return 1;},clearInterval(){}};globalThis.document={visibilityState:'visible'};
 try{
  state.length=refs.length=0;globalThis.fetch=()=>new Promise(r=>{release=r;});render().props.onOpenChange(true);render();const cleanup=effect();cleanup();release(Response.json({items:[notice('old')],unreadCount:99,nextCursor:null}));await tick();assert.equal(state[1].length,0);
  globalThis.fetch=async()=>Response.json({error:'Offline'},{status:503});render();const end=effect();await tick();assert.match(text(render()),/Offline/);
  globalThis.fetch=async()=>Response.json({items:[notice('recovered')],unreadCount:25,nextCursor:'older'});poll();await tick();assert.equal(state[3],'older');assert.ok(button(render(),'Load older updates'));end();
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.fetch=oldFetch;}
});
