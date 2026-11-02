// tests/sql-098-drafts.test.js - run: node --test tests/sql-098-drafts.test.js
// The 098 drafts (the transfer stop and its rules; transfer at any point, piece 2a, owner 2/11) at build time, plain
// node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs, rollback and verify have 0 drift (the rollback reads 098's hunks and md5, never a copy);
//   - one md5 per fact: PART 2's generated texts are the ones verify reads and the dry run expects; PART 0's live texts
//     are the rollback's end; 098 builds on 097's view;
//   - 098 adds the four columns, their three CHECKs and one index - no table, trigger, grant - and patches only its five
//     functions.
// The rules are proven on PGlite by tms-auditor/test/plan-098.test.mjs (NO-GO before, GO after, refusals, rollback).
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
const P = '098_plan_transfer_point';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-098.mjs');

test('098: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('098: the builder has no drift (dry runs, rollback, verify)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('098: one md5 per fact - PART 2 = verify = the dry run = the rollback\'s start; PART 0 = the rollback\'s end; on 097', () => {
  const src = read(`${P}.sql`);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 5, 'five generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 6, 'six texts: five patched, plan_chk relied on');
  const dryHead = read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(dryHead.includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live.slice(0, 5)) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
  // 097 -> 098: the view 098 guards on is the one 097 wrote (one fact)
  const s97 = ['097_plan_vs_state_hub_only.sql'].map((f) => [path.join(DRAFTS, f), path.join(ROOT, 'worker/migrations', f)]).flat().find((f) => fs.existsSync(f));
  const v97 = /m_view_new CONSTANT text := '([0-9a-f]{32})'/.exec(fs.readFileSync(s97, 'utf8'))[1];
  assert.ok(part0.includes(`<> '${v97}' THEN`), '098 guards on 097\'s view');
  assert.ok(!/'@[LSPUC]'/.test(src), 'no placeholder left');
});

test('098 adds the four columns, three CHECKs, one index; patches only its five functions; no table, trigger, grant', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/ADD COLUMN ([a-z_]+)/g)].map((m) => m[1]),
    ['transfer_reason', 'transfer_note', 'transfer_waits', 'transfer_from_stop_id']);
  assert.deepStrictEqual([...src.matchAll(/ADD CONSTRAINT ([a-z_]+)/g)].map((m) => m[1]),
    ['rt_stops_transfer_reason', 'rt_stops_transfer_note', 'rt_stops_transfer_waits']);
  assert.deepStrictEqual([...src.matchAll(/CREATE (OR REPLACE )?(TABLE|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\s+([a-z_.]+)/g)].map((m) => m[4]),
    ['rt_stops_transfer_from']);
  assert.ok(!/\b(GRANT|REVOKE|DROP)\b/.test(src));
  const raw = read(`${P}.sql`);
  const part2 = raw.slice(raw.indexOf('===== PART 2'), raw.indexOf('===== PART 3'));
  assert.deepStrictEqual([...part2.matchAll(/\('(public\.[a-z_]+)\(/g)].map((m) => m[1]),
    ['public.plan_leg_problem', 'public.plan_shipment_problem', 'public.plan_split_piece', 'public.plan_rt_update', 'public.plan_h_vs_carriers']);
  // the rollback drops exactly those columns
  assert.match(read(`${P}_rollback.sql`), /DROP COLUMN transfer_reason, DROP COLUMN transfer_note, DROP COLUMN transfer_waits, DROP COLUMN transfer_from_stop_id;/);
});

test('098: the Veroia condition is ONE text in its three places (plan_rt_update x2, plan_h_vs_carriers), 097\'s rule', () => {
  const src = read(`${P}.sql`);
  const hunk = (k) => (new RegExp(`^  ${k} CONSTANT text := \\$h\\$([\\s\\S]*?)\\$h\\$;$`, 'm').exec(src) || [])[1];
  const cond = /and \(case when ps\.kind = 'vs_import' then pk\.location_id else dr\.location_id end\) = \(select ([a-z]+)\.id from locations \1 where \1\.is_hub\)/;
  for (const k of ['u_1b', 'u_2b', 'c_1b']) assert.match(hunk(k) ?? '', cond, k);
  // 097's view: the same stop - the loading of an import, the delivery of an export - and AT Veroia
  const s97 = ['097_plan_vs_state_hub_only.sql'].map((f) => [path.join(DRAFTS, f), path.join(ROOT, 'worker/migrations', f)]).flat().find((f) => fs.existsSync(f));
  const v = fs.readFileSync(s97, 'utf8');
  assert.match(v, /ps\.kind = 'vs_import' AND pk\.location_id = hub\.id/);
  assert.match(v, /ps\.kind = 'vs_export' AND dr\.location_id = hub\.id/);
});
