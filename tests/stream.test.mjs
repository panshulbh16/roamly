import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/trips/stream.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {itineraryPreview,consumePlannerStream}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const day={title:'Day "one" {京都}',activities:[{time:'Morning',title:'A walk',description:'A \\ path with [brackets] and "quotes".',place:'京都'}]};
const itinerary={title:'京都',summary:'A gentle trip',days:[day,day],tips:['Check hours.'],destinationAdvice:{highlights:['Gardens','Architecture'],watchOutFor:['Crowds; start early.','Rain; bring a coat.']}};
test('preview handles every character boundary, escapes and complete day boundaries',()=>{
  const raw=JSON.stringify(itinerary);
  let last=0;
  for(let i=0;i<=raw.length;i++) {
    const preview=itineraryPreview(raw.slice(0,i));
    const count=preview.days?.length??0;
    assert.ok(count>=last && count<=2);
    if(count) assert.deepEqual(preview.days[0],day);
    last=count;
  }
  assert.deepEqual(itineraryPreview(raw),itinerary);
  assert.deepEqual(itineraryPreview('{"title":"incomplete'),{});
  assert.deepEqual(itineraryPreview('{"days":[{"title":"bad"}'),{});
});
function response(events) {
  const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  return new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}));
}
const trip={id:'123e4567-e89b-42d3-a456-426614174000',intake:{destination:'Kyoto',startDate:'2026-11-01',days:2,travelers:2,budget:'Comfort',pace:'Balanced',interests:[],needs:'',homeCity:''},itinerary,source:'ai',createdAt:new Date().toISOString()};
test('client decodes split UTF-8 and only returns a validated final trip',async()=>{
  const previews=[];
  assert.deepEqual(await consumePlannerStream(response([{type:'preview',itinerary:{title:'京都'}},{type:'complete',trip}]),p=>previews.push(p)),trip);
  assert.deepEqual(previews,[{title:'京都'}]);
  await assert.rejects(()=>consumePlannerStream(response([{type:'preview',itinerary:{title:'京都'}}]),()=>{}),/before your trip was complete/);
  await assert.rejects(()=>consumePlannerStream(response([{type:'error',error:'Please retry'}]),()=>{}),/Please retry/);
  await assert.rejects(()=>consumePlannerStream(response([{type:'complete',trip:{}}]),()=>{}));
});
