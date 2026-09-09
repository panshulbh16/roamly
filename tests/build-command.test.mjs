import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = (duration, code) => spawnSync(process.execPath, ['scripts/run-bounded.mjs', duration, process.execPath, '-e', code], { encoding: 'utf8' });
test('bounded command preserves success output and failure status', () => {
  const success = run('5s', 'console.log("built")');
  assert.equal(success.status, 0);
  assert.match(success.stdout, /built/);
  assert.equal(run('5s', 'process.exit(7)').status, 7);
});
test('bounded command terminates a hung process', () => {
  assert.equal(run('100ms', 'setInterval(() => {}, 1000)').status, 124);
});
test('invalid durations fail before executing a command', () => {
  for (const duration of ['0', '-1', 'bad', 'Infinity', '999999999h']) {
    const result = run(duration, 'console.log("executed")');
    assert.equal(result.status, 64);
    assert.equal(result.stdout, '');
  }
});
