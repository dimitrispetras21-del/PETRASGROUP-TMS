// worker/tools/worker-guard.mjs --self (101, owner 2/11: «Αυτοπαράδοση», invoiced without an ERP invoice): the marker
// is the map row "Self Delivery": "self_delivery", exactly twice (ORDERS + NATIONAL ORDERS). --self 0 before that
// deploy (089's source has none), --self 1 after it; only after --rate2 1 (built on 089's Worker, one chain).
// Without --self: as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-self-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const SRC = write('index.js', src);
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1'];
// 089's Worker (the one this change is built on): the same source without the two map rows
const before = src.replace(/\n {6}"Self Delivery": "self_delivery",/g, '');
const one = src.replace(/\n {6}"Self Delivery": "self_delivery",/, '');

test('this source: --self 1 → GUARD OK (32 markers, self=1); --self 0 stops on the one marker', () => {
  let r = run(SRC, ...BASE, '--self', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(32 markers, plan=${PLAN}, handover=1, f3=1, f5=1, edit=1, invoiced=1, rate2=1, self=1\\)`));
  r = run(SRC, ...BASE, '--self', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}"Self Delivery": "self_delivery" \(101, ORDERS \+ NATIONAL ORDERS\) = 2/);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before 101 (089\'s): --self 0 OK, --self 1 stops; ONE table mapped (the other would drop the label with a 200) stops', () => {
  assert.notEqual(before, src, 'the 101 rows were found and removed');
  assert.equal(run(write('before.js', before), ...BASE, '--self', '0').code, 0);
  const r = run(write('before1.js', before), ...BASE, '--self', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /= 0/);
  const h = run(write('one.js', one), ...BASE, '--self', '1');
  assert.equal(h.code, 1, h.out);
  assert.match(h.out, /STOP {2}"Self Delivery": "self_delivery" \(101, ORDERS \+ NATIONAL ORDERS\) = 1/);
});

test('without --self the answer is the --rate2 one, unchanged', () => {
  const plain = run(SRC, ...BASE);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /GUARD OK \(31 markers/);
  assert.doesNotMatch(plain.out, /Self Delivery/);
});

test('bad usage → exit 2: --self without --rate2 1, out of place, bad value, a flag after it', () => {
  const noR2 = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '0'];
  for (const args of [
    [...noR2, '--self', '1'],
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--self', '1'],
    [...BASE, '--self', '2'],
    [...BASE, '--self'],
    [...BASE, '--self', '1', '--x', '1'],
    [...BASE, '--selff', '1']
  ]) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
});
