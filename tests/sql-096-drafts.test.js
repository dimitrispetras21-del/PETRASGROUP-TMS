// tests/sql-096-drafts.test.js - run: node --test tests/sql-096-drafts.test.js
// The 096 drafts (the vehicle change takes accept_busy like every other save, coordinator 2/11) at build time, plain
// node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 096's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 1 are the ones verify reads and the dry run expects; PART 0 holds
//     the texts 095 writes (the rollback returns to them) and the 086 texts it relies on;
//   - 096 creates nothing and patches none of the 086 functions it relies on.
// The rules are proven on PGlite by tms-auditor/test/plan-096.test.mjs (NO-GO before, GO after, rollback).
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
const P = '096_plan_handover_accept_busy';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-096.mjs');

test('096: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('096: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('096: one md5 per fact - PART 1 = verify = the dry run; PART 0 = the rollback\'s end and 095\'s output', () => {
  const src = read(`${P}.sql`);
  const part1 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 2'));
  const gen = [...part1.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 6, 'six texts: two patched (095 output), four relied on (086)');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live.slice(0, 2)) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to 095\'s text');
  // 095 -> 096: the two texts 096 starts from are the ones 095 generates (one fact)
  const f95 = ['095_plan_small_relaxed.sql'].map((f) => [path.join(DRAFTS, f), path.join(ROOT, 'worker/migrations', f)]).flat().find((f) => fs.existsSync(f));
  const s95 = fs.readFileSync(f95, 'utf8');
  const p2 = s95.slice(s95.indexOf('===== PART 2'), s95.indexOf('===== PART 3'));
  for (const [sig, m] of [['plan_seg_change', live[0]], ['plan_seg_fix', live[1]]]) {
    assert.ok(new RegExp(`'public\\.${sig}\\(jsonb,text,text\\)', ARRAY\\[[a-z0-9_, ]+\\], ARRAY\\[[a-z0-9_, ]+\\], '${m}'\\)`).test(p2), `${sig}: 096 builds on 095's output`);
  }
  assert.ok(!/GEN_|LIVE_[A-Z]\b/.test(src), 'no placeholder left');
});

test('096 creates nothing and patches only plan_seg_change / plan_seg_fix', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE (TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  const raw = read(`${P}.sql`);
  const part1 = raw.slice(raw.indexOf('===== PART 1'), raw.indexOf('===== PART 2'));
  assert.deepStrictEqual([...part1.matchAll(/'(public\.[a-z_]+)\(/g)].map((m) => m[1]), ['public.plan_seg_change', 'public.plan_seg_fix']);
});
