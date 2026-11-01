// tests/sql-089-drafts.test.js - run: node --test tests/sql-089-drafts.test.js
// The 089 drafts (P-7: the partner rate of the ANODOS, owner 31/10 + 1/11) at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 089's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 2 are the ones verify reads and the rollback starts from, the
//     texts of PART 0 (086's plan_rt_update, the live plan_h_seg_json) the ones the rollback returns to;
//   - the rule is in the base (CHECK seg_partner_rate_anodos), the split trigger is closed, the cost views untouched.
// The rules are proven on PGlite by tms-auditor/test/plan-089.test.mjs (NO-GO before, GO after, rollback).
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
const P = '089_plan_partner_rate_anodos';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-089.mjs');

test('089: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('089: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('089: one md5 per fact - PART 2 = verify = the rollback\'s start; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  // 086's plan_rt_update and the live plan_h_seg_json (SELECT 1/11: 0db9e460...)
  assert.deepStrictEqual(live, ['d8de8c443ddc601469c53a90c4e5c1fc', '0db9e46033ee00a7daae9223f209df14']);
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the text before 089');
  assert.ok(!/0{32}/.test(src), 'no placeholder md5 left');
});

test('089: the rule stays in the base, the split trigger is closed, the money views are not touched', () => {
  const src = strip(read(`${P}.sql`));
  assert.match(src, /ADD COLUMN partner_rate_anodos numeric\(10,2\);/);
  assert.match(src, /ADD CONSTRAINT seg_partner_rate_anodos CHECK \(partner_rate_anodos IS NULL OR\s+\(trip_type = 'PARTNER' AND partner_rate IS NOT NULL AND partner_rate_anodos <> 'NaN'::numeric\s+AND partner_rate_anodos >= 0 AND partner_rate_anodos <= partner_rate\)\)/);
  assert.match(src, /CREATE TRIGGER plan_seg_rate_split BEFORE UPDATE ON public\.rt_vehicle_segments/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_seg_rate_split\(\) FROM PUBLIC, anon, authenticated, service_role;/);
  // principle 3: the P&L keeps reading partner_rate (the whole fee); 089 replaces no view and no cost function
  assert.ok(!/CREATE (OR REPLACE )?VIEW/i.test(src), 'no view');
  assert.ok(!/ct_v_rt_|plan_seg_copy|plan_board/.test(src), 'no money view, no cycle copy, no plan_board');
  assert.match(read(`${P}_rollback.sql`), /splits dropped \(the fees stay\)/);
});
