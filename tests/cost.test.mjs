import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true, ws: false } });
after(() => vite.close());
const cost = await vite.ssrLoadModule('/lib/trips/cost.ts');
const input = { destination: 'Kyoto, Japan', startDate: '2026-12-20', days: 3, travelers: 2, budget: 'Comfort' };
test('all days, travelers, styles and cost bands produce finite reconciled totals', () => {
  for (let days = 1; days <= 10; days++) for (let travelers = 1; travelers <= 10; travelers++) for (const band of cost.bands) {
    let previous = 0;
    for (const budget of cost.styles) {
      const result = cost.estimateCost({ ...input, days, travelers, budget }, band);
      assert.equal(result.nights, days - 1);
      assert.equal(result.rooms, Math.ceil(travelers / 2));
      assert.equal(result.low, result.rows.reduce((s, r) => s + r.low, 0));
      assert.equal(result.high, result.rows.reduce((s, r) => s + r.high, 0));
      assert.ok(Number.isFinite(result.high) && result.high >= result.low && result.low > previous);
      previous = result.low;
      if (days === 1) assert.deepEqual(result.rows[0], { key: 'stay', low: 0, high: 0 });
    }
  }
});
test('shared rooms and per-person expenses use separate quantities', () => {
  const a = cost.estimateCost({ ...input, travelers: 1 }, 'Mid cost');
  const b = cost.estimateCost({ ...input, travelers: 2 }, 'Mid cost');
  const c = cost.estimateCost({ ...input, travelers: 3 }, 'Mid cost');
  assert.equal(a.rows[0].low, b.rows[0].low);
  assert.equal(c.rows[0].low, a.rows[0].low * 2);
  assert.equal(b.rows[1].low, a.rows[1].low * 2);
});
test('rejects corrupt URL inputs and preserves Unicode and special characters', () => {
  for (const patch of [{ days: 0 }, { days: 11 }, { days: 1.5 }, { days: NaN }, { travelers: -1 }, { travelers: 11 }, { budget: 'Unknown' }, { destination: '' }]) assert.equal(cost.costInputSchema.safeParse({ ...input, ...patch }).success, false);
  for (const destination of ['京都 日本', 'São Paulo, Brazil', 'A&B / + #?']) {
    const url = new URL(cost.costUrl({ ...input, destination }), 'http://localhost');
    assert.equal(url.searchParams.get('destination'), destination);
  }
});
test('country suggestions avoid substring matches and unknown destinations are explicit', () => {
  assert.deepEqual(cost.destinationBand('Goa'), { country: 'India', band: 'Lower cost' });
  assert.deepEqual(cost.destinationBand('Paris, France'), { country: 'France', band: 'Higher cost' });
  assert.deepEqual(cost.destinationBand('Somewhere unknown'), { country: null, band: 'Mid cost' });
  assert.equal(cost.destinationBand('NotIndia').country, null);
});
test('currency defaults, preference codes and malformed provider data', () => {
  assert.equal(cost.currencyForCountry('IN'), 'INR');
  assert.equal(cost.currencyForCountry('DE'), 'EUR');
  assert.equal(cost.browserCurrency('en-US', 'Asia/Calcutta'), 'INR');
  assert.equal(cost.browserCurrency('en-GB', 'Europe/London'), 'GBP');
  assert.equal(cost.browserCurrency('invalid_locale', 'Unknown'), 'USD');
  const valid = { base: 'USD', quote: 'INR', rate: 90, date: '2026-09-10' };
  assert.equal(cost.validRate(valid, 'INR'), true);
  for (const patch of [{ rate: NaN }, { rate: 0 }, { rate: -1 }, { rate: Infinity }, { rate: '90' }, { quote: 'EUR' }, { base: 'EUR' }, { date: null }]) assert.equal(cost.validRate({ ...valid, ...patch }, 'INR'), false);
});
test('currency endpoint respects preference, validates input and handles provider failure', async () => {
  const { GET } = await vite.ssrLoadModule('/app/api/currency/route.ts');
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async url => { calls++; assert.equal(url, 'https://api.frankfurter.dev/v2/rate/USD/INR'); return Response.json({ base: 'USD', quote: 'INR', rate: 90, date: '2026-09-10' }); };
    const r = await GET(new Request('http://localhost/api/currency', { headers: { 'cf-ipcountry': 'IN' } }));
    assert.equal((await r.json()).currency, 'INR');
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    const usd = await GET(new Request('http://localhost/api/currency?currency=USD', { headers: { 'cf-ipcountry': 'IN' } }));
    assert.equal((await usd.json()).rate, 1);
    assert.equal(calls, 1);
    assert.equal((await GET(new Request('http://localhost/api/currency?currency=BAD'))).status, 400);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await GET(new Request('http://localhost/api/currency?currency=INR'))).status, 503);
    globalThis.fetch = async () => Response.json({ rate: -3 });
    assert.equal((await GET(new Request('http://localhost/api/currency?currency=INR'))).status, 503);
  } finally { globalThis.fetch = original; }
});
test('style cards keep unsaved planner open and cost page exposes assumptions accessibly', async () => {
  const { TripCostLinks, CostBreakdown } = await vite.ssrLoadModule('/components/trips/trip-cost.tsx');
  const links = renderToStaticMarkup(React.createElement(TripCostLinks, { input }));
  assert.equal((links.match(/target="_blank"/g) ?? []).length, 3);
  assert.equal((links.match(/class="cost-shortcut"/g) ?? []).length, 3);
  assert.equal((links.match(/width="16"/g) ?? []).length, 3);
  assert.doesNotMatch(links, /<h2|<small|What could your trip cost|Simple stays/);
  for (const style of cost.styles) assert.ok(links.includes(`budget=${style}`));
  for (const patch of [{ destination: '' }, { startDate: '' }, { startDate: '2026-02-30' }]) {
    const disabled = renderToStaticMarkup(React.createElement(TripCostLinks, { input: { ...input, ...patch } }));
    assert.equal((disabled.match(/disabled=""/g) ?? []).length, 3);
    assert.doesNotMatch(disabled, /href=/);
    assert.match(disabled, /Add a destination and departure date first/);
  }
  const page = renderToStaticMarkup(React.createElement(CostBreakdown, { input }));
  assert.match(page, /aria-current="page"/);
  assert.match(page, /Display currency/);
  assert.match(page, /WHOLE GROUP/);
  assert.match(page, /not booking quotes/);
  assert.match(page, /Flights, intercity travel/);
  assert.doesNotMatch(page, /Loading estimate/);
  assert.match(page, /\$748/);
  assert.match(page, /&amp;band=Mid%20cost/);
});

