// worker/tools/worker-guard.mjs --ifs (the new international order form, owner 8/11/2026, base 111): the ORDER STOPS
// hour label `"Time From": "time_from"` twice (LOCAL MOVES + ORDER STOPS) and the old closure `dbOnly: ["Via Hub"]`
// gone. --ifs 0 before that deploy (32e0ca75: the label once, the closure once), --ifs 1 after it; only after
// --pmiss 1 (one chain). The DKV markers live in bundled files, so the test builds a bundle-like file.
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
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-ifs-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(index) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1', '--invoiced', '1', '--rate2', '1', '--self', '1',
  '--road', '1', '--wchk', '1', '--dkv', '1', '--pnlp', '1', '--pmiss', '1'];
const bundle = index + '\n' + rules + '\n' + parser;
const BUNDLE = write('bundle.js', bundle);
// the Worker before (32e0ca75): ORDER STOPS without the hours, «Via Hub» closed
const before = bundle.replace('"Time From": "time_from",\n      "Time To": "time_to"\n    },', '},\n    dbOnly: ["Via Hub"],');
const BEFORE = write('before.js', before);
const HALF = write('half.js', bundle + '\nvar x = { dbOnly: ["Via Hub"] };\n');

test('the hours are one label pair in ORDER STOPS, beside the LOCAL MOVES pair', () => {
  assert.equal(index.split('"Time From": "time_from"').length - 1, 2);
  assert.notEqual(before, bundle, 'the before-file differs');
  assert.equal(before.split('"Time From": "time_from"').length - 1, 1);
});

test('a bundle of this source: --ifs 1 → GUARD OK (43 markers, …, pmiss=1, ifs=1); --ifs 0 stops twice', () => {
  let r = run(BUNDLE, ...BASE, '--ifs', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(43 markers, .*pmiss=1, ifs=1\)/);
  r = run(BUNDLE, ...BASE, '--ifs', '0');
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 2);
});

test('the Worker before (32e0ca75): --ifs 0 OK, --ifs 1 STOP; the closure back beside the hours = STOP; without --ifs: as before (41)', () => {
  assert.equal(run(BEFORE, ...BASE, '--ifs', '0').code, 0);
  assert.equal(run(BEFORE, ...BASE, '--ifs', '1').code, 1);
  assert.equal(run(HALF, ...BASE, '--ifs', '1').code, 1);
  const r = run(BEFORE, ...BASE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(41 markers, .*pmiss=1\)/);
});

test('--ifs 1 needs --pmiss 1; an unknown flag after it is a usage error (exit 2)', () => {
  const noPmiss = BASE.slice(0, -1).concat('0');
  assert.equal(run(BUNDLE, ...noPmiss, '--ifs', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--ifx', '1').code, 2);
  assert.equal(run(BUNDLE, ...BASE, '--ifs', '1', '--zz', '1').code, 2);
});
