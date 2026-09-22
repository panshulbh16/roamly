import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
test('production worker and application assets exist',()=>{assert.ok(fs.statSync('dist/server/index.js').size>0);const config=JSON.parse(fs.readFileSync('dist/.openai/hosting.json','utf8'));assert.equal(config.d1,'DB');assert.ok(config.project_id);});
test('destination catalogue stays out of the worker startup entrypoint',()=>{
  const entry=fs.readFileSync('dist/server/index.js','utf8');
  assert.ok(Buffer.byteLength(entry)<3_000_000,'Worker startup entrypoint exceeded its 3 MB budget');
  assert.match(entry,/import\([^)]*destinations\.server/,'Catalogue must load on demand');
  assert.ok(fs.readdirSync('dist/server/assets').some(name=>name.startsWith('destinations.server-')));
});
