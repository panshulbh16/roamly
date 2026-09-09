import { spawnSync } from 'node:child_process';

const [duration = '', command, ...args] = process.argv.slice(2);
const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(duration);
const timeout = match && Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] || 's']);
if (!command || !timeout || !Number.isSafeInteger(timeout) || timeout > 2147483647) {
  console.error('Usage: node scripts/run-bounded.mjs <positive duration> <command> [args...]');
  process.exit(64);
}
const result = spawnSync(command, args, { stdio: 'inherit', timeout, killSignal: 'SIGKILL' });
if (result.error) console.error(result.error.message);
process.exit(result.error?.code === 'ETIMEDOUT' ? 124 : (result.status ?? 1));
