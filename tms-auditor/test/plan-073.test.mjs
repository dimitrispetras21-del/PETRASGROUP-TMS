// 073 (national v5 money, route, pallets) on a production-shaped PGlite copy, at build time (principle 6): the
// owner's evening run should only confirm what this file already knows.
// Production shape = ONE builder with the 072b harness (prod-shaped-072.mjs: the 22/9 column fixture +
// fixtures/live-071.sql (F1) + fixtures/live-072.sql (F2) + 071, 071b and 072 as executed), called with
// { money: 'live' }: fixtures/live-073.sql (F3 Task 1: the REAL money, route, gate and stock views, their grants and
// the functions they call, captured from production 26/10) instead of the stubs, and { with072b: true }: the 072b
// draft on top of 072 (order 072 -> 072b -> 073). Then fixtures/v1-money-073.sql (synthetic round trips of today's
// model with a row in every branch 073 rewrites). Unlike 071/072/072b, the money views are NOT stubs here: their
// before = after is proved on data.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { DRAFTS } from '../lib/db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');             // 073: drafts until executed
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

const V5_ROWS = `SELECT (SELECT count(*) FROM shipments) + (SELECT count(*) FROM shipment_pieces) + (SELECT count(*) FROM rt_stops)
  + (SELECT count(*) FROM piece_legs) + (SELECT count(*) FROM plan_notices) + (SELECT count(*) FROM ct_round_trips WHERE model = 2)
  + (SELECT count(*) FROM pl_movements WHERE piece_leg_id IS NOT NULL) AS n`;
// The rows of today, outside the block (the block proves the same inside): every view 073 replaces.
const SNAP = `SELECT concat_ws(' ',
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM ct_v_rt_revenue v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM ct_v_rt_costs v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg((to_jsonb(v) - 'partner_rate_missing')::text, '|' ORDER BY v.id), '')) FROM ct_v_rt_pnl v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM dl_v_rt_route v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM ct_v_rt_pallet_gate v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.piece_kind, v.piece_id), '')) FROM stock_v_pieces v),
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.id), '')) FROM stock_v_lots v)) AS s`;

// The rights as production holds them (SELECT on production 26/10, F3 Task 4): the capture keeps only who may SELECT,
// but the five money / route views give service_role arwDxtm, and a NEW table or view of postgres in public gets
// service_role=arwxtm from the default privileges. 073's rollback drops and re-creates ct_v_rt_pnl, so its acl proof
// is only worth anything with both in place.
const PROD_RIGHTS = `
  GRANT INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
    ON public.ct_v_rt_revenue, public.ct_v_rt_costs, public.ct_v_rt_pnl, public.dl_v_rt_route, public.ct_v_rt_pallet_gate
    TO service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT INSERT, SELECT, UPDATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO service_role;`;
const ACL = `SELECT string_agg(c.relname || '=' || coalesce(c.relacl::text, '-'), ' ' ORDER BY c.relname) AS s FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('ct_v_rt_revenue', 'ct_v_rt_costs', 'ct_v_rt_pnl',
    'dl_v_rt_route', 'ct_v_rt_pallet_gate', 'stock_v_pieces')`;

async function prodShaped() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(PROD_RIGHTS);
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
const one = async (db, sql) => (await db.query(sql)).rows[0];
const wantCount = (sql) => (sql.match(/^ {4}, '(ok|plan:[a-z0-9_]+|con:[a-z0-9_]+|state:[0-9A-Z]{5})'/gm) || []).length;
// the guard pairs of PART 0 of 073, read from the migration itself (one source): views by name, functions by signature
const part0 = (src) => src.slice(src.indexOf('PART 0'), src.indexOf('PART 1'));
const viewPairs = (src) => [...part0(src).matchAll(/\('(public\.[a-z0-9_]+)', '([0-9a-f]{32})'\)/g)];
const fnPairs = (src) => [...part0(src).matchAll(/\('(public\.[a-z0-9_]+\([a-z0-9_,[\]]*\))', '([0-9a-f]{32})'\)/g)];
const fnMd5 = async (db, sig) => (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0]?.m;

