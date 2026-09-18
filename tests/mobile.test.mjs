import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
// Execute the hook's effect against an isolated media-query fixture.
const fixture={value:undefined,effect:null};
globalThis.__mobileUnit=fixture;
const compiled=await build({entryPoints:['hooks/use-mobile.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'hook-fixture',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useState(){return [globalThis.__mobileUnit.value,v=>{globalThis.__mobileUnit.value=v}]} export function useEffect(fn){globalThis.__mobileUnit.effect=fn}'}));
}}]});
const {useIsMobile}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('mobile hook handles the 767/768 boundary, changes and listener cleanup',()=>{
  const previous=globalThis.window;
  let listener,removed=false;
  globalThis.window={innerWidth:767,matchMedia(query){assert.equal(query,'(max-width: 767px)');return {addEventListener(type,fn){assert.equal(type,'change');listener=fn;},removeEventListener(type,fn){assert.equal(type,'change');assert.equal(fn,listener);removed=true;}};}};
  try {
    assert.equal(useIsMobile(),false);
    const cleanup=fixture.effect();assert.equal(useIsMobile(),true);
    window.innerWidth=768;listener();assert.equal(useIsMobile(),false);
    window.innerWidth=320;listener();assert.equal(useIsMobile(),true);
    cleanup();assert.equal(removed,true);
  } finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;delete globalThis.__mobileUnit;}
});
