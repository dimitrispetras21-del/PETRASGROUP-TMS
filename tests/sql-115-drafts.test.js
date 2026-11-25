// tests/sql-115-drafts.test.js - run: node --test tests/sql-115-drafts.test.js
// The 115 drafts (the partner's plates and driver on the national trip, free text; owner 25/11) at build time, plain
// node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs, rollback and verify have 0 drift (the rollback declares 115's own constants block);
//   - one md5 per fact: the generated md5 of the source = verify = the dry run's header; the live md5 = the rollback
//     dry run's header (= production 25/11, plan_rt_update after 110, plan_rt_create after 099, plan_board after 112);
//   - 115 adds two columns, two CHECKs, one trigger and two functions, patches only its three, grants nothing.
// The rules are proven on PGlite by tms-auditor/test/plan-115.test.mjs (dry run, GO, refusals, the text follows the
// company, rollback).
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
const P = '115_rt_partner_plates';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-115.mjs');
const md5 = (name, src) => new RegExp(`${name} CONSTANT text := '([0-9a-f]{32})'`).exec(src)[1];
const head = (f) => read(f).split('\n').filter((l) => l.startsWith('--')).join('\n');

test('115: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`));
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('115: the builder has no drift (dry runs, rollback, verify)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('115: one md5 per fact - generated = verify = the dry run; live = the rollback dry run = production 25/11', () => {
  const src = read(`${P}.sql`);
  const gen = ['m_upd_gen', 'm_cre_gen', 'm_brd_gen'].map((k) => md5(k, src));
  const live = ['m_upd_live', 'm_cre_live', 'm_brd_live'].map((k) => md5(k, src));
  assert.deepStrictEqual(live, ['b005474aae99761ea71473d085ffc053', '7e6abee9852b952a1de922d0dbc794bf', '6ee19458d60e62de1492fa72edec36c8']);
  // 112 (executed 8/11) left plan_board on this md5 and says the next change guards on it
  assert.ok(read('112_plan_board_local_truck.sql').includes(live[2]));
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(head(`${P}_dryrun.sql`).includes(m), 'the dry run header expects it');
  }
  for (const m of live) assert.ok(head(`${P}_rollback_dryrun.sql`).includes(m), 'the rollback ends on the live text');
  assert.ok(!gen.includes('0'.repeat(32)), 'no placeholder md5 left');
});

test('115 adds two columns, two CHECKs, one trigger, two functions; patches only its three; no grant, no drop', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/ADD COLUMN ([a-z_]+)/g)].map((m) => m[1]), ['partner_plates', 'partner_driver']);
  assert.deepStrictEqual([...src.matchAll(/ADD CONSTRAINT ([a-z_]+)/g)].map((m) => m[1]), ['rt_partner_text_shape', 'rt_partner_text_partner']);
  assert.deepStrictEqual([...src.matchAll(/CREATE (TABLE|VIEW|INDEX|TRIGGER|FUNCTION)\s+(public\.)?([a-z_]+)/g)].map((m) => m[3]),
    ['rt_partner_text_follow', 'rt_partner_text_follow', 'plan_h_partner_text']);
  assert.ok(!/\b(GRANT|DROP)\b/.test(src));
  assert.strictEqual((src.match(/REVOKE ALL ON FUNCTION public\.(rt_partner_text_follow|plan_h_partner_text)\(/g) || []).length, 2, 'both new functions born closed');
  for (const s of ['plan_rt_update(jsonb,text,text)', 'plan_rt_create(jsonb,text,text)', 'plan_board(date,text)']) assert.ok(src.includes(`public.${s}`), s);
  assert.strictEqual((src.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1, 'one CREATE OR REPLACE, in the loop over the three');
});
