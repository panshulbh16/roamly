import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const cost = await vite.ssrLoadModule('/lib/trips/cost.ts');
const input = { destination: 'Kyoto, Japan', days: 3, travelers: 2, budget: 'Comfort' };
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
  for (const style of cost.styles) assert.ok(links.includes(`budget=${style}`));
  assert.equal(renderToStaticMarkup(React.createElement(TripCostLinks, { input: { ...input, destination: '' } })), '');
  const page = renderToStaticMarkup(React.createElement(CostBreakdown, { input }));
  assert.match(page, /aria-current="page"/);
  assert.match(page, /Display currency/);
  assert.match(page, /WHOLE GROUP/);
  assert.match(page, /not booking quotes/);
  assert.match(page, /Flights, intercity travel/);
  assert.match(page, /Loading estimate/);
  assert.match(page, /&amp;band=Mid%20cost/);
});
