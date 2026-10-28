// worker/tools/worker-guard.mjs --f5 and --plan 2 (national v5 F5, plan W8). One marker per F5 feature:
// rpc: "plan_config_read" (W1), rpc: "plan_lookups" (W2), rpc: "plan_nat_state" (E3/E5), var LEGACY_CLOSED_AFTER_L
// (E16), truncated:  (E18), "order_delete_preview" (E19). --f5 0 before deploy 1 (the live ffd5531f source has none),
// --f5 1 from deploy 1 on. --plan 2 = deploy 2 (day L): the one line `var PLAN_WRITES_OPEN = true;` and nothing of
// the closed switch, only with the whole chain (--handover 1 --f3 1 --f5 1). Checked on the source, on a double
// esbuild bundle (what wrangler deploys: the source is already a bundle) and on a CF API multipart download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
// the deploy-1 state of the source (writes closed), whichever value this branch holds: the day-L commit (F5 deploy 2)
// carries the open switch, and the checks below are about the closed bundle (--plan 2 has its own test, -f5)
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8').replace('\nvar PLAN_WRITES_OPEN = true;\n', '\nvar PLAN_WRITES_OPEN = false;\n');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-f5-'));
const SRC = path.join(dir, 'index.js');
writeFileSync(SRC, src);
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const CHAIN = ['--handover', '1', '--f3', '1'];
const D1 = ['--plan', '1', ...CHAIN, '--f5', '1'];
const D2 = ['--plan', '2', ...CHAIN, '--f5', '1'];
const OPEN = (text) => text.replace('var PLAN_WRITES_OPEN = false;', 'var PLAN_WRITES_OPEN = true;');
const MARKS = [['rpc: "plan_config_read"', /rpc: "plan_config_read" \(F5, W1\)/], ['rpc: "plan_lookups"', /rpc: "plan_lookups" \(F5, W2\)/],
  ['rpc: "plan_nat_state"', /rpc: "plan_nat_state" \(F5, E3\/E5\)/], ['var LEGACY_CLOSED_AFTER_L', /var LEGACY_CLOSED_AFTER_L \(F5, E16\)/],
  ['truncated: ', /truncated: {2}\(F5, E18\)/], ['"order_delete_preview"', /"order_delete_preview" \(F5, E19\)/]];
const without = (text, mark) => text.split(mark).join(mark.replace(/[a-z]/, 'X'));

test('the deploy-1 source: --plan 1 … --f5 1 → GUARD OK (26 markers); --f5 0 stops on every F5 marker', () => {
  let r = run(SRC, ...D1);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(26 markers, plan=1, handover=1, f3=1, f5=1\)/);
  r = run(SRC, '--plan', '1', ...CHAIN, '--f5', '0');
  assert.equal(r.code, 1, r.out);
  for (const [, re] of MARKS) assert.match(r.out, new RegExp(`STOP {2}${re.source} = [1-9]`));
});

test('the live Worker before deploy 1 (source f1e97f07 = ffd5531f): --f5 0 OK, --f5 1 stops on all six', (t) => {
  let live;
  try {
    live = execFileSync('git', ['show', 'f1e97f07:worker/src/index.js'], { cwd: here, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('commit f1e97f07 not in this clone: the before-deploy-1 check is not run'); return; }
  const f = write('live-f3.js', live);
  assert.equal(run(f, '--plan', '1', ...CHAIN, '--f5', '0').code, 0, 'the live script has none of the F5 markers');
  const r = run(f, ...D1);
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/^STOP /gm) || []).length, 6, r.out);
});

test('each F5 feature has its own marker: one missing is a STOP that names it alone', () => {
  for (const [i, [m, re]] of MARKS.entries()) {
    const r = run(write(`gone-${i}.js`, without(src, m)), ...D1);
    assert.equal(r.code, 1, `${m}: ${r.out}`);
    assert.match(r.out, new RegExp(`STOP {2}${re.source} = 0`));
    assert.equal((r.out.match(/^STOP /gm) || []).length, 1, `${m}: only its own marker stops`);
  }
  // a route row or the declaration twice (a merge gone wrong) is a STOP too
  for (const [i, m] of ['var LEGACY_CLOSED_AFTER_L', 'rpc: "plan_config_read"'].entries()) {
    const r = run(write(`twice-${i}.js`, `${src}\n// ${m}\n`), ...D1);
    assert.equal(r.code, 1, `${m} twice: ${r.out}`);
  }
});

