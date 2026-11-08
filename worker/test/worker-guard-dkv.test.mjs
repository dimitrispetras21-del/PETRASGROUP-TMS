// worker/tools/worker-guard.mjs --dkv (DKV parser 1.3.0 + the E-SUMMARY gate, 8/11/2026): the markers are
// `no_lines: true` (worker/src/import-rules.mjs) and `SHORT_UNIT_TOKENS.has(` (core/dkv-parser.js), each exactly once.
// Both live in files wrangler bundles, so the test builds a bundle-like file from the three sources. --dkv 0 before
// that deploy (0563b45a has neither), --dkv 1 after it; only after --wchk 1 (one chain).
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-dkv-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1', '--road', '1', '--wchk', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const BUNDLE = write('bundle.js', bundle);
const SRC_ONLY = write('index.js', index);
const BEFORE = write('before.js', bundle.replace('no_lines: true', 'no_lines_gone: true').replace('SHORT_UNIT_TOKENS.has(', 'SHORT_UNIT_GONE.has('));
const HALF = write('half.js', bundle.replace('SHORT_UNIT_TOKENS.has(', 'SHORT_UNIT_GONE.has('));
const TWICE = write('twice.js', bundle + '\nconst x = { no_lines: true };\n');

test('a bundle of this source: --dkv 1 → GUARD OK (37 markers, …, dkv=1); --dkv 0 stops on both markers', () => {
  let r = run(BUNDLE, ...BASE, '--dkv', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(37 markers, .*wchk=1, dkv=1\)/);
  r = run(BUNDLE, ...BASE, '--dkv', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 2);
});

test('src/index.js alone has neither marker: --dkv 1 STOP (the check is on what runs, never on the source file)', () => {
  assert.equal(run(SRC_ONLY, ...BASE, '--dkv', '1').code, 1);
});

test('the Worker before (0563b45a): --dkv 0 OK, --dkv 1 STOP; only the gate or twice = STOP', () => {
  assert.equal(run(BEFORE, ...BASE, '--dkv', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--dkv', '1').code, 1);
  assert.equal(run(HALF, ...BASE, '--dkv', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--dkv', '1').code, 1);
});

test('--dkv 1 needs --wchk 1; an unknown flag after it is a usage error (exit 2)', () => {
  const noWchk = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noWchk, '--dkv', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--dkx', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--dkv', '1', '--zz', '1').code, 2);
});