test('57,600 planner filter combinations retain dates and validate cost inputs', async () => {
  const { intakeSchema } = await vite.ssrLoadModule('/lib/trips/schema.ts');
  const interests = ['Nature', 'Food', 'Culture', 'Adventure', 'Photography', 'Relaxation'];
  let count = 0;
  for (let days = 1; days <= 10; days++) for (let travelers = 1; travelers <= 10; travelers++)
    for (const budget of cost.styles) for (const pace of ['Relaxed', 'Balanced', 'Packed'])
      for (let mask = 0; mask < 64; mask++) {
        const form = { ...input, days, travelers, budget, pace, interests: interests.filter((_, i) => mask & (1 << i)), needs: '', homeCity: '' };
        assert.equal(intakeSchema.safeParse(form).success, true);
        const query = Object.fromEntries(new URL(cost.costUrl(form), 'http://localhost').searchParams);
        assert.deepEqual(cost.costInputSchema.parse(query), { destination: input.destination, startDate: input.startDate, days, travelers, budget });
        count++;
      }
  assert.equal(count, 57600);
});
test('calendar boundary and missing-date cases cannot produce an estimate', () => {
  for (const startDate of ['', undefined, '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', 'not-a-date']) {
    assert.equal(cost.costInputSchema.safeParse({ ...input, startDate }).success, false);
    assert.throws(() => cost.estimateCost({ ...input, startDate }, 'Mid cost'));
  }
  for (const startDate of ['2028-02-29', '2026-12-31', '2027-01-01']) {
    const url = new URL(cost.costUrl({ ...input, startDate }), 'http://localhost');
    assert.equal(cost.costInputSchema.parse(Object.fromEntries(url.searchParams)).startDate, startDate);
  }
});
test('all selectable currencies format bounded estimates without crashing', () => {
  for (const currency of cost.currencies) {
    const formatter = new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 });
    assert.ok(formatter.format(1234567).length > 0);
  }
});

test('planner date control keeps both native event paths wired', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../components/trips/workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /onChange=\{\(e\) => update\("startDate", e\.target\.value\)\}/);
  assert.match(source, /onInput=\{\(e\) => update\("startDate", e\.currentTarget\.value\)\}/);
});