test('073 on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const before = await count(db, TRG);
  const snap0 = (await one(db, SNAP)).s;
  const acl0 = (await one(db, ACL)).s;

  await t.test('the fixtures hold the LIVE texts 073 guards on (re-capture if this fails)', async () => {
    const src = read('073_plan_money.sql');
    const views = viewPairs(src);
    assert.strictEqual(views.length, 12);
    for (const [, rel, m] of views) assert.strictEqual((await one(db, `SELECT md5(pg_get_viewdef('${rel}'::regclass, true)) AS m`)).m, m, rel);
    // the 10 functions too (Task 0 review, minor 2): ct_setting / stock_vs_charge come only from live-073.sql, and
    // plan_h_drop_consequences / plan_rt_update carry 072b's hooks on this copy
    const fns = fnPairs(src);
    assert.strictEqual(fns.length, 10);
    for (const [, sig, m] of fns) assert.strictEqual(await fnMd5(db, sig), m, sig);
  });

  await t.test('073 dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read('073_plan_money_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 073 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}073 ran: v5 revenue view yes, helper yes, stop index yes, pnl rows 3, route rows 4, v5 rows 0, triggers \d+/, msg);
    assert.strictEqual((await one(db, `SELECT to_regclass('public.ct_v_v5_revenue')::text AS r`)).r, null);
    assert.strictEqual((await one(db, SNAP)).s, snap0);
  });

  await t.test('073 applies: the rows of today unchanged, no trigger, 0 v5 rows', async () => {
    const res = await db.exec(read('073_plan_money.sql'));
    assert.strictEqual(res.at(-1).rows[0].result, '073 OK');
    assert.strictEqual((await one(db, SNAP)).s, snap0, 'before = after, outside the block too');
    assert.strictEqual(await count(db, TRG), before);
    assert.strictEqual(await count(db, V5_ROWS), 0);
  });

  await t.test('073 verify: in place, nothing changed, nothing open', async () => {
    const r = await one(db, read('073_plan_money_verify.sql'));
    assert.strictEqual(r.applied, '073 in place');
    for (const k of ['views_changed', 'functions_changed', 'invoker_lost', 'open_money', 'open_helper', 'v5_rows']) assert.strictEqual(Number(r[k]), 0, k);
    assert.strictEqual(r.stop_once, true);
    assert.strictEqual(r.b54_matches, true);
  });

  await t.test('073 rules test: every case OK, nothing kept', async () => {
    const sql = read('073_plan_money_test.sql');
    const n = wantCount(sql);
    assert.ok(n >= 32, `${n} cases`);
    const msg = await errorOf(db, sql);
    assert.match(msg ?? '', new RegExp(`RULES TEST 073 finished - EVERYTHING UNDONE, nothing kept\\. Result: ${n} OK, 0 FAIL`), msg);
    assert.strictEqual(await count(db, V5_ROWS), 0);
    assert.strictEqual((await one(db, SNAP)).s, snap0);
  });

  await t.test('073 rollback: 072 + 072b and the live views back byte for byte, then 073 again', async () => {
    assert.strictEqual(await errorOf(db, read('073_plan_money_rollback.sql')), null);
    const src = read('073_plan_money.sql');
    for (const [, rel, m] of viewPairs(src))
      assert.strictEqual((await one(db, `SELECT md5(pg_get_viewdef('${rel}'::regclass, true)) AS m`)).m, m, rel);
    for (const [, sig, m] of fnPairs(src)) assert.strictEqual(await fnMd5(db, sig), m, sig);
    assert.strictEqual((await one(db, SNAP)).s, snap0);
    assert.strictEqual((await one(db, ACL)).s, acl0, 'the rights of the six views, ct_v_rt_pnl re-created included');
    assert.match(acl0, /ct_v_rt_pnl=\{[^}]*service_role=arwDxtm\//, 'the copy holds production\'s rights');
    assert.strictEqual((await one(db, read('073_plan_money_verify.sql'))).applied, '073 NOT in place');
    const again = await db.exec(read('073_plan_money.sql'));
    assert.strictEqual(again.at(-1).rows[0].result, '073 OK');
  });

  await t.test('the proof bites: a changed arrow in the route of today is refused', async () => {
    assert.strictEqual(await errorOf(db, read('073_plan_money_rollback.sql')), null);
    const bad = read('073_plan_money.sql').replace("U&' \\2192 '::text) || COALESCE(lt.city, lt.name), U&' \\00B7 '::text ORDER BY leg.seq",
      "' -> '::text) || COALESCE(lt.city, lt.name), U&' \\00B7 '::text ORDER BY leg.seq");
    assert.notStrictEqual(bad, read('073_plan_money.sql'));
    assert.match(await errorOf(db, bad) ?? '', /073 proof: a number of today changed/);
  });
});
