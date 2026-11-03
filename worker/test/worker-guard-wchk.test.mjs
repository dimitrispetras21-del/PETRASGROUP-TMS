// worker/tools/worker-guard.mjs --wchk (104, the pallets week's «Ελέγχθηκε» mark): the marker is `var PLW_RPC = {`,
// exactly once. --wchk 0 before that deploy (b329ff91 has none), --wchk 1 after it; only after --road 1 (one chain).
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-wchk-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1', '--road', '1'];
const SRC = write('index.js', src);
const BEFORE = write('before.js', src.replace('var PLW_RPC = {', 'var PLW_GONE = {'));
const TWICE = write('twice.js', src + '\nvar PLW_RPC = { x: 1 };\n');

test('this source: --wchk 1 → GUARD OK (35 markers, …, wchk=1); --wchk 0 stops on the marker', () => {
  let r = run(SRC, ...BASE, '--wchk', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(35 markers, .*road=1, wchk=1\)/);
  r = run(SRC, ...BASE, '--wchk', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before 104: --wchk 0 OK, --wchk 1 STOP; twice = STOP (a merge gone wrong)', () => {
  assert.equal(run(BEFORE, ...BASE, '--wchk', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--wchk', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--wchk', '1').code, 1);
});

test('usage: --wchk 1 needs --road 1; a wrong flag name or value is exit 2, never OK', () => {
  const noRoad = BASE.slice(0, -1).concat('0');
  assert.equal(run(SRC, ...noRoad, '--wchk', '1').code, 2);
  assert.equal(run(SRC, ...BASE, '--wchx', '1').code, 2);
  assert.equal(run(SRC, ...BASE, '--wchk', '2').code, 2);
  // without --wchk: as before, so the rollback flag sets keep working
  assert.equal(run(SRC, ...BASE).code, 0);
});
