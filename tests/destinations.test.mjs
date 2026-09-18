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
  assert.deepEqual(suggestDestinations('bangalo')[0], expected);
  assert.equal(resolveDestination('München')?.kind, 'city');
  assert.equal(resolveDestination('München, India'), null);
  const response = await GET(new Request('https://roamly.test/api/destinations?query=bangalore'));
  assert.deepEqual((await response.json()).suggestions[0], expected);
});
