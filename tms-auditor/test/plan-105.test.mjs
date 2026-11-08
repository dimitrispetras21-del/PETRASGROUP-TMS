// 105 (owner 3/11/2026: one "complete" rule and revenue per load, in the database) on PGlite, the local Postgres the
// auditor already uses (no network, nothing reaches production). The copy is prodShaped093: its ct_v_rt_revenue IS
// the live text 105 guards on (md5 asserted below, no constant swapped), with ct_v_rt_costs, ct_v_v5_revenue and
// ct_v_rt_partner_cost as 073 left them.
// Reworked 8/11 after the first live dry run timed out: this test TIMES each step. The copy holds a handful of round
// trips, so the time is planning + DDL, not volume - which is where the old block lost its minutes (measured 8/11 on
// live, EXPLAIN only: ct_v_rt_pnl ~5 s of planning per read). The bound is RELATIVE to that: the old block took
// 803 ms on this copy (8/11), the new one ~60 ms, so anything over 400 ms means a heavy read crept back in.
// tests/sql-105-drafts.test.js holds the structural side (which relations the block may read).
// Each case reads ROWS (pg_class, pg_trigger, the new views), never only an answer.
// Run: cd tms-auditor && npm install && node --test test/plan-105.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
const LIVE = '4b6fd9a9674d57d87c303d6500940f36';
const VIEWS = `SELECT count(*) FROM pg_class WHERE oid IN (to_regclass('public.ct_v_rt_revenue_legs'), to_regclass('public.ct_v_rt_cost_cat'),
  to_regclass('public.ct_v_rt_complete'))`;
