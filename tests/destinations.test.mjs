import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['lib/trips/destinations.server.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { resolveDestination, suggestDestinations } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const route = await build({ entryPoints: ['app/api/destinations/route.ts'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'workers', setup(build) { build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'workers', namespace: 'fixture' })); build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const env={}' })); } }] });
const { GET } = await import('data:text/javascript;base64,' + Buffer.from(route.outputFiles[0].text).toString('base64'));

test('destination catalogue resolves countries, continents, cities and town variants', () => {
  assert.deepEqual(resolveDestination('India'), { name: 'India', kind: 'country' });
  assert.deepEqual(resolveDestination('Europe'), { name: 'Europe', kind: 'continent' });
  assert.equal(resolveDestination('Kyoto, Japan')?.kind, 'city');
  assert.equal(resolveDestination('München, Germany')?.kind, 'city');
  assert.equal(resolveDestination('USA')?.name, 'United States');
  assert.equal(resolveDestination('bkldfmlb'), null);
  assert.equal(resolveDestination('Kyoto, India'), null);
});
test('destination suggestions are bounded, normalized and useful for prefixes and small typos', () => {
  assert.ok(suggestDestinations('pari').some(x => x.name.startsWith('Paris')));
  assert.ok(suggestDestinations('Bangaluru').some(x => x.name.startsWith('Bengaluru')));
  assert.equal(suggestDestinations('x').length, 0);
  assert.ok(suggestDestinations('new').length <= 5);
  assert.equal(new Set(suggestDestinations('new').map(x => x.name)).size, suggestDestinations('new').length);
});
test('destination suggestion endpoint bounds input and returns public cacheable results', async () => {
  const response = await GET(new Request('https://roamly.test/api/destinations?query=tok'));
  assert.match(response.headers.get('Cache-Control'), /max-age=3600/);
  const { suggestions } = await response.json();
  assert.ok(suggestions.some(x => x.name.startsWith('Tokyo')));
  assert.deepEqual((await GET(new Request('https://roamly.test/api/destinations?query=x'))).status, 200);
  assert.deepEqual((await GET(new Request('https://roamly.test/api/destinations?query=x'))).status, 200);
});

test('Bangalore aliases resolve to Bengaluru with valid qualifiers and lead suggestions', async () => {
  const expected = { name: 'Bengaluru, Karnataka, India', kind: 'city' };
  for (const query of ['bangalore', ' BANGALORE ', 'Bangalore, India', 'Bangalore, Karnataka, India', 'Bengaluru']) {
    assert.deepEqual(resolveDestination(query), expected);
    assert.deepEqual(suggestDestinations(query)[0], expected);
  }
  assert.equal(resolveDestination('Bangalore, Australia'), null);
  assert.ok(suggestDestinations('bangalo').some(match => match.name === expected.name));
  assert.equal(resolveDestination('München')?.kind, 'city');
  assert.equal(resolveDestination('München, India'), null);
  const response = await GET(new Request('https://roamly.test/api/destinations?query=bangalore'));
  assert.deepEqual((await response.json()).suggestions[0], expected);
});

test('Indian city names accept Delhi and historic aliases without hiding qualified overseas towns', async () => {
  const cases = [
    ['delhi', 'Delhi, India'],
    ['Delhi, India', 'Delhi, India'],
    ['New Delhi', 'New Delhi, Delhi, India'],
    ['bombay', 'Mumbai, Maharashtra, India'],
    ['Bombay, Maharashtra, India', 'Mumbai, Maharashtra, India'],
    ['madras', 'Chennai, Tamil Nadu, India'],
    ['MADRAS, India', 'Chennai, Tamil Nadu, India'],
  ];
  for (const [query, name] of cases) {
    assert.deepEqual(resolveDestination(query), { name, kind: 'city' });
    assert.equal(suggestDestinations(query)[0]?.name, name);
    const response = await GET(new Request('https://roamly.test/api/destinations?query=' + encodeURIComponent(query)));
    assert.equal((await response.json()).suggestions[0]?.name, name);
  }
  assert.equal(resolveDestination('Madras, Oregon, United States')?.name, 'Madras, Oregon, United States');
  assert.equal(resolveDestination('Bombay, New Zealand')?.name, 'Bombay, Auckland, New Zealand');
  assert.equal(resolveDestination('Delhi, California, United States')?.name, 'Delhi, California, United States');
  assert.equal(resolveDestination('Madras, Australia'), null);
  assert.equal(resolveDestination('Bombay, Tamil Nadu, India'), null);
});

test('global source names resolve historical, localized and native-script city names', () => {
  for (const [query, canonical] of [
    ['Calcutta, India', 'Kolkata'], ['Peking, China', 'Beijing'],
    ['Saigon, Vietnam', 'Ho Chi Minh City'], ['Muenchen, Germany', 'Munich'],
    ['Firenze, Italy', 'Florence'], ['मुंबई, India', 'Mumbai'],
    ['ಬೆಂಗಳೂರು, India', 'Bengaluru'], ['東京, Japan', 'Tokyo'],
  ]) {
    assert.ok(resolveDestination(query)?.name.startsWith(canonical), query);
    assert.ok(suggestDestinations(query)[0]?.name.startsWith(canonical), query);
  }
  assert.equal(resolveDestination('Calcutta, Germany'), null);
  assert.equal(resolveDestination('bkldfmlb'), null);
});

test('generated name index stays sorted, unique and points to valid city records', async () => {
  const { readFile } = await import('node:fs/promises');
  const index = JSON.parse(await readFile('data/locations/name-index.json', 'utf8'));
  const cities = JSON.parse(await readFile('data/locations/cities.json', 'utf8'));
  assert.ok(index.length > cities.length);
  let previous = '';
  for (const row of index) {
    const [name, references] = row.split('\t');
    assert.ok(name > previous, name);
    const ids = references.split(',').map(Number);
    assert.ok(ids.length > 0 && ids.every(id => Number.isInteger(id) && cities[id]), name);
    assert.equal(new Set(ids).size, ids.length, name);
    previous = name;
  }
});

test('object property names cannot masquerade as real destinations', async () => {
  for (const query of ['constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(resolveDestination(query), null, query);
    const data = await (await GET(new Request('https://roamly.test/api/destinations?query=' + query))).json();
    assert.equal(data.resolved, null);
    assert.ok(data.suggestions.every(match => typeof match.name === 'string'));
  }
});
test('punctuation-normalized names still use catalogue records', () => {
  assert.deepEqual(resolveDestination('__proto__'), resolveDestination('proto'));
  assert.equal(typeof resolveDestination('__proto__')?.name, 'string');
});
test('oversized destination queries are rejected before catalogue lookup', async () => {
  const response = await GET(new Request('https://roamly.test/api/destinations?query=' + 'a'.repeat(50000)));
  assert.equal(response.status, 400);
});
