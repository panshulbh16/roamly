import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
test('production worker and application assets exist',()=>{assert.ok(fs.statSync('dist/server/index.js').size>0);const config=JSON.parse(fs.readFileSync('dist/.openai/hosting.json','utf8'));assert.equal(config.d1,'DB');assert.ok(config.project_id);});
