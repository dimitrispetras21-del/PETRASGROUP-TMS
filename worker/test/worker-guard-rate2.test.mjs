// worker/tools/worker-guard.mjs --rate2 (089, P-7, owner 31/10 + 1/11: the partner rate of the ANODOS): the marker is
// the PLAN_CHECK_TEXT key seg_partner_rate_anodos:, exactly once. --rate2 0 before that deploy (085's source has none),
// --rate2 1 after it; only after --invoiced 1 (089's Worker is built on 085's, one chain). Without --rate2: as before.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-rate2-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const SRC = write('index.js', src);
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1'];
// 085's Worker (the one this change is built on): the same source without the one 089 line
const before = src.replace(/\n {2}\/\/ 089 \(P-7[^\n]*\n {2}seg_partner_rate_anodos: "[^"\n]*",/, '');

test('this source: --rate2 1 → GUARD OK (31 markers, rate2=1); --rate2 0 stops on the one marker', () => {
  let r = run(SRC, ...BASE, '--rate2', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(31 markers, plan=${PLAN}, handover=1, f3=1, f5=1, edit=1, invoiced=1, rate2=1\\)`));
  r = run(SRC, ...BASE, '--rate2', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}seg_partner_rate_anodos: \(089, P-7\) = 1/);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before 089 (085\'s): --rate2 0 OK, --rate2 1 stops', () => {
  assert.notEqual(before, src, 'the 089 line was found and removed');
  const f = write('before.js', before);
  assert.equal(run(f, ...BASE, '--rate2', '0').code, 0, 'the Worker before 089 has no seg_partner_rate_anodos text');
  const r = run(f, ...BASE, '--rate2', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}seg_partner_rate_anodos: \(089, P-7\) = 0/);
});

test('the key twice (a merge gone wrong) is a STOP; without --rate2 the answer is the --invoiced one, unchanged', () => {
  const r = run(write('twice.js', `${src}\n// seg_partner_rate_anodos: "x"\n`), ...BASE, '--rate2', '1');
  assert.equal(r.code, 1, r.out);
  const plain = run(SRC, ...BASE);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /GUARD OK \(30 markers/);
  assert.doesNotMatch(plain.out, /seg_partner_rate_anodos/);
});

test('bad usage → exit 2: --rate2 without --invoiced 1, out of place, bad value, a flag after it', () => {
  const noInv = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '0'];
  for (const args of [
    [...noInv, '--rate2', '1'],
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--rate2', '1'],
    [...BASE, '--rate2', '2'],
    [...BASE, '--rate2'],
    [...BASE, '--rate2', '1', '--x', '1'],
    [...BASE, '--rate3', '1']
  ]) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
});
