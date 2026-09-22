import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const jar = new Map();
const cookies = {
  getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
  get: name => jar.has(name) ? { name, value: jar.get(name) } : undefined,
  set: (name, value) => jar.set(name, value),
};
const state = globalThis.__authLatency = { cookies, env: {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-key', SUPABASE_AUTH_ENABLED: 'true',
} };
const compiled = await build({ stdin: { contents: `export {proxy} from './proxy';export {currentUser} from './lib/auth/server';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'runtime', setup(b) {
  b.onResolve({filter: /^(cloudflare:workers|next\/(server|headers|navigation))$/}, a => ({path:a.path,namespace:'runtime'}));
  b.onLoad({filter:/.*/,namespace:'runtime'}, a => ({loader:'js',contents: a.path==='cloudflare:workers' ? 'export const env=globalThis.__authLatency.env' : a.path==='next/headers' ? 'export async function cookies(){return globalThis.__authLatency.cookies} export async function headers(){return new Headers()}' : a.path==='next/navigation' ? 'export function redirect(){throw Error("redirect")}' : 'export const NextResponse={next(){return {headers:new Headers(),cookies:{set(){}}}}}' }));
} }] });
const app = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('proxy refreshes only when needed; route verifies once and rejects revoked identities', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let revoked = false;
  const user = { id:'verified-id', email:'test@example.test', user_metadata:{} };
  const session = { access_token:'fixture-access', refresh_token:'fixture-refresh', expires_at:Math.floor(Date.now()/1000)+3600, expires_in:3600, token_type:'bearer', user };
  const put = value => jar.set('sb-fixture-auth-token', 'base64-' + Buffer.from(JSON.stringify(value)).toString('base64url'));
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if(path.endsWith('/token')) return Response.json(session);
    if(path.endsWith('/user')) return revoked ? Response.json({message:'revoked'},{status:401}) : Response.json(user);
    throw Error('Unexpected authentication request');
  };
  try {
    await app.proxy({cookies,headers:new Headers()});
    assert.equal(await app.currentUser(),null);
    assert.deepEqual(calls,[]);
    put(session);
    await app.proxy({cookies,headers:new Headers()});
    assert.deepEqual(calls,[], 'valid sessions need no proxy network request');
    assert.equal((await app.currentUser()).id,'supabase:verified-id');
    assert.deepEqual(calls,['/auth/v1/user']);
    calls.length=0;
    put({...session,expires_at:1});
    await app.proxy({cookies,headers:new Headers()});
    assert.equal((await app.currentUser()).id,'supabase:verified-id');
    assert.deepEqual(calls,['/auth/v1/token','/auth/v1/user']);
    revoked=true;
    assert.equal(await app.currentUser(),null);
  } finally { globalThis.fetch=originalFetch; jar.clear(); delete globalThis.__authLatency; }
});
