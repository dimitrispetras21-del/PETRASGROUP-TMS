// worker/tools/worker-guard.mjs --road (owner 2/11: «Αλλαγή στον δρόμο» + «Σύνθεση φορτίων», ONE Worker chain): the two
// markers are the route rows rpc: "plan_transfer" (099) and rpc: "plan_draft_realize" (102), each exactly once.
// --road 0 before that deploy (101's Worker 7bb5003a has neither), --road 1 after it; only after --self 1 (built on
// 101's Worker, one chain). Without --road: as before, so the rollback flag sets keep working.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-road-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const SRC = write('index.js', src);
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1'];
// 101's Worker (7bb5003a, the one this change is built on): the same source without the two route families
const before = src.replace(/\n {2}\{ method: "POST", re: \/\^\\\/plan\\\/transfer\$\/[^\n]*/, '')
  .replace(/\n {2}\{ method: "[A-Z]+", re: \/\^\\\/plan\\\/drafts[^\n]*/g, '');
const noTransfer = src.replace(/\n {2}\{ method: "POST", re: \/\^\\\/plan\\\/transfer\$\/[^\n]*/, '');
const noRealize = src.replace(/\n {2}\{ method: "POST", re: \/\^\\\/plan\\\/drafts\\\/\(\\d\+\)\\\/realize\$\/[^\n]*/, '');

test('this source: --road 1 → GUARD OK (34 markers, road=1); --road 0 stops on the two markers', () => {
  let r = run(SRC, ...BASE, '--road', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(34 markers, plan=${PLAN}, handover=1, f3=1, f5=1, edit=1, invoiced=1, rate2=1, self=1, road=1\\)`));
  r = run(SRC, ...BASE, '--road', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}rpc: "plan_transfer" \(099, «Αλλαγή στον δρόμο»\) = 1/);
  assert.match(r.out, /STOP {2}rpc: "plan_draft_realize" \(102, «Σύνθεση φορτίων»\) = 1/);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 2);
});

test('the Worker before (7bb5003a): --road 0 OK, --road 1 stops; either family missing alone stops', () => {
  assert.notEqual(before, src, 'the route rows were found and removed');
  assert.equal(before.split('rpc: "plan_draft_').length - 1, 0, 'every draft row removed');
  assert.equal(run(write('before.js', before), ...BASE, '--road', '0').code, 0);
  const r = run(write('before1.js', before), ...BASE, '--road', '1');
  assert.equal(r.code, 1, r.out);
  for (const [name, text, marker] of [['noTransfer.js', noTransfer, 'plan_transfer'], ['noRealize.js', noRealize, 'plan_draft_realize']]) {
    assert.notEqual(text, src, name);
    const h = run(write(name, text), ...BASE, '--road', '1');
    assert.equal(h.code, 1, h.out);
    assert.match(h.out, new RegExp(`STOP {2}rpc: "${marker}" \\(\\d+, [^)]*\\) = 0`));
    assert.equal((h.out.match(/^STOP /gm) || []).length, 1, name);
  }
  // a merge gone wrong (a row twice) stops too
  const twice = src.replace(/(\n {2}\{ method: "POST", re: \/\^\\\/plan\\\/transfer\$\/[^\n]*)/, '$1$1');
  assert.equal(run(write('twice.js', twice), ...BASE, '--road', '1').code, 1);
});

test('without --road the answer is the --self one, unchanged (the rollback flag set to 7bb5003a)', () => {
  const plain = run(SRC, ...BASE);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /GUARD OK \(32 markers, .*self=1\)/);
  assert.doesNotMatch(plain.out, /plan_transfer|plan_draft_realize/);
});

test('bad usage → exit 2: --road without --self 1, out of place, bad value, a flag after it', () => {
  const noSelf = [...BASE.slice(0, -1), '0'];
  for (const args of [
    [...noSelf, '--road', '1'],
    [...BASE.slice(0, -2), '--road', '1'],
    [...BASE, '--road', '2'],
    [...BASE, '--road'],
    [...BASE, '--road', '1', '--x', '1'],
    [...BASE, '--roads', '1']
  ]) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
  // --self 0 with --road 0 is a valid (older) set
  assert.equal(run(SRC, ...noSelf, '--road', '0').code, 1, 'valid usage; the self marker stops on this source');
});
