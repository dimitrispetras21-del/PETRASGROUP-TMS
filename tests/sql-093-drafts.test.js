// tests/sql-093-drafts.test.js - run: node --test tests/sql-093-drafts.test.js
// The 093 drafts (owner 2/11, "we relax the rules": the hours rules refuse only an order no truck can drive, the ANODOS
// before the KATHODOS is a warning with a trace) at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads and
//     calls no function 093 creates (it answers after the rollback too);
//   - the generated dry runs and rollback have 0 drift (the rollback reads 093's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 2 are the ones verify reads and the dry run expects, the live
//     ones of PART 0 the ones the rollback returns to;
//   - 093 creates only its two internal functions (no table, trigger, grant) and revokes them from every role;
//   - leg_order is never touched (a drop before its own pickup stays a refusal: integrity).
// The rules are proven on PGlite by tms-auditor/test/plan-093.test.mjs (NO-GO live, GO after, rollback).
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
const P = '093_plan_hours_relaxed';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-093.mjs');

test('093: every file is there, ASCII only; one DO block per writing file; verify only reads, no 093 function', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
  assert.ok(!/public\.plan_h_(before|side_warn)\(/.test(v.replace(/to_regprocedure\('[^']*'\)/g, '')), 'verify calls no 093 function');
});

test('093: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('093: one md5 per fact - PART 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 6, 'six generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 6, 'six live texts');
  const head = (f) => read(f).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(head(`${P}_dryrun.sql`).includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) {
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
    assert.ok(head(`${P}_rollback_dryrun.sql`).includes(m), 'the rollback dry run header expects it');
  }
  assert.ok(!/GEN_|LIVE_/.test(src + read(`${P}_dryrun.sql`) + read(`${P}_rollback_dryrun.sql`)), 'no placeholder left');
});

test('093 creates only its two internal functions, revokes them, drops them on the way back; leg_order untouched', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/CREATE (?:OR REPLACE )?(TABLE|FUNCTION|VIEW|INDEX|(?:CONSTRAINT )?TRIGGER) (public\.[a-z_]+)?/g)]
    .map((m) => m[1] + ' ' + (m[2] || '')), ['FUNCTION public.plan_h_before', 'FUNCTION public.plan_h_side_warn', 'FUNCTION ']);
  assert.ok(!/\b(GRANT|ALTER)\b/.test(src));
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_h_before\(timestamptz,timestamptz,timestamptz,timestamptz\), public\.plan_h_side_warn\(bigint\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
  const rb = strip(read(`${P}_rollback.sql`));
  assert.match(rb, /DROP FUNCTION public\.plan_h_side_warn\(bigint\);\s+DROP FUNCTION public\.plan_h_before\(/);
  // the hunks never name leg_order: it stays 071's refusal, byte for byte
  const hunks = src.slice(src.indexOf('-- the hunks'), src.indexOf('v_g record;'));
  assert.ok(!/leg_order:'|pk\.seq >= dr\.seq/.test(hunks), 'leg_order is not a hunk');
});
