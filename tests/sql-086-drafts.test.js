// tests/sql-086-drafts.test.js - run: node --test tests/sql-086-drafts.test.js
// The 086 drafts (owner 1/11: a busy truck / driver allowed when the save accepts it, an all-day drop after its pickup)
// at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 086's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 2 are the ones verify reads and the rollback starts from, the live
//     ones of PART 0 the ones the rollback returns to; the EXCLUDE md5 likewise;
//   - the two EXCLUDE stay in the base, partial on NOT overlap_ok (principle 4), the new functions are closed.
// The rules are proven on PGlite by tms-auditor/test/plan-086.test.mjs (NO-GO live, GO after, rollback).
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
const P = '086_plan_busy_overlap_ok';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-086.mjs');

test('086: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('086: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('086: one md5 per fact - PART 2 = verify = the rollback\'s start; PART 0 = the rollback\'s end; EXCLUDE likewise', () => {
  const src = read(`${P}.sql`);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 6, 'six generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 6, 'six live texts');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the text before 086');
  // the EXCLUDE: live (072b) in PART 0 and at the rollback's end, partial in PART 3, verify and the rollback's start
  const x = [...src.matchAll(/IS DISTINCT FROM '([0-9a-f]{32})'/g)].map((m) => m[1]);
  for (const m of ['1add7b5c9ebb0e17af7d07d2f9318d18', '46bdb9fa06b5bb49158987491951ffe3']) {
    assert.ok(x.includes(m) && read(`${P}_rollback.sql`).includes(m), `live EXCLUDE ${m}`);
  }
  const part3 = src.slice(src.indexOf('===== PART 3'));
  const xGen = [...part3.matchAll(/IS DISTINCT FROM '([0-9a-f]{32})'/g)].map((m) => m[1]);
  // (the trigger count proof reads no md5)
  assert.strictEqual(xGen.length, 2);
  for (const m of xGen) assert.ok(read(`${P}_verify.sql`).includes(m) && read(`${P}_rollback.sql`).includes(m), `partial EXCLUDE ${m}`);
  assert.ok(!/GEN_/.test(src), 'no placeholder left');
});

test('086: the rule stays in the base - the same two EXCLUDE, partial on overlap_rts = {}, deferred, and the deferred pair rule beside them; the new functions closed', () => {
  const src = strip(read(`${P}.sql`));
  for (const n of ['rt_v2_truck_once', 'rt_v2_driver_once']) {
    const m = new RegExp(`ADD CONSTRAINT ${n} EXCLUDE USING gist \\(([a-z_]+) WITH =[^;]*?WHERE \\(([^)]*\\))[^;]*?DEFERRABLE INITIALLY DEFERRED`).exec(src);
    assert.ok(m, n);
    assert.match(m[2], /overlap_rts = '\{\}'/);
  }
  assert.ok(!/DROP CONSTRAINT rt_v2_(truck|driver)_once\s*;/.test(src), 'never dropped without being rebuilt in the same statement');
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_h_accept_busy\(jsonb,text,text,text\), public\.plan_seg_overlap_mark\(\),\s+public\.plan_chk_seg_overlap\(\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(src, /ADD COLUMN overlap_rts bigint\[\] NOT NULL DEFAULT '\{\}'/);
  assert.match(src, /CREATE CONSTRAINT TRIGGER plan_seg_overlap_verify AFTER INSERT OR UPDATE ON public\.rt_vehicle_segments\s+DEFERRABLE INITIALLY DEFERRED/);
  // the pair rule is a query: it takes the truck / driver lock first, so two saves at once never both pass unseen
  assert.match(src, /pg_advisory_xact_lock\(hashtextextended\('plan_busy:truck:' \|\| s\.truck_id, 0\)\);[\s\S]*pg_advisory_xact_lock\(hashtextextended\('plan_busy:driver:' \|\| s\.driver_id, 0\)\); end if;\s+select r\.code/);
  // an acceptance never outlives the call that sent it
  assert.match(src, /perform set_config\('plan\.accept_busy', '', true\);/);
  // the rollback stops on an accepted overlap, never drops it in silence
  assert.match(read(`${P}_rollback.sql`), /trips that overlap are in the base, the full EXCLUDE cannot be rebuilt/);
});
