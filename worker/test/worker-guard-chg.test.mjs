// worker/tools/worker-guard.mjs --chg (T188, ValueDriven 26/11/2026: POST /changes, a page drawn again when someone else
// changed what it shows): `var CHANGES_ROLES = [` and `url.pathname === "/changes"`, each exactly once. --chg 0 before
// that deploy, --chg 1 after it; only after --seq 1 (one chain, built on 67dbb31e). Bundle-like file, as the --seq test.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-chg-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1',
  '--road', '1', '--wchk', '1', '--dkv', '1', '--pnlp', '1', '--pmiss', '1', '--ifs', '1', '--pnl', '1', '--plain', '1', '--seq', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const ROLES = 'var CHANGES_ROLES = [';
const ROUTE = 'url.pathname === "/changes"';
const BUNDLE = write('bundle.js', bundle);
const BEFORE = write('before.js', bundle.split(ROLES).join('var CHANGES_GONE = [').split(ROUTE).join('url.pathname === "/gone"'));
const NO_ROUTE = write('noroute.js', bundle.split(ROUTE).join('url.pathname === "/gone"'));
const TWICE = write('twice.js', bundle + '\n' + ROLES + '];\n');

test('a bundle of this source: --chg 1 → GUARD OK (49 markers, …, seq=1, chg=1); --chg 0 stops on both rows', () => {
  assert.equal(index.split(ROLES).length - 1, 1);
  assert.equal(index.split(ROUTE).length - 1, 1);
  let r = run(BUNDLE, ...BASE, '--chg', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(49 markers, .*seq=1, chg=1\)/);
  r = run(BUNDLE, ...BASE, '--chg', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 2);
});

test('the Worker before it: --chg 0 OK, --chg 1 STOP; the roles without the route = STOP; twice = STOP; without --chg as before (47)', () => {
  assert.equal(run(BEFORE, ...BASE, '--chg', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--chg', '1').code, 1);
  assert.equal(run(NO_ROUTE, ...BASE, '--chg', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--chg', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(47 markers, .*seq=1\) /);
});

test('usage: --chg 1 needs --seq 1; a wrong flag name or value, or a flag after it, is exit 2, never OK', () => {
  const noSeq = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noSeq, '--chg', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--chgx', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--chg', '2').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--chg', '1', '--zz', '1').code, 2);
});
