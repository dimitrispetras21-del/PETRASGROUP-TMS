// 071 (national v5 schema) and 071b (one truck / one driver at a time) on a production-shaped PGlite copy, at
// build time (principle 6): the owner's evening run should only confirm what this file already knows.
// Production shape = the 22/9 column fixture + fixtures/live-071.sql (read-only capture of production, plan
// docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md Task 1 Step 2): the live columns, defaults, CHECKs,
// indexes, and the round-trip / payroll / local-move functions and triggers 071 rewrites or fires.
// Known limit: the fixture copies columns, defaults, CHECKs, indexes, functions and triggers only - not NOT NULL, FK or
// UNIQUE constraints - so rules that depend on those are proven only by the production dry run.
// The money views (ct_v_rt_revenue, ct_v_rt_costs, ct_v_rt_pnl) and dl_v_rt_route are STUBS here: their
// before = after proof is real only on production (the dry run). Here the RULES are what is proved.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');   // 071 executed 22/10: worker/migrations
const LIVE = fs.readFileSync(path.join(HERE, 'fixtures/live-071.sql'), 'utf8');
let btreeGist = null;
try { ({ btree_gist: btreeGist } = await import('@electric-sql/pglite/contrib/btree_gist')); } catch { btreeGist = null; }

// signature -> [live md5 read 21/10, md5 after 071]
const FN = {
  'public.rt_status_guard()': ['f632fea1d6a5dd2cee7c80f4db9e27f2', 'd7757f99c3443ac167d5bdaf3e34b142'],
  'public.rt_recompute(bigint)': ['3f85092f030b2ad92a3002ab0a9cc98d', '5fa0a08418147b22d2852db3b8c72c3e'],
  'public.rt_auto_close(bigint)': ['88b41f860aaf7f925183ab84dc10c2dd', 'eba2146ca4c521da6365edd28c4507af'],
  'public.dl_local_day_sync(bigint,date)': ['a4a62603e5b0c4ad48124fea625aa611', '151dab06e2676f3c8885d7298d0ac6af'],
};
const STUBS = `
CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS SELECT id AS rt_id, 0::numeric AS revenue, 0::numeric AS revenue_intl,
  0::numeric AS revenue_natl FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_costs AS SELECT id AS rt_id, 0::numeric AS lines_net, 0::numeric AS vat, 0::numeric AS wear,
  0::numeric AS dl_trip_value, 0::numeric AS dl_expenses, 0::numeric AS driver_pay_pending, 0::bigint AS driver_pay_missing,
  0::numeric AS partner_planned, 0::numeric AS partner_invoiced FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS SELECT id, 0::numeric AS cost_gross, 0::numeric AS profit_worst,
  0::numeric AS profit_ex_vat FROM public.ct_round_trips WHERE status <> 'cancelled';
CREATE OR REPLACE VIEW public.dl_v_rt_route AS SELECT id AS rt_id, ''::text AS route_text FROM public.ct_round_trips;
`;
const TRG = `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

async function prodShaped() {
  const db = await freshDb({ v5: false, ...(btreeGist ? { extensions: { btree_gist: btreeGist } } : {}) });   // 071 itself, not the stand-ins
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;`);
  await db.exec(LIVE);
  await db.exec(STUBS);
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5Of = async (db, sig) => (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0]?.m;
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);

test('071 + 071b on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const before = await count(db, TRG);

  await t.test('the fixture holds the LIVE texts 071 guards on (re-capture if this fails)', async () => {
    for (const [sig, [old]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), old, sig);
  });

  await t.test('071 dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read('071_plan_schema_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 071 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}071 ran: tables 5, model column true, hub CROSS-DOCK, rt_recompute 5fa0a08418147b22d2852db3b8c72c3e, B-54 \d+/, msg);
    assert.equal((await db.query(`SELECT to_regclass('public.shipments')::text AS r`)).rows[0].r, null);
    assert.equal(await count(db, TRG), before);
  });

  await t.test('071 applies: +9 triggers, B-54 follows, the four functions hold the generated texts', async () => {
    assert.equal(await errorOf(db, read('071_plan_schema.sql')), null);
    assert.equal(await count(db, TRG), before + 9);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), before + 9);
    for (const [sig, [, neu]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), neu, sig);
  });

  await t.test('071 verify: in place, 0 rows, born closed', async () => {
    const r = (await db.query(read('071_plan_schema_verify.sql'))).rows[0];
    assert.equal(r.applied, '071 in place');
    assert.equal(r.b54_matches, true);
    for (const k of ['new_rows', 'v5_cycles', 'via_hub_stops', 'nat_loadings', 'open_relations', 'rls_off', 'policies', 'open_functions'])
      assert.equal(Number(r[k]), 0, k);
    assert.equal(Number(r.new_triggers), 9);
    assert.match(r.hub, / CROSS-DOCK$/);
  });

  await t.test('071 rules test: 56 OK, 0 FAIL, nothing kept', async () => {
    const msg = await errorOf(db, read('071_plan_schema_test.sql'));
    assert.match(msg ?? '', /RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept\. Result: 56 OK, 0 FAIL/, msg);
    assert.equal(await count(db, `SELECT (SELECT count(*) FROM shipments) + (SELECT count(*) FROM rt_stops)
      + (SELECT count(*) FROM ct_round_trips WHERE model = 2) AS n`), 0);
  });

  await t.test('071b: dry run keeps nothing, then applies, verify and 8 rules', { skip: btreeGist ? false : 'btree_gist not in PGlite 0.5.8' }, async () => {
    const dry = await errorOf(db, read('071b_plan_one_vehicle_dryrun.sql'));
    assert.match(dry ?? '', /DRY RUN 071b finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}071b ran: rt_v2_truck_once true, rt_v2_driver_once true/, dry);
    assert.equal(await count(db, `SELECT count(*) AS n FROM pg_constraint WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')`), 0);
    assert.equal(await errorOf(db, read('071b_plan_one_vehicle.sql')), null);
    const v = (await db.query(read('071b_plan_one_vehicle_verify.sql'))).rows[0];
    assert.equal(v.truck_once, true); assert.equal(v.driver_once, true);
    assert.equal(Number(v.truck_overlaps), 0); assert.equal(Number(v.driver_overlaps), 0);
    const msg = await errorOf(db, read('071b_plan_one_vehicle_test.sql'));
    assert.match(msg ?? '', /RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept\. Result: 8 OK, 0 FAIL/, msg);
    assert.equal(await count(db, TRG), before + 9, '071b adds no trigger');
    assert.equal(await errorOf(db, read('071b_plan_one_vehicle_rollback.sql')), null);
  });

  await t.test('071 rollback: the live texts back byte for byte, every object gone, B-54 back', async () => {
    assert.equal(await errorOf(db, read('071_plan_schema_rollback.sql')), null);
    for (const [sig, [old]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), old, sig);
    assert.equal(await count(db, TRG), before);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), before);
    assert.equal(await count(db, `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'public'
      AND ((table_name = 'ct_round_trips' AND column_name IN ('model', 'start_at', 'end_at', 'partner_rate'))
        OR (table_name = 'locations' AND column_name = 'is_hub') OR (table_name = 'order_stops' AND column_name = 'via_hub')
        OR (table_name = 'local_moves' AND column_name = 'rt_stop_id') OR (table_name = 'pl_movements' AND column_name = 'piece_leg_id'))`), 0);
    assert.equal((await db.query(`SELECT to_regclass('public.rt_stops')::text AS r`)).rows[0].r, null);
  });
});
