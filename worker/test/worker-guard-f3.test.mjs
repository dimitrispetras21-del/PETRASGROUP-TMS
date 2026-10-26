// worker/tools/worker-guard.mjs --f3 (national v5 F3): the deploy guard knows the F3 marker "v_rt_cycle" (073 /
// E21: GET /costs/rt reads the end of a v5 cycle). Before the F3 deploy the live script must NOT have it (--f3 0),
// after it must (--f3 1). Without --f3 the tool answers exactly as before (its own test, worker-guard.test.mjs).
// On this chain the guard also takes --handover (072b, H-18): F3 is built on it, so --f3 1 needs --handover 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const SRC = path.join(here, '..', 'src', 'index.js');
const src = readFileSync(SRC, 'utf8');
const plan = src.includes('var PLAN_PERMS = {') ? '1' : '0';                 // on deploy/worker-plan-f3: 1
const handover = src.includes('rpc: "plan_seg_change"') ? '1' : '0';         // on deploy/worker-plan-f3: 1
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-f3-'));
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const base = ['--plan', plan, '--handover', handover];

test('the F3 source passes with --f3 1 and fails with --f3 0, naming the marker', () => {
  assert.equal(handover, '1', 'F3 is built on the vehicle handover (one chain)');
  let r = run(SRC, ...base, '--f3', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(\\d+ markers, plan=${plan}, handover=${handover}, f3=1\\)`));
  r = run(SRC, ...base, '--f3', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}"v_rt_cycle" \(F3, E21\) = 1/);
});

test('a script without the F3 code: --f3 0 passes, --f3 1 stops', () => {
  const f = path.join(dir, 'f2-only.js');
  writeFileSync(f, src.split('"v_rt_cycle"').join('"v_rt_cycle_gone"'));
  assert.equal(run(f, ...base, '--f3', '0').code, 0);
  const r = run(f, ...base, '--f3', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}"v_rt_cycle" \(F3, E21\) = 0/);
});

test('bad --f3 usage → exit 2; without --f3 the answer is unchanged', () => {
  assert.equal(run(SRC, ...base, '--f3', '2').code, 2);
  assert.equal(run(SRC, ...base, '--f3', 'NaN').code, 2, 'a non-finite --f3 is bad usage too');
  assert.equal(run(SRC, ...base, '--f3').code, 2, 'a flag without its value');
  assert.equal(run(SRC, ...base, '--f4', '1').code, 2);
  assert.equal(run(SRC, ...base, '--f3', '1', 'x').code, 2);
  assert.equal(run(SRC, '--plan', '1', '--handover', '0', '--f3', '1').code, 2, 'f3 1 needs handover 1');
  assert.equal(run(SRC, '--plan', plan, '--f3', '1').code, 2, '--handover is never optional');
  const r = run(SRC, ...base);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /v_rt_cycle/);
});
