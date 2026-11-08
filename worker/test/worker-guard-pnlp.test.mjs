// worker/tools/worker-guard.mjs --pnlp (the P&L papers, owner 3/11/2026): the marker is the route's own line
// `resource === "pnl-paper"`, exactly once. --pnlp 0 before that deploy (24d38435 has none), --pnlp 1 after it;
// only after --dkv 1 (one chain). The DKV markers live in bundled files, so the test builds a bundle-like file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const index = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const rules = readFileSync(path.join(here, '..', 'src', 'import-rules.mjs'), 'utf8');
const parser = readFileSync(path.join(here, '..', '..', 'core', 'dkv-parser.js'), 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-pnlp-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1', '--road', '1', '--wchk', '1', '--dkv', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const BUNDLE = write('bundle.js', bundle);
const BEFORE = write('before.js', bundle.replace('resource === "pnl-paper"', 'resource === "pnl-gone"'));
const TWICE = write('twice.js', bundle + '\nif (resource === "pnl-paper") {}\n');

test('a bundle of this source: --pnlp 1 → GUARD OK (38 markers, …, dkv=1, pnlp=1); --pnlp 0 stops', () => {
  let r = run(BUNDLE, ...BASE, '--pnlp', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(38 markers, .*dkv=1, pnlp=1\)/);
  r = run(BUNDLE, ...BASE, '--pnlp', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before (24d38435): --pnlp 0 OK, --pnlp 1 STOP; twice = STOP; without --pnlp: as before (37 markers)', () => {
  assert.equal(run(BEFORE, ...BASE, '--pnlp', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--pnlp', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--pnlp', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(37 markers, .*dkv=1\)/);
});

test('--pnlp 1 needs --dkv 1; an unknown flag after it is a usage error (exit 2)', () => {
  const noDkv = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noDkv, '--pnlp', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pnlx', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pnlp', '1', '--zz', '1').code, 2);
});
