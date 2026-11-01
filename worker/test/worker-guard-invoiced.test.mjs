// worker/tools/worker-guard.mjs --invoiced (085, owner 31/10: an invoiced national keeps its client, its price only
// from owner / accountant): the marker is the PLAN_RULE_TEXT key invoiced_client:, exactly once. --invoiced 0 before
// that deploy (the source of main 2163b11c, = the live Worker of 077, has none), --invoiced 1 after it; only after
// --edit 1. Without --invoiced: as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-invoiced-'));
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const SRC = write('index.js', src);
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const PLAN = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src) ? '2' : '1';
const BASE = ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '1'];

test('this source: --invoiced 1 → GUARD OK (30 markers, invoiced=1); --invoiced 0 stops on the one marker', () => {
  let r = run(SRC, ...BASE, '--invoiced', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`GUARD OK \\(30 markers, plan=${PLAN}, handover=1, f3=1, f5=1, edit=1, invoiced=1\\)`));
  r = run(SRC, ...BASE, '--invoiced', '0');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}invoiced_client: \(085, F62\) = 1/);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 1);
});

test('the Worker before 085 (main 2163b11c): --invoiced 0 OK, --invoiced 1 stops', (t) => {
  let before;
  try {
    before = execFileSync('git', ['show', '2163b11c:worker/src/index.js'], { cwd: here, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('commit 2163b11c not in this clone: the before-085 check is not run'); return; }
  const f = write('before.js', before);
  assert.equal(run(f, ...BASE, '--invoiced', '0').code, 0, 'the Worker before 085 has no invoiced_client text');
  const r = run(f, ...BASE, '--invoiced', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}invoiced_client: \(085, F62\) = 0/);
});

test('the key twice (a merge gone wrong) is a STOP; without --invoiced the answer is the --edit one, unchanged', () => {
  const r = run(write('twice.js', `${src}\n// invoiced_client: "x"\n`), ...BASE, '--invoiced', '1');
  assert.equal(r.code, 1, r.out);
  const plain = run(SRC, ...BASE);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /GUARD OK \(29 markers/);
  assert.doesNotMatch(plain.out, /invoiced_client/);
});

test('bad usage → exit 2: --invoiced without --edit 1, out of place, bad value, a flag after it', () => {
  for (const args of [
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--edit', '0', '--invoiced', '1'],
    ['--plan', PLAN, '--handover', '1', '--f3', '1', '--f5', '1', '--invoiced', '1'],
    [...BASE, '--invoiced', '2'],
    [...BASE, '--invoiced'],
    [...BASE, '--invoiced', '1', '--x', '1'],
    [...BASE, '--f6', '1']
  ]) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
});