const TRG = `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;
const REV = `SELECT md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) AS m`;

// runs a script, returns { ms, err, notices }; a script of the owner's runs whole (SET + DO) as in the SQL editor
async function run(db, sql) {
  const notices = [];
  const t0 = performance.now();
  try { await db.exec(sql, { onNotice: (n) => notices.push(n.message) }); return { ms: performance.now() - t0, err: null, notices }; }
  catch (e) { return { ms: performance.now() - t0, err: String(e.message), notices }; }
}
const timing = [];

test('105 on the production-shaped copy: preflight, dry run, apply, verify, again, rollback - each timed', async (t) => {
  const db = await prodShaped093();
  const trg0 = await num(db, TRG);
  const rts = await num(db, `SELECT count(*) FROM ct_round_trips WHERE status <> 'cancelled'`);

  await t.test('the copy holds the live ct_v_rt_revenue text 105 guards on (re-capture if this fails)', async () => {
    assert.strictEqual((await one(db, REV)).m, LIVE);
    assert.ok(rts > 0, 'the copy has round trips');
  });

  await t.test('preflight (read-only): the per-load expressions add up to ct_v_rt_revenue on every round trip', async () => {
    const t0 = performance.now();
    const r = (await db.exec(read('105_rt_pnl_complete_preflight.sql'))).at(-1).rows[0];   // SET, then the one row
    timing.push(['preflight', performance.now() - t0]);
    assert.strictEqual(Number(r.n_diff), 0, JSON.stringify(r));
    assert.strictEqual(Number(r.round_trips_loads), Number(r.round_trips_live));
    assert.strictEqual(r.rev_text_md5, LIVE);
  });

  await t.test('dry run runs to its end and keeps nothing', async () => {
    const r = await run(db, read('105_rt_pnl_complete_dryrun.sql'));
    timing.push(['dry run', r.ms]);
    assert.match(r.err ?? '', new RegExp(`DRY RUN 105 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}105 ran: views 3, round trips ${rts}, complete \\d+, ct_v_rt_revenue md5 ${LIVE}`), r.err);
    assert.ok(r.notices.some((n) => /^105 OK: /.test(n)), JSON.stringify(r.notices));
    assert.strictEqual(await num(db, VIEWS), 0);
    assert.ok(r.ms < 400, `dry run took ${r.ms} ms (the old block: 803 ms here)`);
  });

  await t.test('105 applies: three views, ct_v_rt_revenue untouched, rights born closed, one row per round trip', async () => {
    const r = await run(db, read('105_rt_pnl_complete.sql'));
    timing.push(['105', r.ms]);
    assert.strictEqual(r.err, null, r.err);
    assert.ok(r.notices.some((n) => new RegExp(`^105 OK: ${rts} round trips, \\d+ complete, ct_v_rt_revenue untouched \\(${LIVE}\\), triggers ${trg0}, in `).test(n)), JSON.stringify(r.notices));
    assert.ok(r.ms < 400, `105 took ${r.ms} ms (the old block: 803 ms here)`);
    assert.strictEqual(await num(db, VIEWS), 3);
    assert.strictEqual((await one(db, REV)).m, LIVE);
    assert.strictEqual(await num(db, TRG), trg0);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_class WHERE relname IN ('ct_v_rt_revenue_legs', 'ct_v_rt_cost_cat', 'ct_v_rt_complete') AND relkind <> 'v'`), 0);
    for (const rel of ['ct_v_rt_revenue_legs', 'ct_v_rt_cost_cat', 'ct_v_rt_complete']) {
      const acl = await one(db, `SELECT has_table_privilege('anon', $1, 'SELECT') a, has_table_privilege('authenticated', $1, 'SELECT') u,
        has_table_privilege('service_role', $1, 'SELECT') s, has_table_privilege('tms_check_runner', $1, 'SELECT') c,
        has_table_privilege('service_role', $1, 'INSERT, UPDATE, DELETE, TRUNCATE') w`, ['public.' + rel]);
      assert.deepStrictEqual(acl, { a: false, u: false, s: true, c: true, w: false }, rel);
    }
    assert.strictEqual(await num(db, `SELECT count(*) FROM ct_v_rt_complete`), rts);
    assert.strictEqual(await num(db, `SELECT count(*) FROM ct_v_rt_complete WHERE complete <> (cardinality(missing) = 0)
      OR NOT (missing <@ ARRAY['fuel', 'tolls', 'driver', 'partner_rate', 'price', 'trip_type'])`), 0);
  });

  await t.test('verify (read-only) answers as its header says', async () => {
    const t0 = performance.now();
    const res = await db.exec(read('105_rt_pnl_complete_verify.sql'));
    timing.push(['verify', performance.now() - t0]);
    const [a, b] = res.filter((x) => x.rows.length);
    assert.deepStrictEqual({ ...a.rows[0], views: Number(a.rows[0].views), anon_rights: Number(a.rows[0].anon_rights),
      service_writes: Number(a.rows[0].service_writes), rows: Number(a.rows[0].rows), round_trips: Number(a.rows[0].round_trips) },
    { views: 3, rev_live_text: 'the text of 3/11', anon_rights: 0, service_writes: 0, rows: rts, round_trips: rts });
    assert.strictEqual(Number(b.rows[0].loads_diff), 0);
  });

  await t.test('105 a second time refuses, nothing changes', async () => {
    const r = await run(db, read('105_rt_pnl_complete.sql'));
    assert.match(r.err ?? '', /105: a 105 view already exists - 105 has run, nothing to do/);
    assert.strictEqual(await num(db, VIEWS), 3);
  });

  await t.test('a 105 view replaced by a later migration: the rollback refuses before it drops anything', async () => {
    await db.exec('BEGIN');
    const def = (await one(db, `SELECT pg_get_viewdef('public.ct_v_rt_cost_cat'::regclass, true) AS d`)).d;
    await db.exec(`CREATE OR REPLACE VIEW public.ct_v_rt_cost_cat AS ${def.replace(/;\s*$/, '')} LIMIT ALL`);
    const r = await run(db, read('105_rt_pnl_complete_rollback.sql'));
    await db.exec('ROLLBACK');
    assert.match(r.err ?? '', /105 rollback: a 105 view is no longer the text 105 created/, r.err);
    assert.strictEqual(await num(db, VIEWS), 3);
  });

  await t.test('rollback dry run keeps everything; rollback drops the three views and nothing else', async () => {
    const d = await run(db, read('105_rt_pnl_complete_rollback_dryrun.sql'));
    timing.push(['rollback dry run', d.ms]);
    assert.match(d.err ?? '', /DRY RUN 105 ROLLBACK finished - EVERYTHING UNDONE/, d.err);
    assert.strictEqual(await num(db, VIEWS), 3);
    const r = await run(db, read('105_rt_pnl_complete_rollback.sql'));
    timing.push(['rollback', r.ms]);
    assert.strictEqual(r.err, null, r.err);
    assert.ok(r.notices.some((n) => /^105 ROLLBACK OK: /.test(n)), JSON.stringify(r.notices));
    assert.strictEqual(await num(db, VIEWS), 0);
    assert.strictEqual((await one(db, REV)).m, LIVE);
    assert.strictEqual(await num(db, TRG), trg0);
    const again = await run(db, read('105_rt_pnl_complete_rollback.sql'));
    assert.match(again.err ?? '', /none of the 105 views is there/);
  });

  await t.test('a ct_v_rt_revenue that is not the 3/11 text: 105 refuses before it writes', async () => {
    const def = (await one(db, `SELECT pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true) AS d`)).d;
    await db.exec(`CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS ${def.replace(/;\s*$/, '')} LIMIT ALL`);
    const r = await run(db, read('105_rt_pnl_complete.sql'));
    assert.match(r.err ?? '', /105: ct_v_rt_revenue is not the text the per-load view was copied from/);
    assert.strictEqual(await num(db, VIEWS), 0);
  });

  console.log('105 timing on PGlite (ms): ' + timing.map(([k, ms]) => `${k} ${ms.toFixed(0)}`).join(' · '));
});
