// tests/sql-105-drafts.test.js - run: node --test tests/sql-105-drafts.test.js
// The 105 drafts (owner 3/11: one "complete" rule and revenue per load, in the database) at build time, plain node,
// no database. Reworked 8/11 after the first dry run timed out: 105 adds three views and touches NO live view.
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block, bounded by
//     statement_timeout and lock_timeout; verify and preflight only read;
//   - the generated dry runs have 0 drift;
//   - one md5 for ct_v_rt_revenue's text of 3/11 (tests/fixtures/ct_v_rt_revenue-2026-11-03.sql hashes to it);
//     ct_v_rt_revenue is never replaced; the per-load view carries its expressions verbatim, and the preflight
//     proves the very same text;
//   - the block is cheap: no read of ct_v_rt_pnl / ct_v_rt_revenue / ct_v_rt_revenue_legs inside it, and
//     ct_v_rt_complete never reads ct_v_rt_pnl or the stock views (seconds of planning each, measured 8/11);
//   - born closed: the three new views to service_role + tms_check_runner only, never anon / authenticated;
//   - 105 creates no table / trigger / function and writes no row; the rollback only drops the three views.
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
const noStrings = (s) => s.replace(/'[^']*'/g, "''");
const P = '105_rt_pnl_complete';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const READ_FILES = [`${P}_verify.sql`, `${P}_preflight.sql`];
const LIVE = '4b6fd9a9674d57d87c303d6500940f36';
const FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/ct_v_rt_revenue-2026-11-03.sql'), 'utf8');
const viewText = (src, name) => {
  const m = new RegExp(`EXECUTE \\$v\\$CREATE (?:OR REPLACE )?VIEW public\\.${name} AS\\n([\\s\\S]*?)\\$v\\$;`).exec(src);
  return m && m[1];
};
const doBlock = (src) => /\nDO \$do\$\n([\s\S]*?)\nEND \$do\$;/.exec(src)[1];

test('105: every file is there, ASCII only; one DO block per writing file, bounded; verify and preflight only read', () => {
  for (const f of [...DO_FILES, ...READ_FILES]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) {
    const s = strip(read(f));
    assert.strictEqual((s.match(/^DO \$/gm) || []).length, 1, f);
    const at = s.indexOf("SET statement_timeout = '30s';");
    assert.ok(at >= 0 && at < s.search(/^DO \$/m), `${f}: statement_timeout set before the block`);
    assert.match(s, /set_config\('lock_timeout', '5s', true\)/, `${f}: lock_timeout kept`);
  }
  // string literals out first: the privilege names it asks has_table_privilege about are words, not statements
  // a read file sets only its own bound (the 30 s of 105 may still be on the editor's connection), then reads
  for (const f of READ_FILES) {
    const s = strip(read(f));
    assert.match(s, /^SET statement_timeout = '120s';$/m, `${f}: its own statement_timeout`);
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|comment|set|do)\b/i.test(noStrings(s.replace(/^SET statement_timeout = '120s';$/m, ''))), f);
  }
});

test('105: the builder has no drift (dry run and rollback dry run)', () => {
  assert.match(execFileSync(process.execPath, [path.join(DRAFTS, 'tools/build-105.mjs'), '--check']).toString(), /0 drift/);
});

test('105: one md5 for ct_v_rt_revenue of 3/11, everywhere; the fixture is that text', () => {
  // pg_get_viewdef(..., true) = the text + ';' with no trailing newline
  assert.strictEqual(crypto.createHash('md5').update(FIXTURE.replace(/\n$/, '') + ';').digest('hex'), LIVE);
  for (const f of [`${P}.sql`, `${P}_rollback.sql`]) assert.ok(read(f).includes(`c_rev_live CONSTANT text := '${LIVE}'`), f);
  for (const f of READ_FILES) assert.ok(read(f).includes(LIVE), f);
});