test('--plan 2 (deploy 2): the open bundle passes, the closed one stops; --plan 1 stops on the open one', () => {
  const open = write('open.js', OPEN(src));
  let r = run(open, ...D2);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(26 markers, plan=2, handover=1, f3=1, f5=1\)/);
  r = run(SRC, ...D2);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}var PLAN_WRITES_OPEN = true; = 0/);
  assert.match(r.out, /STOP {2}PLAN_WRITES_OPEN = false = 1/);
  r = run(open, ...D1);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}PLAN_WRITES_OPEN = true = 1/);
  // deploy 2 changes ONE line: the open bundle differs from the closed one by that line only
  const a = src.split('\n');
  const b = OPEN(src).split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean), [['var PLAN_WRITES_OPEN = false;', 'var PLAN_WRITES_OPEN = true;']]);
});

test('bad usage → exit 2: --plan 2 without the whole chain, --f5 without --f3 or out of place, bad values', () => {
  const bad = [
    ['--plan', '2', '--handover', '1', '--f3', '1'],
    ['--plan', '2', '--handover', '1', '--f3', '1', '--f5', '0'],
    ['--plan', '2', '--handover', '1', '--f3', '0', '--f5', '0'],
    ['--plan', '2', '--handover', '0'],
    ['--plan', '1', '--handover', '1', '--f5', '1'],
    ['--plan', '1', '--handover', '1', '--f5', '1', '--f3', '1'],
    ['--plan', '1', '--handover', '1', '--f3', '0', '--f5', '1'],
    ['--plan', '1', '--handover', '1', '--f3', '1', '--f5', '2'],
    ['--plan', '1', '--handover', '1', '--f3', '1', '--f5'],
    ['--plan', '1', '--handover', '1', '--f3', '1', '--f5', '1', '--f6', '1'],
    ['--plan', '3', '--handover', '1']
  ];
  for (const args of bad) assert.equal(run(SRC, ...args).code, 2, args.join(' '));
  // without --f5 the answer is the F3 one, unchanged
  const r = run(SRC, '--plan', '1', ...CHAIN);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(20 markers, plan=1, handover=1, f3=1\)/);
  assert.doesNotMatch(r.out, /F5/);
});

test('a double esbuild bundle (what wrangler deploys) and its CF multipart download count the same, both deploys', async (t) => {
  let esbuild;
  try { esbuild = await import('esbuild'); } catch { t.skip('esbuild not installed here (npm install at the repo root): the bundle check is not run'); return; }
  const opts = { bundle: true, format: 'esm', write: false, platform: 'neutral', external: ['@cloudflare/puppeteer', 'node:*'], logLevel: 'silent' };
  const bundle = async (text, name) => {
    // resolveDir: the source imports its sibling modules (./rt-rules.mjs, ../../core/dkv-parser.js)
    const stdin = (contents) => ({ contents, sourcefile: name, loader: 'js', resolveDir: path.join(here, '..', 'src') });
    const once = await esbuild.build({ ...opts, stdin: stdin(text) });
    const twice = await esbuild.build({ ...opts, stdin: stdin(once.outputFiles[0].text) });
    return twice.outputFiles[0].text;
  };
  for (const [name, text, args, plan] of [['d1.js', src, D1, 1], ['d2.js', OPEN(src), D2, 2]]) {
    const out = await bundle(text, name);
    let r = run(write(`bundle-${name}`, out), ...args);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`GUARD OK \\(26 markers, plan=${plan}, handover=1, f3=1, f5=1\\)`));
    const b = `${Math.random().toString(16).slice(2)}f5`;
    r = run(write(`multipart-${name}.txt`, `--${b}\r\nContent-Disposition: form-data; name="index.js"; filename="index.js"\r\nContent-Type: application/javascript+module\r\n\r\n${out}\r\n--${b}--\r\n`), ...args);
    assert.equal(r.code, 0, `${name} multipart: ${r.out}`);
    assert.match(r.out, new RegExp(`GUARD OK \\(26 markers, plan=${plan}`));
  }
});
