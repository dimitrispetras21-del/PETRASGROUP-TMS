// worker/tools/worker-guard.mjs — the deploy guard run before and after every
// Worker deploy (CLAUDE.md «Ο WORKER»). Pinned against the deploy source and
// against a CF-API-shaped multipart copy of it, so the tool that says «OK» on
// deploy night is the one tested here (αρχή 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, '..', 'tools', 'worker-guard.mjs');
const SRC = path.join(here, '..', 'src', 'index.js');
const src = readFileSync(SRC, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'worker-guard-'));
const run = (file, plan) => {
  const r = spawnSync(process.execPath, plan === undefined ? [TOOL, file] : [TOOL, file, '--plan', String(plan)], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const write = (name, text) => { const f = path.join(dir, name); writeFileSync(f, text); return f; };

test('the deploy source passes with --plan 1 (15 markers) and fails with --plan 0', () => {
  let r = run(SRC, 1);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(15 markers, plan=1\)/);
  r = run(SRC, 0);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}var PLAN_PERMS = \{ = 1/);
});

test('a CF API download (multipart, CRLF, random boundary) is unwrapped and counted the same', () => {
  const b = 'a1b2c3d4e5f6';
  const f = write('live.txt', `--${b}\r\nContent-Disposition: form-data; name="index.js"; filename="index.js"\r\nContent-Type: application/javascript+module\r\n\r\n${src}\r\n--${b}--\r\n`);
  const r = run(f, 1);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(15 markers, plan=1\)/);
});

test('a missing marker, a doubled marker or open writes → exit 1 naming it', () => {
  let r = run(write('no-move-kind.js', src.replace('"Move Kind": "move_kind"', '"Move Kind": "kind"')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}"Move Kind": "move_kind" = 0/);
  r = run(write('two-lots.js', src + '\nvar x = { tblStockLots: { } };\n'), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}tblStockLots: \{ = 2/);
  r = run(write('open.js', src.replace('var PLAN_WRITES_OPEN = false;', 'var PLAN_WRITES_OPEN = true;')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}var PLAN_WRITES_OPEN = false; = 0/);
  r = run(write('no-delete.js', src.replace('    order_stops: ["GET", "POST", "PATCH", "DELETE"],\n    // LOCAL MOVES', '    order_stops: ["GET", "POST", "PATCH"],\n    // LOCAL MOVES')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}dispatcher order_stops DELETE = 0/);
  // the features live before F2 (24/10): one of them missing stops the deploy as well
  r = run(write('no-presence.js', src.replace('var PRESENCE_ROLES', 'var PRESENCE_ROLEZ')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}var PRESENCE_ROLES = 0/);
  r = run(write('no-delay.js', src.replace('"Delay Reason": "delay_reason"', '"Delay Reason": "reason"')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}"Delay Reason": "delay_reason" = 0/);
  r = run(write('no-vd.js', src.replace('{0,49}$/', '{0,48}$/')), 1);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOP {2}VD \/costs\/rt order_ids \{0,49\}\$\/ = 0/);
});

test('a part named only by name="….js" is unwrapped; an unreadable download → GUARD STOP, exit 1, never a stack trace', () => {
  const b = 'f00dfeed';
  let r = run(write('live-name.txt', `--${b}\r\nContent-Disposition: form-data; name="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n${src}\r\n--${b}--\r\n`), 1);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GUARD OK \(15 markers, plan=1\)/);
  r = run(write('live-bad.txt', `--${b}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{}\r\n--${b}--\r\n`), 1);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /GUARD STOP — multipart: expected one \.js part, found 0/);
  assert.doesNotMatch(r.out, /at unwrapMultipart/);
});

test('WORKSHOPS fields are counted inside the WORKSHOPS block: Country missing there alone → exit 1', () => {
  // Country: "country" is in six tables; a whole-file count would still say 5 and pass (review 23/10)
  const anchor = '      Country: "country",\n      Aliases: "aliases",';
  assert.equal(src.split(anchor).length - 1, 1, 'the WORKSHOPS anchor is unique');
  const r = run(write('no-ws-country.js', src.replace(anchor, '      Aliases: "aliases",')), 1);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /STOP {2}WORKSHOPS Country: "country" = 0/);
});

test('bad usage → exit 2, nothing counted', () => {
  assert.equal(run(SRC).code, 2);
  assert.equal(run(SRC, 2).code, 2);
});
