// worker/tools/worker-guard.mjs --plain (messages without codes, owner 8/11/2026): a /plan/* refusal names the trip in
// words and sends the DB detail apart; the marker is `async function planDetailWords(`, exactly once. --plain 0 before
// that deploy (the #263 Worker and every one before it wrote «(RT-1543)» into the text), --plain 1 after it; only after
// --pnl 1 (one chain, built on #263). The DKV markers live in bundled files, so the test builds a bundle-like file, as
// worker-guard-pnl.test.mjs does.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-plain-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1',
  '--road', '1', '--wchk', '1', '--dkv', '1', '--pnlp', '1', '--pmiss', '1', '--ifs', '1', '--pnl', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const BUNDLE = write('bundle.js', bundle);
const BEFORE = write('before.js', bundle.split('async function planDetailWords(').join('async function planDetailWordsGone('));
const TWICE = write('twice.js', bundle + '\nasync function planDetailWords(x) {}\n');

test('a bundle of this source: --plain 1 → GUARD OK (45 markers, …, pnl=1, plain=1); --plain 0 stops on the marker', () => {
  let r = run(BUNDLE, ...BASE, '--plain', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(45 markers, .*pnl=1, plain=1\)/);
  r = run(BUNDLE, ...BASE, '--plain', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before it (#263): --plain 0 OK, --plain 1 STOP; twice = STOP (a merge gone wrong); without --plain: as before (44)', () => {
  assert.equal(run(BEFORE, ...BASE, '--plain', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--plain', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--plain', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(44 markers, .*pnl=1\) /);
});

test('usage: --plain 1 needs --pnl 1; a wrong flag name or value, or a flag after it, is exit 2, never OK', () => {
  const noPnl = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noPnl, '--plain', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pIain', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--plain', '2').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--plain', '1', '--zz', '1').code, 2);
});
