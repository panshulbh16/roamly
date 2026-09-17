import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

// Explicit opt-in: makes two paid provider requests. Identity is simulated;
// this does not test browser login or the development server's D1 database.
test('live itineraries survive reopening History in an isolated database', {
  skip: process.env.ROAMLY_LIVE_TEST !== '1', timeout: 130000,
}, async()=>{
  const config=parseEnv(readFileSync('.env','utf8'));
  // Benchmark a candidate without changing local or production credentials/config.
  if(process.env.ROAMLY_BENCHMARK_MODEL) config.ANTHROPIC_MODEL=process.env.ROAMLY_BENCHMARK_MODEL;
  assert.ok(config.ANTHROPIC_API_KEY && config.ANTHROPIC_MODEL);
  assert.ok(Number(config.AI_MONTHLY_REQUEST_LIMIT)>0);
  const path=join(mkdtempSync(join(tmpdir(),'roamly-live-')),'history.sqlite');
  let sql=new DatabaseSync(path);
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(join('drizzle',file),'utf8'));
  }
  class Statement {
    constructor(query,values=[]) {this.query=query;this.values=values;}
    bind(...values) {return new Statement(this.query,values);}
    async first() {return sql.prepare(this.query).get(...this.values)??null;}
    async all() {return {results:sql.prepare(this.query).all(...this.values)};}
    async run() {sql.prepare(this.query).run(...this.values);return {success:true};}
  }
  globalThis.__roamlyLiveEnv={...config,DB:{prepare:q=>new Statement(q)}};
  const compiled=await build({stdin:{contents:`export * as generate from './app/api/generate/route'; export * as history from './app/api/history/route';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{
    name:'isolated-runtime',setup(b) {
      b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
      b.onResolve({filter:/auth\/server$/},()=>({path:'identity',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='env'
        ? 'export const env=globalThis.__roamlyLiveEnv;'
        : 'export async function currentUser(){return {id:"live-test-only",email:"test@example.test"};}'}));
    },
  }]});
  const app=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const origin='http://localhost:5173';
  const input={startDate:'',days:1,travelers:2,budget:'Comfort',pace:'Balanced',interests:['Nature'],needs:'',homeCity:''};
  const generated=[];
  const originalFetch=globalThis.fetch;
  if(process.env.ROAMLY_BENCHMARK_THINKING==='disabled'||process.env.ROAMLY_BENCHMARK_FAST==='1') {
    globalThis.fetch=async(url,options)=>{const response=await originalFetch(url,{...options,
      headers:{...options.headers,...(process.env.ROAMLY_BENCHMARK_FAST==='1'?{'anthropic-beta':'fast-mode-2026-02-01'}:{})},
      body:JSON.stringify({...JSON.parse(options.body),
        ...(process.env.ROAMLY_BENCHMARK_THINKING==='disabled'?{thinking:{type:'disabled'}}:{}),
        ...(process.env.ROAMLY_BENCHMARK_FAST==='1'?{speed:'fast'}:{})})});
      if(!response.ok) { const data=await response.clone().json();console.log('Benchmark provider rejection:',response.status,data.error?.type,data.error?.message); }
      return response;
    };
  }
  try {
    for(const [destination,days] of [['Auckland',1],['Austria',10]]) {
      const started=performance.now();
      const response=await app.generate.POST(new Request(origin+'/api/generate',{method:'POST',headers:{origin,'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({...input,destination,days})}));
      assert.equal(response.status,200);
      let result, first=false, summary=false, firstDay=false, buffer='';
      const decoder=new TextDecoder();
      for await(const chunk of response.body) {
        buffer+=decoder.decode(chunk,{stream:true});
        let end;
        while((end=buffer.indexOf('\n'))>=0) {
          const event=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
          if(event.type==='preview'&&!first) {first=true;console.log(`${days}-day first section: ${Math.round(performance.now()-started)}ms`);}
          if(event.type==='preview'&&event.itinerary.summary&&!summary) {summary=true;console.log(`${days}-day overview: ${Math.round(performance.now()-started)}ms`);}
          if(event.type==='preview'&&event.itinerary.days?.length&&!firstDay) {firstDay=true;console.log(`${days}-day first complete day: ${Math.round(performance.now()-started)}ms`);}
          assert.notEqual(event.type,'error',event.error);
          if(event.type==='complete')result=event;
        }
      }
      assert.ok(first && result);
      assert.equal(result.trip.source,'ai');
      assert.equal(result.trip.itinerary.days.length,days);
      assert.ok(result.trip.itinerary.destinationAdvice);
      console.log(`${config.ANTHROPIC_MODEL}: ${days}-day itinerary completed in ${Math.round(performance.now()-started)}ms`);
      generated.push(result);
    }
    sql.close();
    sql=new DatabaseSync(path);
    const listing=await app.history.GET(new Request(origin+'/api/history'));
    const {entries}=await listing.json();
    assert.equal(entries.length,2);
    assert.deepEqual(new Set(entries.map(e=>e.intake.destination)),new Set(['Auckland','Austria']));
    for(const expected of generated) {
      const response=await app.history.GET(new Request(origin+'/api/history?id='+expected.historyId));
      const {entry}=await response.json();
      assert.equal(entry.status,'completed');
      assert.deepEqual(entry.trip,expected.trip);
    }
    console.log('Real provider generation and SQLite reopen passed. Test database: '+path);
  } finally {
    globalThis.fetch=originalFetch;
    sql.close();
    delete globalThis.__roamlyLiveEnv;
  }
});
