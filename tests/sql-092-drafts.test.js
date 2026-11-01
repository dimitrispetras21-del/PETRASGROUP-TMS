// tests/sql-092-drafts.test.js - run: node --test tests/sql-092-drafts.test.js
// The 092 drafts (F45, owner 1/11 option a: the national desk sets the pallets and the Veroia day of a VS) at build
// time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 092's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 1 + 2 are the ones verify reads and the dry run expects, the live
//     ones of PART 0 the ones the rollback returns to;
//   - 092 creates nothing (no table, function, trigger, grant) and never patches plan_h_bridge_recut (it relies on it).
// The rules are proven on PGlite by tms-auditor/test/plan-092.test.mjs (VS 610 NO-GO live, GO after, rollback).
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
const P = '092_plan_vs_pallets_day';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-092.mjs');

test('092: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('092: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('092: one md5 per fact - PART 1 + 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part12 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 3'));
  const gen = [...part12.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 4, 'four live texts: two patched, two relied on');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live.slice(0, 2)) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
  assert.ok(!/GEN_/.test(src), 'no placeholder left');
});

test('092 creates nothing and never patches the recut it relies on', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE (TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  const part12 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 3'));
  assert.ok(!part12.includes('plan_h_bridge_recut'), 'recut is guarded, never in the patched list');
});
