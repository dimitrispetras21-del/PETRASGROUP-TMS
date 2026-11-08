// worker/tools/worker-guard.mjs --pnl (GET /costs/pnl reads every RT, owner 8/11): the marker is `const PNL_PAGE = 1e3;`,
// exactly once. --pnl 0 before that deploy (0563b45a has the silent «limit 300»), --pnl 1 after it; only after
// --wchk 1 (one chain on 0563b45a).
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-pnl-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1', '--road', '1', '--wchk', '1'];
const SRC = write('index.js', src);
const BEFORE = write('before.js', src.replace('const PNL_PAGE = 1e3;', 'const PNL_LIMIT = 300;'));
const TWICE = write('twice.js', src + '\nconst PNL_PAGE = 1e3;\n');

test('this source: --pnl 1 → GUARD OK (36 markers, …, wchk=1, pnl=1); --pnl 0 stops on the marker', () => {
  let r = run(SRC, ...BASE, '--pnl', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(36 markers, .*wchk=1, pnl=1\)/);
  r = run(SRC, ...BASE, '--pnl', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before it (0563b45a): --pnl 0 OK, --pnl 1 STOP; twice = STOP (a merge gone wrong)', () => {
  assert.equal(run(BEFORE, ...BASE, '--pnl', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--pnl', '1').code, 1);
  assert.equal(run(TWICE, ...BASE, '--pnl', '1').code, 1);
});

test('usage: --pnl 1 needs --wchk 1; a wrong flag name or value is exit 2, never OK', () => {
  const noWchk = BASE.slice(0, -1).concat('0');
  assert.equal(run(SRC, ...noWchk, '--pnl', '1').code, 2);
  assert.equal(run(SRC, ...BASE, '--pnI', '1').code, 2);
  assert.equal(run(SRC, ...BASE, '--pnl', '2').code, 2);
  // without --pnl: as before, so the rollback flag set (… --wchk 1) keeps working
  assert.equal(run(SRC, ...BASE).code, 0);
});
