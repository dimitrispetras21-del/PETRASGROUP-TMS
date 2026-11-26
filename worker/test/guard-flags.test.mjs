// worker/guard-flags.txt holds the worker-guard flags of the Worker on main, and tools/predeploy-check.mjs runs the
// guard with them before every wrangler deploy (ValueDriven 26/11/2026). This keeps the file true on every PR: the
// source on the branch passes the guard with it, so a deploy is never refused because the file fell behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('wrangler dev skips the checks', () => {
  const r = run([], { WRANGLER_COMMAND: 'dev', PETRAS_SKIP_PREDEPLOY: '' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /skipped for wrangler dev/);
  assert.doesNotMatch(r.stdout, /GUARD/);
});
