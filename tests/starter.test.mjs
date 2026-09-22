import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(process.cwd(), '.unit-starter-'));
const state = [], refs = [];
let cursor = 0, refCursor = 0;
globalThis.__starterHooks = {
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
  useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
};
const compiled = await build({ stdin: { contents: `export {Workspace} from './components/trips/workspace'; export {starterItinerary} from './lib/trips/starter';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'hooks', setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next/link.js', external: true }));
  b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fixture' }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: process.cwd(), contents: path === 'navigation' ? 'const params=new URLSearchParams(); export const useSearchParams=()=>params; export const usePathname=()=>"/";' : `export * from ${JSON.stringify(join(process.cwd(), 'node_modules/react/index.js'))}; export const useState=globalThis.__starterHooks.useState; export const useRef=globalThis.__starterHooks.useRef; export const useEffect=()=>{};` }));
} }] });
writeFileSync(join(dir, 'fixture.mjs'), compiled.outputFiles[0].text);
const { Workspace, starterItinerary } = await import(pathToFileURL(join(dir, 'fixture.mjs')));
test.after(() => { rmSync(dir, { recursive: true, force: true }); delete globalThis.__starterHooks; });
const input = { destination: 'Bareilly', startDate: '2026-12-20', days: 4, travelers: 2, budget: 'Comfort', pace: 'Balanced', interests: ['Nature'], needs: 'Step-free access', homeCity: '' };
function render() { cursor = refCursor = 0; return Workspace({ aiReady: true }); }
function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (Array.isArray(node)) return node.map(text).join(' '); return node?.props ? text(node.props.children) : ''; }
const button = (tree, name) => nodes(tree).find(n => n.type === 'button' && text(n) === name);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('starter is synchronous, bounded and explicitly provisional for all trip lengths and paces', () => {
  for (let days = 1; days <= 10; days++) for (const pace of ['Relaxed', 'Balanced', 'Packed']) {
    const draft = starterItinerary({ ...input, days, pace });
    assert.equal(draft.days.length, days);
    assert.equal(draft.days[0].activities.length, pace === 'Relaxed' ? 2 : 3);
    assert.match(draft.summary, /prebuilt/);
    assert.ok(draft.days.every(d => d.activities.every(a => a.place === 'Place to be selected')));
  }
});

test('starter appears before network, survives failure, ignores partial output and is replaced only on completion', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = { scrollTo() {} };
  try {
    state.length = refs.length = 0;
    render(); state[0] = input;
    let reject;
    globalThis.fetch = () => new Promise((_, fail) => { reject = fail; });
    const form = nodes(render()).find(n => n.type === 'form' && n.props.onSubmit);
    const pending = form.props.onSubmit({ preventDefault() {} });
    let tree = render();
    assert.match(text(tree), /INSTANT STARTER · DRAFT/);
    assert.equal(nodes(tree).filter(n => n.props?.className === 'day-card').length, 4);
    assert.equal(button(tree, 'Save trip'), undefined);
    reject(new Error('Provider unavailable')); await pending;
    tree = render(); assert.match(text(tree), /Provider unavailable/); assert.match(text(tree), /INSTANT STARTER/);
    let stream;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { stream = c; } }));
    const retry = button(tree, 'Retry personalization').props.onClick();
    await tick();
    stream.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'preview', itinerary: { title: 'Partial AI' } }) + '\n'));
    await tick(); assert.doesNotMatch(text(render()), /Partial AI/);
    const trip = { id: '123e4567-e89b-42d3-a456-426614174000', intake: input, itinerary: { ...starterItinerary(input), title: 'Completed personal itinerary' }, source: 'ai', createdAt: '2026-09-19T00:00:00Z' };
    stream.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'complete', trip, historyId: null }) + '\n')); stream.close();
    await tick(); await retry;
    assert.match(text(render()), /Completed personal itinerary/); assert.doesNotMatch(text(render()), /INSTANT STARTER/);

    state.length = refs.length = 0; render(); state[0] = input;
    let oldResolve;
    globalThis.fetch = () => new Promise(resolve => { oldResolve = resolve; });
    const old = nodes(render()).find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} });
    button(render(), 'Edit trip details').props.onClick();
    assert.doesNotMatch(text(render()), /INSTANT STARTER/);
    let nextReject;
    globalThis.fetch = () => new Promise((_, reject) => { nextReject = reject; });
    const next = nodes(render()).find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} });
    oldResolve(new Response(JSON.stringify({ type: 'complete', trip, historyId: null }) + '\n'));
    await old;
    assert.match(text(render()), /Personalizing your trip/);
    assert.doesNotMatch(text(render()), /Completed personal itinerary/);
    nextReject(new Error('Second request failed')); await next;
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('unrecognized and inherited interest names cannot crash an instant starter', () => {
  for (const interests of [[], ['constructor'], ['__proto__'], ['toString'], ['Food', 'constructor'], ['not-an-interest']]) {
    const draft = starterItinerary({ ...input, interests });
    assert.equal(draft.days.length, input.days);
    assert.ok(draft.days.every(day => day.activities.every(activity => typeof activity.title === 'string')));
  }
});

test('HTTP errors, corrupt chunks and truncated completions preserve the starter; duplicate submits make one request', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = { scrollTo() {} };
  try {
    for (const response of [Response.json({ error: 'Daily limit' }, { status: 429 }), new Response('broken json\n'), new Response('{"type":"complete","trip":{}}\n'), new Response('{"type":"preview","itinerary":{"title":"partial"}}\n')]) {
      state.length = refs.length = 0; render(); state[0] = input;
      let calls = 0, release;
      globalThis.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
      const submit = nodes(render()).find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit;
      const first = submit({ preventDefault() {} });
      await submit({ preventDefault() {} });
      assert.equal(calls, 1);
      release(response); await first;
      const tree = render();
      assert.match(text(tree), /INSTANT STARTER/);
      assert.ok(nodes(tree).some(n => n.props?.role === 'alert'));
      assert.ok(button(tree, 'Retry personalization'));
    }
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('day and activity controls reorder plans and regeneration preserves other days',async()=>{
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
  globalThis.window={scrollTo(){}};
  state.length=refs.length=0;render();
  // Existing trip state follows form/busy/error/suggestions.
  const itinerary=starterItinerary({...input,days:3});
  itinerary.days.forEach((d,i)=>{d.title='Original '+i;d.activities.forEach((a,j)=>a.title=`Day ${i} activity ${j}`);});
  const trip={id:'123e4567-e89b-42d3-a456-426614174000',intake:{...input,days:3},itinerary,source:'ai',createdAt:new Date().toISOString()};
  state[4]=structuredClone(trip);
  try{
    const earlier=nodes(render()).find(n=>n.props?.['aria-label']==='Move Day 0 activity 1 earlier');
    earlier.props.onClick();
    assert.equal(state[4].itinerary.days[0].activities[0].title,'Day 0 activity 1');
    assert.equal(state[4].itinerary.days[0].activities[0].time,trip.itinerary.days[0].activities[0].time);
    const move=nodes(render()).filter(n=>n.type==='button'&&text(n)==='Move day later')[0];move.props.onClick();
    assert.equal(state[4].itinerary.days[1].title,'Original 0');
    const prior=structuredClone(state[4].itinerary.days);
    globalThis.fetch=async()=>Response.json({day:{title:'Replacement',activities:prior[0].activities}});
    const regenerate=nodes(render()).find(n=>n.type==='button'&&text(n)==='Regenerate this day · 1 AI plan');
    regenerate.props.onClick();await tick();await tick();
    assert.equal(state[4].itinerary.days[0].title,'Replacement');
    assert.deepEqual(state[4].itinerary.days.slice(1),prior.slice(1));
  }finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;}
});
