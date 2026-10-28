// worker/tools/worker-guard.mjs --edit (077, the edit of a national order, live test 28/10 F13): the marker
// rpc: "plan_order_read" (GET /plan/orders/:id), exactly once. --edit 0 before that deploy (the live source of 28/10,
// Worker bacc4240 = 44ee6e7d, has none), --edit 1 after it; only after --f5 1. Without --edit: as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-edit-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const SRC = write('index.js', src);
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
// the switch as this branch holds it (open since day L, 28/10)
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1'];

test('this source: --edit 1 → GUARD OK (29 markers, edit=1); --edit 0 stops on the one marker', () => {
  let r = run(SRC, ...BASE, '--edit', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(29 markers, plan=${PLAN}, handover=1, f3=1, f5=1, edit=1\\)`));
  r = run(SRC, ...BASE, '--edit', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}rpc: "plan_order_read" \(077, F13\) = 1/);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the live Worker before 077 (source 44ee6e7d = bacc4240): --edit 0 OK, --edit 1 stops', (t) => {
  let live;
  try {
    live = execFileSync('git', ['show', '44ee6e7d:worker/src/index.js'], { cwd: here, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('commit 44ee6e7d not in this clone: the before-077 check is not run'); return; }
  const f = write('live.js', live);
  assert.equal(run(f, ...BASE, '--edit', '0').code, 0, 'the live script has no plan_order_read route');
  const r = run(f, ...BASE, '--edit', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}rpc: "plan_order_read" \(077, F13\) = 0/);
});

test('the route row twice (a merge gone wrong) is a STOP; without --edit the answer is the F5 one, unchanged', () => {
  const r = run(write('twice.js', `${src}\n// rpc: "plan_order_read"\n`), ...BASE, '--edit', '1');
  assert.equal(r.code, 1, r.out);
  const plain = run(SRC, ...BASE);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /GUARD OK \(28 markers/);
  assert.doesNotMatch(plain.out, /plan_order_read/);
});

test('bad usage → exit 2: --edit without --f5 1, out of place, bad value, a flag after it', () => {
  for (const args of [
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '0', '--edit', '1'],
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--edit', '1'],
    [...BASE, '--edit', '2'],
    [...BASE, '--edit'],
    [...BASE, '--edit', '1', '--x', '1'],
    [...BASE, '--f6', '1']
  ]) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
});
