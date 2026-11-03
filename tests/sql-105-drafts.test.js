// tests/sql-105-drafts.test.js - run: node --test tests/sql-105-drafts.test.js
// The 105 drafts (owner 3/11: one "complete" rule and revenue per load, in the database) at build time, plain node,
// no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs have 0 drift;
//   - one md5 for ct_v_rt_revenue's text of 3/11: 105's guard, the rollback's guard and proof, verify - and the text the
//     rollback restores hashes to it (so the rollback returns EXACTLY the live view);
//   - the new ct_v_rt_revenue is the sum of ct_v_rt_revenue_legs (one source), with the same five columns;
//   - born closed: the three new views to service_role + tms_check_runner only, never anon / authenticated;
//   - 105 creates no table / trigger / function and writes no row.
// Measured on the live database 3/11 (SELECT only): the per-load sum = ct_v_rt_revenue on 267 / 267 round trips,
// fingerprint 1da6df79550cda0262b7c3514df95aa3 both ways.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
const file = (f) => {
  const d = path.join(DRAFTS, f), m = path.join(ROOT, 'worker/migrations', f);
  if (fs.existsSync(d) && fs.existsSync(m)) throw new Error(`${f} in drafts/ AND one up`);
  return fs.existsSync(d) ? d : m;
};
const read = (f) => fs.readFileSync(file(f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const P = '105_rt_pnl_complete';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const LIVE = '4b6fd9a9674d57d87c303d6500940f36';
const viewText = (src, name) => {
  const m = new RegExp(`EXECUTE \\$v\\$CREATE (?:OR REPLACE )?VIEW public\\.${name} AS\\n([\\s\\S]*?)\\$v\\$;`).exec(src);
  return m && m[1];
};

test('105: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|comment)\b/i.test(strip(read(`${P}_verify.sql`))));
});

test('105: the builder has no drift (dry run and rollback dry run)', () => {
  assert.match(execFileSync(process.execPath, [path.join(DRAFTS, 'tools/build-105.mjs'), '--check']).toString(), /0 drift/);
});

test('105: one md5 for ct_v_rt_revenue of 3/11 - and the rollback restores exactly that text', () => {
  const src = read(`${P}.sql`), rb = read(`${P}_rollback.sql`), ver = read(`${P}_verify.sql`);
  for (const [n, s] of [['source', src], ['rollback', rb]]) assert.ok(s.includes(`c_rev_live CONSTANT text := '${LIVE}'`), n);
  assert.ok(ver.includes(`'${LIVE}'`), 'verify knows the live text');
  const restored = viewText(rb, 'ct_v_rt_revenue');
  assert.ok(restored, 'the rollback restores ct_v_rt_revenue');
  // pg_get_viewdef(..., true) = the text + ';' with no trailing newline
  assert.strictEqual(crypto.createHash('md5').update(restored.replace(/\n$/, '') + ';').digest('hex'), LIVE);
});

test('105: ct_v_rt_revenue = the sum of its loads (same five columns); the loads carry the old expressions', () => {
  const src = read(`${P}.sql`), rb = read(`${P}_rollback.sql`);
  const rev = viewText(src, 'ct_v_rt_revenue'), legs = viewText(src, 'ct_v_rt_revenue_legs'), old = viewText(rb, 'ct_v_rt_revenue');
  assert.match(rev, /FROM public\.ct_v_rt_revenue_legs\s+GROUP BY rt_id/);
  for (const c of ['revenue', 'revenue_intl', 'revenue_natl', 'revenue_missing']) assert.ok(rev.includes(` AS ${c}`), c);
  assert.ok(rev.indexOf('AS revenue,') < rev.indexOf('AS revenue_intl') && rev.indexOf('AS revenue_intl') < rev.indexOf('AS revenue_natl')
    && rev.indexOf('AS revenue_natl') < rev.indexOf('AS revenue_missing'), 'column order kept (CREATE OR REPLACE)');
  // every join and the two Veroia Switch charges of the old view are in the per-load view, verbatim
  const pieces = old.match(/LEFT JOIN [^\n]+|stock_vs_charge\([\s\S]*?pallets\)|WHERE h\.home_nat_load_id = nl\.id/g);
  assert.ok(pieces.length >= 12);
  for (const p of pieces) assert.ok(legs.includes(p), 'per-load view keeps: ' + p.slice(0, 60));
  assert.match(legs, /o\.parent_order_id IS NULL OR o\.leg_no = 1[\s\S]*AS carries_price/);
});

test('105: born closed - the new views to service_role + tms_check_runner only; no table / trigger / function / row', () => {
  const src = strip(read(`${P}.sql`));
  assert.match(src, /REVOKE ALL ON public\.ct_v_rt_revenue_legs, public\.ct_v_rt_cost_cat, public\.ct_v_rt_complete FROM PUBLIC, anon, authenticated/);
  assert.match(src, /GRANT SELECT ON public\.ct_v_rt_revenue_legs, public\.ct_v_rt_cost_cat, public\.ct_v_rt_complete TO service_role, tms_check_runner'/);
  assert.ok(!/GRANT [^']*\b(anon|authenticated)\b/.test(src));
  assert.ok(!/\bCREATE (TABLE|TRIGGER|FUNCTION|OR REPLACE FUNCTION|INDEX)\b/i.test(src));
  assert.ok(!/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i.test(src));
  const cmp = viewText(read(`${P}.sql`), 'ct_v_rt_complete');
  for (const w of ['fuel', 'tolls', 'driver', 'partner_rate', 'price']) assert.ok(cmp.includes(`'${w}'::text`), w);
  assert.match(cmp, /ARRAY\['fuel'::text, 'reefer_fuel'::text\]/, 'fuel = truck or reefer (the Expenses screen\'s group)');
});
