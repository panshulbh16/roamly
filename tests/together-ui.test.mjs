import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(process.cwd(),'.unit-together-')),state=[],refs=[];
let cursor=0,refCursor=0;
globalThis.__togetherHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(initial){return refs[refCursor++]??=( {current:initial});}};
const compiled=await build({entryPoints:['components/trips/together.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'hooks',setup(b){
 b.onResolve({filter:/^next\/link$/},()=>({path:'next/link.js',external:true}));
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`export * from ${JSON.stringify(join(process.cwd(),'node_modules/react/index.js'))};export const useState=globalThis.__togetherHooks.useState;export const useRef=globalThis.__togetherHooks.useRef;export const useEffect=()=>{};`}));
}}]});
writeFileSync(join(dir,'fixture.mjs'),compiled.outputFiles[0].text);
const {Together}=await import(pathToFileURL(join(dir,'fixture.mjs')));
// Expand the hook-free editor so its fields are reachable like inline markup.
const expand=n=>n&&typeof n==='object'&&!Array.isArray(n)&&n.type?.name==='TripEditor'?n.type(n.props):n;
const nodes=n=>{n=expand(n);return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];};
const text=n=>{n=expand(n);return typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(' '):n?.props?text(n.props.children):'';};
const render=(plus=true,signedIn=true)=>{cursor=refCursor=0;return Together({plus,signedIn});};
const button=(tree,name)=>nodes(tree).find(n=>n.type==='button'&&text(n).trim()===name);
const tick=()=>new Promise(r=>setImmediate(r));
test.after(()=>{rmSync(dir,{recursive:true,force:true});delete globalThis.__togetherHooks;});
test('Together gate and draft recovery: failed saves preserve input; saved drafts do not overwrite the next new trip',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 globalThis.window={history:{replaceState(){}},location:{origin:'https://local.test'},confirm:()=>true};
 try{
  for(const [plus,signedIn,expected] of [[false,true,/active Plus membership/],[false,false,/Sign in to host/]]){
   state.length=refs.length=0;button(render(plus,signedIn),'Create a trip').props.onClick();assert.match(text(render(plus,signedIn)),expected);
  }
  state.length=refs.length=0;button(render(),'Create a trip').props.onClick();
  const title=nodes(render()).find(n=>n.type==='input'&&n.props.placeholder==='A relaxed weekend in the hills');title.props.onChange({target:{value:'Our own itinerary'}});
  globalThis.fetch=async()=>Response.json({error:'Storage unavailable'},{status:503});
  let form=nodes(render()).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await tick();
  assert.match(text(render()),/Storage unavailable/);assert.equal(nodes(render()).find(n=>n.type==='input'&&n.props.placeholder==='A relaxed weekend in the hills').props.value,'Our own itinerary');
  let saved;
  let published;globalThis.fetch=async(_,options)=>{if(options?.body){const b=JSON.parse(options.body);saved=b.trip;published=b.publish;return Response.json({ok:true});}return Response.json({trip:{...saved,status:published?'open':'draft',isHost:true,approved:0,requestStatus:null},requests:[]});};
  form=nodes(render()).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await tick();await tick();
  assert.equal(published,true,'the main button publishes in one step');assert.match(text(render()),/Your trip is live/);assert.ok(button(render(),'Edit trip'),'published trips stay editable');
  button(render(),'Create a trip').props.onClick();assert.equal(nodes(render()).find(n=>n.type==='input'&&n.props.placeholder==='A relaxed weekend in the hills').props.value,'');
  assert.notEqual(state[4]?.id,saved.id);
 }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
