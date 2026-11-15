// worker/tools/worker-guard.mjs --seq (113, owner 15/11/2026: a groupage keeps the order of its points per point):
// ORDER STOPS maps `"Load Seq": "load_seq"`, exactly once. --seq 0 before that deploy (3423cec5 and every Worker before
// it), --seq 1 after it; only after --plain 1 (one chain, built on 3423cec5). The DKV markers live in bundled files, so
// the test builds a bundle-like file, as worker-guard-plain.test.mjs does.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-seq-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1',
  '--road', '1', '--wchk', '1', '--dkv', '1', '--pnlp', '1', '--pmiss', '1', '--ifs', '1', '--pnl', '1', '--plain', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const MARK = '"Load Seq": "load_seq"';
const BUNDLE = write('bundle.js', bundle);
const BEFORE = write('before.js', bundle.split(MARK).join('"Load Seq Gone": "x"'));
const TWICE = write('twice.js', bundle + '\nvar again = { ' + MARK + ' };\n');

test('a bundle of this source: --seq 1 → GUARD OK (46 markers, …, plain=1, seq=1); --seq 0 stops on the marker', () => {
  assert.equal(index.split(MARK).length - 1, 1, 'the source maps the label exactly once');
  let r = run(BUNDLE, ...BASE, '--seq', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(46 markers, .*plain=1, seq=1\)/);
  r = run(BUNDLE, ...BASE, '--seq', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before it (3423cec5): --seq 0 OK, --seq 1 STOP; twice = STOP; without --seq: as before (45)', () => {
  assert.equal(run(BEFORE, ...BASE, '--seq', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--seq', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--seq', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(45 markers, .*plain=1\) /);
});

test('usage: --seq 1 needs --plain 1; a wrong flag name or value, or a flag after it, is exit 2, never OK', () => {
  const noPlain = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noPlain, '--seq', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--sequ', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--seq', '2').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--seq', '1', '--zz', '1').code, 2);
});
