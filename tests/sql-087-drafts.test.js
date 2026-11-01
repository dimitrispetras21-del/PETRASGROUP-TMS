// tests/sql-087-drafts.test.js - run: node --test tests/sql-087-drafts.test.js
// The 087 drafts (pack 4: P-16 last change, A-3 waiting per week, P-8 rate history, P-11 one place at Veroia, 1/11)
// at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 087's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 2 are the ones verify reads and the dry run expects, the live
//     ones of PART 0 the ones the rollback returns to;
//   - 087 creates ONE function, the helper, born closed (revoked from every API role), and the rollback drops it;
//     no table, view, trigger or grant.
// The rules are proven on PGlite by tms-auditor/test/plan-087.test.mjs (NO-GO live, GO after, live again after the rollback).
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
const P = '087_plan_board_reads_hub_mark';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-087.mjs');

test('087: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('087: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('087: one md5 per fact - PART 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part12 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part12.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 2, 'two live texts');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
  assert.ok(!/GEN_/.test(src), 'no placeholder left');
});

test('087 creates only the closed helper, and the rollback drops it', () => {
  const raw = read(`${P}.sql`), src = strip(raw);
  const created = [...src.matchAll(/CREATE FUNCTION (public\.[a-z_]+)\(/g)].map((m) => m[1]);
  assert.deepStrictEqual(created, ['public.plan_h_last_change']);
  assert.ok(!/CREATE (TABLE|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|ALTER)\b/.test(src));
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_h_last_change\(bigint\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(read(`${P}_rollback.sql`), /DROP FUNCTION public\.plan_h_last_change\(bigint\);/);
  // the helper answers names of changed keys, never their values
  const helper = /CREATE FUNCTION public\.plan_h_last_change[\s\S]*?\$f\$;/.exec(raw)[0];
  assert.ok(!/'(before|after)', a\.(before|after)_data/.test(helper));
});
