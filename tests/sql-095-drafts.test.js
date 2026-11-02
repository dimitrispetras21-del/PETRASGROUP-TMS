// tests/sql-095-drafts.test.js - run: node --test tests/sql-095-drafts.test.js
// The 095 drafts (owner 2/11, relaxed rules group 6: a local loading on another day, a vehicle change without a reason)
// at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 095's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 2 are the ones verify reads and the dry run expects, the live ones
//     of PART 0 the ones the rollback returns to;
//   - 095 touches none of the functions 093 / 094 own, creates nothing, grants nothing.
// The rules are proven on PGlite by tms-auditor/test/plan-095.test.mjs (NO-GO live, GO after, rollback).
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
const P = '095_plan_small_relaxed';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-095.mjs');

test('095: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('095: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('095: one md5 per fact - PART 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 6, 'six generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/\(\s*'public\.[a-z_]+\([a-z,]*\)', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 6, 'six live texts');
  const dryHead = read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  const rbDryHead = read(`${P}_rollback_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(dryHead.includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) {
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
    assert.ok(rbDryHead.includes(m), 'the rollback dry run header expects it');
  }
  assert.ok(!/GEN_|LIVE_[A-Z]\b/.test(src + dryHead + rbDryHead), 'no placeholder left');
});

test('095 touches none of the functions of 093 / 094, creates nothing, grants nothing; only its two CHECKs change', () => {
  const src = strip(read(`${P}.sql`));
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  for (const f of ['plan_rt_problem', 'plan_leg_problem', 'plan_h_reseq', 'plan_orders_create', 'plan_order_update']) {
    assert.ok(!new RegExp(`'public\\.${f}\\(`).test(part2), `${f} belongs to another chain (093 / 094)`);
  }
  assert.ok(!/CREATE (TABLE|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE)\b/.test(src));
  const alters = src.match(/ALTER TABLE[^;]*;/g) || [];
  assert.strictEqual(alters.length, 1);
  assert.match(alters[0], /rt_vehicle_segments DROP CONSTRAINT seg_change_pair, DROP CONSTRAINT seg_other_note,\s+ADD CONSTRAINT seg_change_pair CHECK \(reason IS NULL OR place_note IS NOT NULL\);/);
});

// 093 -> 095 (coordinator 2/11): 095 guards plan_rt_update on the text 093 writes. Once 093 is in the tree, its own
// PART 2 md5 for plan_rt_update must be 095's PART 0 guard - a later edit of 093's hunk fails here, not at 15:00.
test('095 guards plan_rt_update on the md5 093 generates (once 093 is in the tree)', (t) => {
  const f93 = ['093_plan_hours_relaxed.sql'].map((f) => [path.join(DRAFTS, f), path.join(ROOT, 'worker/migrations', f)])
    .flat().find((f) => fs.existsSync(f));
  const src = read(`${P}.sql`);
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const guard = /'public\.plan_rt_update\(jsonb,text,text\)', '([0-9a-f]{32})'\)/.exec(part0);
  assert.ok(guard, 'PART 0 guards plan_rt_update');
  const stub = fs.readFileSync(path.join(ROOT, 'tms-auditor/test/prod-shaped-093.mjs'), 'utf8');
  assert.ok(stub.includes(`'${guard[1]}'`), 'the PGlite copy of 093 ends on the same md5');
  if (!f93) { t.todo('093 not in the tree yet: prod-shaped-093.mjs applies its one hunk'); return; }
  const s93 = fs.readFileSync(f93, 'utf8');
  const p2 = s93.slice(s93.indexOf('===== PART 2'), s93.indexOf('===== PART 3'));
  const gen = /'public\.plan_rt_update\(jsonb,text,text\)', ARRAY\[[a-z0-9_, ]+\], ARRAY\[[a-z0-9_, ]+\], '([0-9a-f]{32})'\)/.exec(p2);
  assert.ok(gen, '093 patches plan_rt_update in its PART 2');
  assert.strictEqual(guard[1], gen[1], '093 changed its plan_rt_update text: rebuild 095 (PART 0, prod-shaped-093, build-095.mjs)');
});

// owner 2/11: ONE limit for a local loading's day - the base's refusal (095 plan_local_loading) and the form's line
// before the press (wn5_actions.js LOCAL_DAY_MAX) must say the same number, or the form lets through what the base refuses
test('095: the 7-day limit of the base = the form\'s LOCAL_DAY_MAX', () => {
  const sql = /abs\(v_day - v_sday\) > (\d+) then perform plan_h_raise\('bad_input', 'move_date:\1_days'\)/.exec(read(`${P}.sql`));
  assert.ok(sql, 'the base refuses move_date:N_days beyond N days');
  const fe = /const LOCAL_DAY_MAX = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'modules/wn5_actions.js'), 'utf8'));
  assert.ok(fe, 'the form names LOCAL_DAY_MAX');
  assert.strictEqual(fe[1], sql[1]);
});
