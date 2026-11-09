// worker/tools/worker-guard.mjs --pnl (GET /costs/pnl reads every RT, owner 8/11): the marker is `const PNL_PAGE = 1e3;`,
// exactly once. --pnl 0 before that deploy (d4e2ce0a and every Worker before it have the silent «limit 300»), --pnl 1
// after it; only after --ifs 1 (one chain, rebuilt on d4e2ce0a 9/11). The DKV markers live in bundled files, so the
// test builds a bundle-like file, as worker-guard-ifs.test.mjs does.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-pnl-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1',
  '--road', '1', '--wchk', '1', '--dkv', '1', '--pnlp', '1', '--pmiss', '1', '--ifs', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const BUNDLE = write('bundle.js', bundle);
const BEFORE = write('before.js', bundle.replace('const PNL_PAGE = 1e3;', 'const PNL_LIMIT = 300;'));
const TWICE = write('twice.js', bundle + '\nconst PNL_PAGE = 1e3;\n');

test('a bundle of this source: --pnl 1 → GUARD OK (44 markers, …, ifs=1, pnl=1); --pnl 0 stops on the marker', () => {
  let r = run(BUNDLE, ...BASE, '--pnl', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(44 markers, .*ifs=1, pnl=1\)/);
  r = run(BUNDLE, ...BASE, '--pnl', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before it (d4e2ce0a): --pnl 0 OK, --pnl 1 STOP; twice = STOP (a merge gone wrong); without --pnl: as before (43)', () => {
  assert.equal(run(BEFORE, ...BASE, '--pnl', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--pnl', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--pnl', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(43 markers, .*ifs=1\) /);
});

test('usage: --pnl 1 needs --ifs 1; a wrong flag name or value, or a flag after it, is exit 2, never OK', () => {
  const noIfs = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noIfs, '--pnl', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pnI', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pnl', '2').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--pnl', '1', '--zz', '1').code, 2);
});
