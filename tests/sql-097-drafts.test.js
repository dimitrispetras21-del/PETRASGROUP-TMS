// tests/sql-097-drafts.test.js - run: node --test tests/sql-097-drafts.test.js
// The 097 drafts (the Veroia day of a VS only from a stop at Veroia; transfer at any point, piece 1, design 2/11) at
// build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs, rollback and verify have 0 drift (the rollback reads 071's view from 071's file);
//   - one md5 per fact: the old one is the dry run's guard and the rollback's end, the new one verify's and the dry run's;
//   - one definition of "a VS leg off Veroia": the source's PART 0 count is the builder's (rollback, verify, dry runs);
//   - 097 replaces v_vs_state and nothing else, with the same columns in the same order as 071.
// The rule is proven on PGlite by tms-auditor/test/plan-097.test.mjs (NO-GO before, GO after, rollback).
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
const P = '097_plan_vs_state_hub_only';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-097.mjs');
const md5Of = (src, name) => (new RegExp(`${name} CONSTANT text := '([0-9a-f]{32})'`).exec(src) || [])[1];

test('097: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('097: the builder has no drift (dry runs, rollback, verify)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('097: one md5 per fact - old = the guard and the rollback\'s end; new = proof, verify, dry run, rollback\'s start', () => {
  const src = read(`${P}.sql`);
  const old = md5Of(src, 'm_view_old'), neu = md5Of(src, 'm_view_new');
  assert.ok(old && neu && old !== neu, 'both measured, and different');
  assert.ok(!/@M[OV]/.test(src), 'no placeholder left');
  assert.ok(src.includes(`= '${neu}' THEN '097 OK'`), 'the result row reads the new md5');
  assert.ok(read(`${P}_verify.sql`).includes(`'${neu}'`));
  assert.ok(read(`${P}_dryrun.sql`).includes(`= '${neu}' THEN 'yes'`));
  const rb = read(`${P}_rollback.sql`);
  assert.ok(rb.includes(`<> '${neu}' THEN`) && rb.includes(`<> '${old}' THEN`), 'the rollback goes from new to old');
  assert.ok(read(`${P}_rollback_dryrun.sql`).includes(`= '${old}' THEN 'yes'`));
});

test('097: one definition of "a VS leg off Veroia" - the source\'s PART 0 = the builder\'s', () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const where = `WHERE (ps.kind = 'vs_import' AND pk.location_id IS DISTINCT FROM hub.id)
      OR (ps.kind = 'vs_export' AND dr.location_id IS DISTINCT FROM hub.id)`;
  const src = read(`${P}.sql`);
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  assert.ok(norm(part0).includes(norm(where)), 'PART 0 counts the off-Veroia legs');
  for (const f of [`${P}_rollback.sql`, `${P}_verify.sql`]) assert.ok(norm(read(f)).includes(norm(where)), f);
});

test('097 replaces v_vs_state only, with 071\'s columns in 071\'s order; the rollback holds 071\'s text', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/CREATE (OR REPLACE )?(TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\s+([a-z_.]+)/g)].map((m) => m[4]),
    ['public.v_vs_state']);
  assert.ok(!/\b(GRANT|REVOKE|ALTER|DROP)\b/.test(src));
  const s071 = fs.readFileSync(path.join(ROOT, 'worker/migrations/071_plan_schema.sql'), 'utf8');
  const a = s071.indexOf('  CREATE VIEW public.v_vs_state'), b = s071.indexOf('  GROUP BY ps.order_id;\n', a);
  const v071 = s071.slice(a, b);
  // the output columns, in order: the alias closing each select item of the view
  const cols = (s) => [...strip(s).matchAll(/ AS ([a-z_]+),?\s*$/gm)].map((m) => m[1]);
  const src097 = read(`${P}.sql`);
  const v097 = src097.slice(src097.indexOf('  CREATE OR REPLACE VIEW public.v_vs_state'), src097.indexOf('  GROUP BY ps.order_id;\n'));
  const want = ['n_pieces', 'all_executed', 'all_planned', 'first_hub_day', 'carriers'];
  assert.deepStrictEqual(cols(v071), want);
  assert.deepStrictEqual(cols(v097), want);
  for (const v of [v071, v097]) assert.match(v, /SELECT ps\.order_id,\n/);
  assert.ok(read(`${P}_rollback.sql`).includes(v071.replace('  CREATE VIEW', '  CREATE OR REPLACE VIEW')), 'the rollback holds 071 verbatim');
});
