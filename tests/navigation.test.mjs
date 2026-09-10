import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

let pathname = '/';
globalThis.__roamlyNavigationTest = () => pathname;
const compiled = await build({
  entryPoints: ['components/trips/app-shell.tsx'], bundle: true, write: false,
  format: 'esm', platform: 'node',
  plugins: [{ name: 'navigation-fixture', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const usePathname = () => globalThis.__roamlyNavigationTest();' }));
  } }],
});
const { AppShell } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('route changes reset the open itinerary and mobile sidebar together', () => {
  const shells = ['/', '/trips', '/explore', '/pricing'].map(route => {
    pathname = route;
    return AppShell({ user: null, children: null });
  });
  assert.equal(new Set(shells.map(shell => shell.key)).size, 4);
  assert.ok(shells.every(shell => shell.key !== null));
  pathname = '/trips';
  assert.equal(AppShell({ user: null, children: null }).key, shells[1].key);
});
test.after(() => { delete globalThis.__roamlyNavigationTest; });

test('main navigation prefetches its four routes', () => {
  const shell = AppShell({ user: null, children: null });
  const links = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.props?.prefetch === true) links.push(node.props.href);
    visit(node.props?.children);
  }
  visit(shell);
  assert.deepEqual(links, ['/', '/trips', '/history', '/explore']);
});
