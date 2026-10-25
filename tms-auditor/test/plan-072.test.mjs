// 072 (national v5 plan_* functions) on a production-shaped PGlite copy, at build time (principle 6): the owner's
// evening run should only confirm what this file already knows. BOOTSTRAP of Task A1: Task B8 replaces this file
// with the full harness (dry run, verify, API roles, rollback, mutation), keeping prodShaped() as it is here.
// Production shape = the 22/9 column fixture + fixtures/live-071.sql (F1 capture) + fixtures/live-072.sql (read-only
// capture of production, plan docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md Task A1 Step 1:
// NOT NULL, identity ALWAYS, UNIQUE, FOREIGN KEY, the CHECKs of every table 072 writes, and the functions / triggers
// its writes fire on national_orders, orders and order_stops), then 071 and 071b as executed 22/10. The money views
// stay STUBS: what is proved here are the RULES of 072.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';
// 071b's EXCLUDE needs btree_gist (no skip: a missing extension is a failure); pgcrypto as on production (@extensions)
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');   // 072: drafts until executed
const readDone = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');   // 071 / 071b: executed 22/10
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

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
const V5_ROWS = `SELECT (SELECT count(*) FROM shipments) + (SELECT count(*) FROM shipment_pieces) + (SELECT count(*) FROM rt_stops)
  + (SELECT count(*) FROM piece_legs) + (SELECT count(*) FROM plan_notices) + (SELECT count(*) FROM ct_round_trips WHERE model = 2) AS n`;

async function prodShaped() {
  const db = await freshDb({ extensions: { btree_gist, pgcrypto } });
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;`);
  await db.exec(fixture('live-071.sql'));
  await db.exec(fixture('live-072.sql'));
  await db.exec(STUBS);
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  await db.exec(readDone('071_plan_schema.sql'));
  await db.exec(readDone('071b_plan_one_vehicle.sql'));
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
// the want lines of the rules test: one per case, "    , '<expected>'  -- <k> ..."
const wantCount = (sql) => (sql.match(/^ {4}, '(ok|plan:[a-z0-9_]+|con:[a-z0-9_]+|state:[0-9A-Z]{5})'/gm) || []).length;
// the md5 guard of 072: ('<sig>', '<md5>') pairs, each written twice (PART 0 guard, PART 5 proof)
const guardPairs = (src) => new Map([...src.matchAll(/\('(public\.[a-z_0-9]+\([a-z,\[\]]*\))', '([0-9a-f]{32})'\)/g)]
  .map((m) => [m[1], m[2]]));

test('072 on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const before = await count(db, TRG);
  const src = read('072_plan_functions.sql');

  await t.test('the fixtures hold the LIVE texts 072 guards on (re-capture if this fails)', async () => {
    const live = guardPairs(src);
    assert.strictEqual(live.size, 22);
    for (const [sig, m] of live) {
      const r = (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0];
      assert.strictEqual(r?.m, m, sig);
    }
  });

  await t.test('072 applies: born closed, no trigger, 0 v5 rows', async () => {
    let res;
    try { res = await db.exec(src); } catch (e) { assert.fail(e.message); }
    const row = res.at(-1).rows[0];
    assert.strictEqual(row.result, '072 OK');
    assert.strictEqual(Number(row.public_triggers), before, '072 adds no trigger');
    assert.strictEqual(Number(row.b54_red_value), before, 'B-54 unchanged');
    assert.strictEqual(Number(row.v5_rows), 0);
    assert.strictEqual(Number(row.v5_cycles), 0);
    assert.strictEqual(await count(db, V5_ROWS), 0);
    const pub = (src.match(/v_pub CONSTANT text\[\] := array_remove\(ARRAY\[([\s\S]*?)\]::text\[\], NULL\);/)[1]
      .replace(/--[^\n]*/g, '').match(/'public\.plan_[a-z_]+\([a-z,\[\]]*\)'/g) || []).length;
    assert.strictEqual(Number(row.public_functions), pub, 'service_role executes exactly v_pub');
    assert.strictEqual(await count(db, `SELECT count(*) AS n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'plan\\_%' AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))`), 0, 'anon / authenticated execute nothing');
  });

  await t.test('072 rules test: every case OK, nothing kept', async () => {
    const sql = read('072_plan_functions_test.sql');
    const n = wantCount(sql);
    assert.ok(n > 0, 'no want line found');
    const msg = await errorOf(db, sql);
    assert.match(msg ?? '', new RegExp(`RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\\. Result: ${n} OK, 0 FAIL`), msg);
    assert.strictEqual(await count(db, V5_ROWS), 0);
  });
});
