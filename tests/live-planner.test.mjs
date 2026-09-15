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
test('live Opus itineraries survive reopening History in an isolated database', {
  skip: process.env.ROAMLY_LIVE_TEST !== '1', timeout: 130000,
}, async()=>{
  const config=parseEnv(readFileSync('.env','utf8'));
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
  try {
    for(const [destination,days] of [['Auckland',1],['Austria',10]]) {
      const started=performance.now();
      const response=await app.generate.POST(new Request(origin+'/api/generate',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({...input,destination,days})}));
      const result=await response.json();
      assert.equal(response.status,200,JSON.stringify(result));
      assert.equal(result.trip.source,'ai');
      assert.equal(result.trip.itinerary.days.length,days);
      assert.ok(result.trip.itinerary.destinationAdvice);
      console.log(`${days}-day itinerary completed in ${Math.round(performance.now()-started)}ms`);
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
    sql.close();
    delete globalThis.__roamlyLiveEnv;
  }
});