test('budget choices only select a preference and result estimate stays on the itinerary', async () => {
  const { BudgetSelector, CostBreakdown } = await vite.ssrLoadModule('/components/trips/trip-cost.tsx');
  for (const value of cost.styles) {
    let selected;
    const element = BudgetSelector({value,onChange: next => {selected = next;}});
    const buttons = element.props.children[1].props.children;
    for (const button of buttons) {
      assert.equal(button.props.type,'button');
      assert.equal(button.props.href,undefined);
      button.props.onClick();
      assert.equal(selected,button.key);
    }
    const html=renderToStaticMarkup(element);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length,1);
    assert.doesNotMatch(html,/target=|href=|Loading estimate/);
  }
  const result=renderToStaticMarkup(React.createElement(CostBreakdown,{input,embedded:true}));
  assert.match(result,/Trip cost estimate/);
  assert.doesNotMatch(result,/href="\/cost|aria-label="Travel style"/);
});


test('domestic comfort allowances use INR and support real trip budgets without FX', async () => {
  const domestic = { ...input, destination: 'Bareilly, Uttar Pradesh, India', days: 4 };
  const result = cost.estimateCost(domestic, 'Lower cost');
  assert.equal(result.currency, 'INR');
  assert.equal(result.low, 19888);
  assert.equal(result.high, 32318);
  const custom = cost.estimateCost(domestic, 'Lower cost', { stay: 2000, food: 500, transport: 250, activities: 0 });
  assert.equal(custom.low, 10560);
  assert.equal(custom.high, 17160);
  assert.throws(() => cost.estimateCost(domestic, 'Lower cost', { stay: -1, food: 0, transport: 0, activities: 0 }));
  const { CostBreakdown } = await vite.ssrLoadModule('/components/trips/trip-cost.tsx');
  const html = renderToStaticMarkup(React.createElement(CostBreakdown, { input: domestic }));
  assert.match(html, /19,888/);
  assert.match(html, /INR, per room/);
  assert.doesNotMatch(html, /Loading estimate/);
});

test('same-currency India estimate never calls the exchange-rate provider', async () => {
  const { GET } = await vite.ssrLoadModule('/app/api/currency/route.ts');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    const response = await GET(new Request('https://roamly.test/api/currency?base=INR&currency=INR'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { base: 'INR', currency: 'INR', rate: 1, date: null });
    assert.equal((await GET(new Request('https://roamly.test/api/currency?base=BAD&currency=INR'))).status, 400);
    globalThis.fetch = async url => {
      assert.equal(url, 'https://api.frankfurter.dev/v2/rate/INR/USD');
      return Response.json({ base: 'INR', quote: 'USD', rate: 0.011, date: '2026-09-18' });
    };
    assert.equal((await (await GET(new Request('https://roamly.test/api/currency?base=INR&currency=USD'))).json()).rate, 0.011);
  } finally { globalThis.fetch = original; }
});

test('custom allowances reject missing categories, non-numbers and extreme values', () => {
  const valid = { stay: 2000, food: 500, transport: 250, activities: 0 };
  for (const key of Object.keys(valid)) {
    for (const value of [undefined, null, '100', NaN, Infinity, -1, 1000001]) {
      assert.throws(() => cost.estimateCost(input, 'Mid cost', { ...valid, [key]: value }), `${key}: ${value}`);
    }
    const missing = { ...valid }; delete missing[key];
    assert.throws(() => cost.estimateCost(input, 'Mid cost', missing), key);
  }
  const free = cost.estimateCost({ ...input, days: 10, travelers: 10 }, 'Higher cost', { stay: 0, food: 0, transport: 0, activities: 0 });
  assert.equal(free.high, 0);
  assert.equal(free.low, 0);
});

test('return fares, shared car costs and chosen rooms reconcile without double counting',()=>{
  const trip={...input,destination:'Goa, India',homeCity:'Bareilly',days:4,travelers:2};
  const base=cost.estimateCost(trip,'Lower cost');
  const train=cost.estimateCost(trip,'Lower cost',undefined,{rooms:1,mode:'Train',fare:1500});
  const car=cost.estimateCost(trip,'Lower cost',undefined,{rooms:1,mode:'Car',fare:1500});
  assert.equal(train.low-base.low,3300);
  assert.equal(car.low-base.low,1650);
  assert.deepEqual(train.rows.find(r=>r.key==='journey'),{key:'journey',low:3000,high:3000});
  const separate=cost.estimateCost(trip,'Lower cost',undefined,{rooms:2,mode:'Not included',fare:0});
  assert.equal(separate.rows[0].low,base.rows[0].low*2);
  for(const patch of [{rooms:0},{rooms:3},{fare:-1},{fare:Infinity},{mode:'constructor'}])assert.throws(()=>cost.estimateCost(trip,'Lower cost',undefined,{rooms:1,mode:'Train',fare:100,...patch}));
  assert.match(cost.costUrl(trip),/homeCity=Bareilly/);
});
