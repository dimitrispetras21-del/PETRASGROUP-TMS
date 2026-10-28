// tests/sql-074-drafts.test.js - run: node --test tests/sql-074-drafts.test.js
// The 074 / 074b drafts (national v5 F5, day L) at build time, plain node, no database (principle 6):
//   - every file and the builder are there; ASCII only (the clipboard has mangled Greek before);
//   - the writing files are ONE DO block; verify and fingerprint write nothing; the generated files have 0 drift;
//   - the dry runs are their source + a deliberate error;
//   - day L (Q-1) is written ONCE in 074, and the fingerprint counts with the same day;
//   - the live texts 074 patches are guarded by md5 BEFORE (074 PART 0) and come back to the same md5 (rollback);
//     the generated texts are proven AFTER (074) and read by verify - one list per fact (principle 3);
//   - every function 074 creates is closed (PART 5) and dropped by the rollback; 6 triggers in, 6 out.
// The rules themselves are proven on PGlite by tms-auditor/test/plan-074.test.mjs (C1-C41, R1-R4, the mutants, 074b).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
// drafts/ until the owner runs them, then one up (CLAUDE.md rule 5); never both
const file = (f) => {
  const d = path.join(DRAFTS, f), m = path.join(ROOT, 'worker/migrations', f);
  if (fs.existsSync(d) && fs.existsSync(m)) throw new Error(`${f} in drafts/ AND one up`);
  return fs.existsSync(d) ? d : m;
};
const read = (f) => fs.readFileSync(file(f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['074_plan_cutover.sql', '074_plan_cutover_dryrun.sql', '074_plan_cutover_rollback.sql',
  '074_plan_cutover_rollback_dryrun.sql', '074b_plan_cutover_monitoring.sql', '074b_plan_cutover_monitoring_dryrun.sql',
  '074b_plan_cutover_monitoring_rollback.sql'];
const READ_ONLY = ['074_plan_cutover_verify.sql', '074_plan_cutover_fingerprint.sql'];
const BUILDER = path.join(DRAFTS, 'tools/build-074.mjs');

test('074: every file is there and ASCII only', () => {
  for (const f of [...DO_FILES, ...READ_ONLY]) {
    assert.ok(fs.existsSync(file(f)), f);
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  assert.ok(fs.existsSync(BUILDER));
});

test('074: one DO block per writing file; verify and fingerprint only read', () => {
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    const s = strip(read(f)).replace(/updated_at|deleted_at|created_at|deleted_reason/g, '');
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(s), f);
  }
});

test('074: the builder has no drift (dry runs and 074b)', () => {
  const out = execFileSync(process.execPath, [BUILDER, '--check']).toString();
  assert.match(out, /0 drift/);
});

test('074: each dry run is its source block verbatim + a deliberate error', () => {
  for (const [src, dry, name] of [['074_plan_cutover.sql', '074_plan_cutover_dryrun.sql', 'DRY RUN 074'],
    ['074_plan_cutover_rollback.sql', '074_plan_cutover_rollback_dryrun.sql', 'DRY RUN 074 ROLLBACK']]) {
    const s = read(src);
    const body = s.slice(s.indexOf('\nDO $do$\n') + '\nDO $do$\n'.length, s.lastIndexOf('\nEND $do$;\n'));
    assert.ok(body.length > 1000, src);
    assert.ok(read(dry).includes(body), `${dry} holds ${src} verbatim`);
    assert.match(read(dry), new RegExp(`RAISE EXCEPTION '${name} finished - EVERYTHING UNDONE, nothing kept`));
  }
});

test('074: day L (Q-1) is written once in 074, and the fingerprint counts with the same day', () => {
  const src = read('074_plan_cutover.sql');
  const days = [...strip(src).matchAll(/DATE '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  assert.strictEqual(days.length, 1, 'one constant');
  assert.strictEqual(new Date(days[0] + 'T12:00:00Z').getUTCDay(), 6, 'a Saturday');
  const fp = [...read('074_plan_cutover_fingerprint.sql').matchAll(/DATE '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  assert.ok(fp.length >= 1 && fp.every((d) => d === days[0]), 'the fingerprint uses day L');
});

test('074: the patched live texts - md5 before in 074, back in the rollback; md5 after in 074 and verify', () => {
  const src = read('074_plan_cutover.sql'), rb = read('074_plan_cutover_rollback.sql'), vf = read('074_plan_cutover_verify.sql');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = Object.fromEntries([...part0.matchAll(/\('(public\.[a-z0-9_]+\([a-z0-9_,[\]]*\))', '([0-9a-f]{32})'\)/g)].map((m) => [m[1], m[2]]));
  for (const sig of ['public.order_dates_follow()', 'public.national_load_follow_order()', 'public.plan_vs_set_place(jsonb,text,text)']) {
    assert.ok(live[sig], `${sig} guarded in PART 0`);
    assert.ok(rb.includes(live[sig]), `${sig}: the rollback proves its live md5 back`);
  }
  // the generated texts: proven twice in 074 (at generation and in PART 8) and read by verify
  const after = [...strip(vf).matchAll(/\('(public\.[a-z0-9_]+\([a-z0-9_,]*\))', '([0-9a-f]{32})'\)/g)];
  assert.strictEqual(after.length, 3);
  for (const [, sig, m] of after) assert.ok((src.match(new RegExp(m, 'g')) || []).length >= 2, `${sig}: ${m} in 074 twice`);
  assert.ok(!/(RP|SP)_NEW_MD5|N0(28|30)_MD5/.test(src + vf), 'no placeholder left');
});

test('074: every function it creates is closed and dropped by the rollback; 6 triggers in, 6 out', () => {
  const src = read('074_plan_cutover.sql'), rb = read('074_plan_cutover_rollback.sql');
  const created = [...src.matchAll(/CREATE FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => m[1]).concat(['plan_h_vs_repoint']);
  const part5 = src.slice(src.indexOf('===== PART 5'), src.indexOf('===== PART 6'));
  const closed = [...part5.matchAll(/'public\.([a-z0-9_]+)\(/g)].map((m) => m[1]);
  const dropped = [...rb.matchAll(/DROP FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(created)].sort(), [...closed].sort(), 'PART 5 closes exactly what 074 creates');
  assert.deepStrictEqual([...new Set(created)].sort(), [...dropped].sort(), 'the rollback drops exactly what 074 creates');
  assert.strictEqual(new Set(created).size, 14);
  assert.strictEqual((src.match(/^ {2}CREATE TRIGGER /gm) || []).length, 6);
  assert.strictEqual((rb.match(/^ {2}DROP TRIGGER /gm) || []).length, 6);
  assert.match(src, /IF v_trg1 <> v_trg0 \+ 6 THEN/);
  assert.match(rb, /IF v_trg1 <> v_trg0 - 6 THEN/);
});

test('074 rollback refuses after the point of no return; 074b keeps B-47 as it is', () => {
  assert.match(read('074_plan_cutover_rollback.sql'), /074 rollback: after the point of no return/);
  const b = read('074b_plan_cutover_monitoring.sql');
  for (const id of ['B-95', 'B-96', 'B-97', 'B-98', 'B-99', 'B-10', 'B-26', 'B-42']) assert.ok(b.includes(`'${id}'`), id);
  assert.ok(!b.includes("'B-47'"), 'B-47 already counts every local_moves kind: not rewritten');
});
