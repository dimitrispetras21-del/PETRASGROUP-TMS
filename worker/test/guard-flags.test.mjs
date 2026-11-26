// worker/guard-flags.txt holds the worker-guard flags of the Worker on main, and tools/predeploy-check.mjs runs the
// guard with them before every wrangler deploy (ValueDriven 26/11/2026). This keeps the file true on every PR: the
// source on the branch passes the guard with it, so a deploy is never refused because the file fell behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'predeploy-check.mjs');
const run = (args, env) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('the source passes the guard with the flags in guard-flags.txt', () => {
  const r = run(['--guard-only'], { WRANGLER_COMMAND: 'deploy', PETRAS_SKIP_PREDEPLOY: '' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /GUARD OK \(\d+ markers/);
});

test('guard-flags.txt names every flag of the guard, in the guard\'s order', () => {
  // the guard accepts any prefix of its flags, so a file missing the newest one would pass the test above and leave
  // that feature unchecked: the drift that left the CLAUDE.md command two markers behind
  const usage = readFileSync(path.join(here, '..', 'tools', 'worker-guard.mjs'), 'utf8').match(/^\/\/ Usage: .*$/m)[0];
  const guardFlags = usage.match(/--[a-z0-9]+/g);
  const line = readFileSync(path.join(here, '..', 'guard-flags.txt'), 'utf8').split('\n').find((l) => l.trim() && !l.startsWith('#'));
  const fileFlags = line.match(/--[a-z0-9]+/g);
  assert.ok(guardFlags.length >= 2, 'no flags read from the guard usage line');
  assert.deepEqual(fileFlags, guardFlags);
});

test('wrangler dev skips the checks', () => {
  const r = run([], { WRANGLER_COMMAND: 'dev', PETRAS_SKIP_PREDEPLOY: '' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /skipped for wrangler dev/);
  assert.doesNotMatch(r.stdout, /GUARD/);
});