test('105: ct_v_rt_revenue is never replaced; the loads carry its expressions; the preflight proves the same text', () => {
  for (const f of [...DO_FILES, ...READ_FILES]) {
    assert.ok(!/VIEW (IF EXISTS )?public\.ct_v_rt_revenue\b(?!_)/i.test(strip(read(f))), `${f}: no CREATE / DROP of ct_v_rt_revenue`);
  }
  const legs = viewText(read(`${P}.sql`), 'ct_v_rt_revenue_legs');
  // every join and the two Veroia Switch charges of the live view are in the per-load view, verbatim
  const pieces = FIXTURE.match(/LEFT JOIN [^\n]+|stock_vs_charge\([\s\S]*?pallets\)|WHERE h\.home_nat_load_id = nl\.id/g);
  assert.ok(pieces.length >= 12);
  for (const p of pieces) assert.ok(legs.includes(p), 'per-load view keeps: ' + p.slice(0, 60));
  assert.match(legs, /o\.parent_order_id IS NULL OR o\.leg_no = 1[\s\S]*AS carries_price/);
  assert.ok(read(`${P}_preflight.sql`).includes('WITH lg AS (\n' + legs + '), agg AS ('), 'preflight = the view body, verbatim');
});

test('105: the block is cheap - no heavy view read inside it; ct_v_rt_complete is light', () => {
  const blk = strip(doBlock(read(`${P}.sql`)));
  const cmp = viewText(read(`${P}.sql`), 'ct_v_rt_complete');
  // outside the three view bodies and string literals (to_regclass / pg_get_viewdef arguments, EXECUTE texts) the
  // block names no heavy view at all - qualified or not (it runs with search_path = public)
  const rest = noStrings(blk.replace(/EXECUTE \$v\$[\s\S]*?\$v\$;/g, ''));
  assert.ok(!/\b(ct_v_rt_pnl|ct_v_rt_revenue|ct_v_rt_revenue_legs|ct_v_rt_cost_cat)\b|stock_v_/.test(rest), 'no heavy view read in the block');
  assert.strictEqual((rest.match(/\bct_v_rt_complete\b/g) || []).length, 1, 'ct_v_rt_complete read ONCE (each read is a plan)');
  // ct_v_rt_complete reads exactly these relations, all qualified: a new one (a heavy view) fails here first
  assert.ok(!/(?<!DISTINCT )\b(?:FROM|JOIN)\s+(?!public\.|LATERAL\b|\()/.test(cmp), 'every relation in ct_v_rt_complete is public.-qualified');
  assert.deepStrictEqual([...new Set(cmp.match(/public\.\w+/g))].sort(), ['public.ct_cost_lines', 'public.ct_round_trips', 'public.ct_rt_legs',
    'public.ct_v_rt_costs', 'public.ct_v_rt_partner_cost', 'public.ct_v_v5_revenue', 'public.orders']);
  assert.match(blk, /clock_timestamp\(\) - v_t0 > interval '20 seconds'/, 'the block refuses if it ran long');
});

test('105: born closed - the new views to service_role + tms_check_runner only; no table / trigger / function / row', () => {
  const src = strip(read(`${P}.sql`));
  assert.match(src, /REVOKE ALL ON public\.ct_v_rt_revenue_legs, public\.ct_v_rt_cost_cat, public\.ct_v_rt_complete FROM PUBLIC, anon, authenticated, service_role, tms_check_runner'/);
  assert.match(src, /OR has_table_privilege\(r\.role, v\.rel, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'\)/, 'the proof refuses any right but SELECT');
  assert.match(src, /GRANT SELECT ON public\.ct_v_rt_revenue_legs, public\.ct_v_rt_cost_cat, public\.ct_v_rt_complete TO service_role, tms_check_runner'/);
  assert.ok(!/GRANT [^']*\b(anon|authenticated)\b/.test(src));
  assert.ok(!/\bCREATE (TABLE|TRIGGER|FUNCTION|OR REPLACE|INDEX)\b/i.test(src));
  assert.ok(!/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i.test(src));
  const cmp = viewText(read(`${P}.sql`), 'ct_v_rt_complete');
  for (const w of ['fuel', 'tolls', 'driver', 'partner_rate', 'price', 'trip_type']) assert.ok(cmp.includes(`'${w}'::text`), w);
  assert.match(cmp, /ARRAY\['fuel'::text, 'reefer_fuel'::text\]/, 'fuel = truck or reefer (the Expenses screen\'s group)');
  assert.match(cmp, /o\.stock_lot_id IS NULL/, 'a stock-lot order is left to its lot (known limit, said in the header)');
  // "price" reads the number the revenue takes (COALESCE first), THEN 0 = none: a leg 1 at 0 under a priced parent
  // earns 0, so it is missing (2 such legs 8/11)
  assert.match(cmp, /NULLIF\(COALESCE\(o\.price, CASE WHEN o\.leg_no = 1 THEN p\.price ELSE NULL::numeric END\), 0::numeric\) IS NULL/);
  assert.match(viewText(read(`${P}.sql`), 'ct_v_rt_revenue_legs'), /COALESCE\(sa\.rt_amount, o\.price,\s+CASE\s+WHEN o\.leg_no = 1 THEN p\.price/);
  // each view signs its own text (the rollback drops only a view still carrying it)
  for (const v of ['ct_v_rt_revenue_legs', 'ct_v_rt_cost_cat', 'ct_v_rt_complete']) {
    assert.match(src, new RegExp(`COMMENT ON VIEW public\\.${v} IS %L', '105 \\(owner 3/11\\): [^']*md5 '\\s+\\|\\| md5\\(pg_get_viewdef\\('public\\.${v}'::regclass, true\\)\\)`), v);
  }
});

test('105: the rollback only drops the three views, and only while they carry the text 105 signed', () => {
  const rbRaw = strip(read(`${P}_rollback.sql`));
  assert.ok(rbRaw.indexOf("substring(COALESCE(obj_description(") > 0
    && rbRaw.indexOf("substring(COALESCE(obj_description(") < rbRaw.indexOf("EXECUTE 'DROP VIEW"), 'the signature guard runs before any DROP');
  assert.deepStrictEqual((rbRaw.match(/DROP VIEW IF EXISTS public\.\w+/g) || []).sort(),
    ['DROP VIEW IF EXISTS public.ct_v_rt_complete', 'DROP VIEW IF EXISTS public.ct_v_rt_cost_cat', 'DROP VIEW IF EXISTS public.ct_v_rt_revenue_legs']);
  assert.ok(!/\b(CREATE|GRANT|REVOKE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(noStrings(doBlock(rbRaw))));
});

test('105 after it runs: a migration that changes ct_v_rt_revenue must change the per-load copy in the same file', () => {
  // ct_v_rt_revenue_legs is a COPY of ct_v_rt_revenue's expressions (DECISION_LOG 8/11): the build catches a later
  // migration that moves one without the other, the day it is written (principle 6), not on the paper weeks later.
  const files = [...fs.readdirSync(DRAFTS).map((f) => path.join(DRAFTS, f)), ...fs.readdirSync(path.join(ROOT, 'worker/migrations')).map((f) => path.join(ROOT, 'worker/migrations', f))]
    // after 105: a higher number, or 105 with a letter (105a_, 105b_ ... as 057b / 071a); 105_ itself is this migration
    .filter((f) => /\.sql$/.test(f) && !/_(dryrun|verify|preflight)\.sql$/.test(f))
    .filter((f) => { const m = /^(\d+)([a-z]?)_/.exec(path.basename(f)); return m && (+m[1] > 105 || (+m[1] === 105 && m[2] !== '')); });
  const bad = files.filter((f) => {
    const t = strip(fs.readFileSync(f, 'utf8'));
    return /VIEW (public\.)?ct_v_rt_revenue\s+AS\b/i.test(t) && !/VIEW (public\.)?ct_v_rt_revenue_legs\s+AS\b/i.test(t);
  });
  assert.deepStrictEqual(bad.map((f) => path.basename(f)), []);
});
