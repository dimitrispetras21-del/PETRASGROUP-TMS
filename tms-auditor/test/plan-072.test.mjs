// 072 (national v5 plan_* functions) on a production-shaped PGlite copy, at build time (principle 6): the owner's
// evening run should only confirm what this file already knows.
// Production shape = the 22/9 column fixture + fixtures/live-071.sql (production before 071) + fixtures/live-072.sql
// (read-only capture of 22/10+: NOT NULL, identity ALWAYS, UNIQUE, FOREIGN KEY, the CHECKs of every table 072
// writes, and the functions / triggers its writes fire on national_orders, orders and order_stops), then 071 and
// 071b exactly as executed 22/10. Capture query: F2 plan, Task A1 Step 1. Never edit a fixture by hand.
// The money views stay STUBS (as in plan-071): what 072 proves here are the RULES, the rights and the reversal.
// Known limit (review 23/10): the capture holds only the functions / triggers of its f / trg lists. Production also
// fires, on the fixture's writes: on orders rt_create_from_order, order_leg_depth, order_leg_status_sync,
// orders_group_id_blank_null, orders_invoice_mark_guard and order_parent_to_legs (it returns at once for an order
// without legs, read 23/10), ct_cost_lines.dl_cash_sync_line (CASH only) and the three of national_loads (through
// the soft-delete cascade). No case may depend on them; the optional production run (Task K2 Step 9) is the gate.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');   // 072 executed 2026-10-26: worker/migrations
const readDone = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');   // 071 / 071b: executed 22/10
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

// The live functions 072 guards on (the plan's starting point, 22 functions): the fixture must hold these texts.
const GUARDED = {
  'public.dl_sync_from_rt()': '331cea3a8987b74a9b0add698df9b158',
  'public.dl_local_day_sync(bigint,date)': '151dab06e2676f3c8885d7298d0ac6af',
  'public.dl_sync_from_local_move()': 'f053c478c79ef55dcc62b65a61939b9b',
  'public.local_moves_before()': '3b9f0a27c9921c63ce9fb41f09ef0462',
  'public.dl_local_line_guard()': 'e7f0348ccc5764d29608b8701f0e83b6',
  'public.dl_cash_sync_entry()': '6d702bad6485f06535c6a0d5aff0bd0c',
  'public.order_cd_stop_follow()': '433a1a7205fceb264e77f5a0c71a1521',
  'public.ramp_follows_stop()': '6fa6a83c4191af271dbae85935d710c5',
  'public.invoice_mark_guard()': 'dd975c4f04f95f528c7c79a80eb4d387',
  'public.stock_guard_natl()': 'e941edbca9ff1bbeba0c89d49eb71cb3',
  'public.stock_guard_orders()': '63aa751d93cc8b34afa5587912de7045',
  'public.national_orders_soft_delete_cascade()': '6c423b14397c659272b1c9256189933d',
  'public.rt_status_guard()': 'd7757f99c3443ac167d5bdaf3e34b142',
  'public.plan_chk()': '8f2fa7e5541aded2dffc853a57c54c22',
  'public.plan_rt_window_sync()': '050cbabe34493018f4335f748029761e',
  'public.plan_rt_problem(bigint)': 'f383f449d55e657cfa929bb51a9120f6',
  'public.plan_shipment_problem(bigint)': '8dd2beb159142bf5a6a4e32688688875',
  'public.plan_leg_problem(bigint)': '24803f176f12355faa84c07e43cb0df0',
  'public.plan_local_loading_problem(bigint)': '4c3dbec3810121a2a585fe8b49ceadf1',
  'public.ct_rt_legs_v2_guard()': '6240d699bc114ffd49c7d62780432c94',
  'public.rt_sync_to_orders()': 'a63234c844c2b6236b1e6dfe1410b8fc',
  'public.rt_sync_to_national_loads()': '028efb76373a0a6517134feaea88bc2f',
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
const PLAN_FNS = `SELECT count(*)::int AS n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\\_%'`;
const V5_ROWS = `SELECT ((SELECT count(*) FROM shipments) + (SELECT count(*) FROM shipment_pieces) + (SELECT count(*) FROM rt_stops)
  + (SELECT count(*) FROM piece_legs) + (SELECT count(*) FROM plan_notices)
  + (SELECT count(*) FROM ct_round_trips WHERE model = 2))::int AS n`;

async function prodShaped() {
  const db = await freshDb({ extensions: { btree_gist, pgcrypto } });
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;`);
  // Supabase's default privileges, as production has them (pg_default_acl of postgres on public functions, read
  // 25/10: EXECUTE to anon, authenticated, service_role). Without them PGlite grants a new function to PUBLIC only,
  // and a REVOKE that 072 forgot for anon, authenticated or service_role passed here and failed first on
  // production (K1 review r3 #4). Before every fixture: 071 met the same defaults live.
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`);
  await db.exec(fixture('live-071.sql'));
  await db.exec(fixture('live-072.sql'));
  await db.exec(STUBS);
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  // pgcrypto @extensions as on production (1.3); nothing in 072 needs it (plan_h_legacy_id: the core gen_random_uuid)
  await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  await db.exec(readDone('071_plan_schema.sql'));
  await db.exec(readDone('071b_plan_one_vehicle.sql'));
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
const md5Of = async (db, sig) => (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0]?.m;
const RULES = /RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, (\d+) FAIL/;
// The mutation of Task B9: without the explicit payroll delete, clearing a cycle whose line has an amount leaves
// 011's needs_review behind - case B38 must see it (a test that cannot fail proves nothing).
const MUTANT = (src) => {
  const out = src.replace(/-- mut:payroll-delete-begin[\s\S]*?-- mut:payroll-delete-end/, '-- (mutated: no explicit payroll delete)');
  assert.notStrictEqual(out, src, 'the mutation markers are in 072');
  return out;
};

test('072 on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const triggers = await count(db, TRG);

  await t.test('the fixture holds the live texts 072 guards on (re-capture if this fails)', async () => {
    for (const [sig, m] of Object.entries(GUARDED)) assert.equal(await md5Of(db, sig), m, sig);
    assert.equal(await count(db, PLAN_FNS), 6, 'only the six plan_* of 071 before 072');
  });

  await t.test('072 dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read('072_plan_functions_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 072 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}072 ran: plan functions \d+, public 16, service_role EXECUTE 16, open to API 0, triggers \d+, B-54 \d+, v5 rows 0/, msg);
    const [, trg, b54] = /triggers (\d+), B-54 (\d+)/.exec(msg);
    assert.equal(Number(trg), triggers); assert.equal(Number(b54), triggers);
    assert.equal(await count(db, PLAN_FNS), 6, 'nothing kept');
  });

  await t.test('072 applies: functions only, B-54 unchanged, born closed', async () => {
    assert.equal(await errorOf(db, read('072_plan_functions.sql')), null);
    assert.equal(await count(db, TRG), triggers, 'no trigger');
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), triggers);
    assert.ok(await count(db, PLAN_FNS) > 6 + 16);
  });

  await t.test('072 verify: in place, 16 public, closed, nothing changed, 0 rows', async () => {
    const r = (await db.query(read('072_plan_functions_verify.sql'))).rows[0];
    assert.equal(r.applied, '072 in place');
    assert.equal(r.b54_matches, true);
    for (const k of ['public_functions', 'service_role_execute']) assert.equal(Number(r[k]), 16, k);
    for (const k of ['open_to_api', 'not_definer', 'bad_shape', 'f1_open', 'changed_live', 'v5_rows', 'v5_cycles'])
      assert.equal(Number(r[k]), 0, k);
  });

  await t.test('the API roles: service_role reads the board, cannot reach an internal function; anon nothing', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const b = (await db.query(`SELECT public.plan_board('2026-10-03', 'owner') AS b`)).rows[0].b;
      assert.deepStrictEqual([b.cycles, b.waiting, b.hub, b.notices], [[], [], [], []]);
      await assert.rejects(db.query(`SELECT public.plan_rt_create('{}'::jsonb, 'x', 'owner')`), /permission denied/);
      await assert.rejects(db.query(`SELECT public.plan_h_token('a', 'b', '[]'::jsonb)`), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
    await db.exec('SET ROLE anon');
    try {
      await assert.rejects(db.query(`SELECT public.plan_board('2026-10-03', 'owner')`), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  });

  await t.test('072 rules test: >= 80 OK, 0 FAIL, nothing kept', async (st) => {
    const msg = await errorOf(db, read('072_plan_functions_test.sql'));
    const m = RULES.exec(msg ?? '');
    assert.ok(m, msg);
    st.diagnostic(m[0]);   // the count (203) must be visible on success too: Task S1 greps 'Result:' (assembly 25/10)
    assert.equal(Number(m[2]), 0, msg);
    assert.ok(Number(m[1]) >= 80, `${m[1]} cases`);
    assert.equal(await count(db, V5_ROWS), 0, 'the test keeps nothing');
  });

  await t.test('072 rollback: refuses with a v5 row, then drops every 072 function; 072 applies again', async () => {
    await db.exec(`INSERT INTO plan_notices (to_desk, kind, message, created_by) VALUES ('natl', 'test_notice', 'TEST 072', 'test:072')`);
    assert.match(await errorOf(db, read('072_plan_functions_rollback.sql')) ?? '', /1 v5 row\(s\) exist/);
    await db.exec(`DELETE FROM plan_notices WHERE created_by = 'test:072'`);
    assert.equal(await errorOf(db, read('072_plan_functions_rollback.sql')), null);
    assert.equal(await count(db, PLAN_FNS), 6);
    assert.equal(await count(db, TRG), triggers);
    for (const [sig, m] of Object.entries(GUARDED)) assert.equal(await md5Of(db, sig), m, sig);
    assert.equal(await errorOf(db, read('072_plan_functions.sql')), null, 'reversible: 072 applies again');
    assert.equal((await db.query(read('072_plan_functions_verify.sql'))).rows[0].applied, '072 in place');
  });
});

test('072 born closed under Supabase\'s default grants: a REVOKE it forgets refuses the whole block', async (t) => {
  // K1 review r3 #4: each mutant drops ONE role from 072's REVOKE; the default privileges above keep that role's
  // EXECUTE on every plan_h_*, and PART 5's proof must refuse the block (nothing kept)
  const REVOKE = "FROM PUBLIC, anon, authenticated, service_role', v_f.sig);";
  for (const [drop, want] of [
    ['service_role', /072 proof: service_role executes \d+ plan_\* function\(s\), expected exactly the 16 public ones/],
    ['anon', /072 proof: \d+ plan_\* function\(s\) executable by anon \/ authenticated/],
    ['authenticated', /072 proof: \d+ plan_\* function\(s\) executable by anon \/ authenticated/]]) {
    const db = await prodShaped();
    const src = read('072_plan_functions.sql');
    assert.equal(src.split(REVOKE).length, 2, 'the REVOKE line is in 072 once');
    const mutant = src.replace(REVOKE, REVOKE.replace(drop === 'service_role' ? ', service_role' : `, ${drop}`, ''));
    assert.notStrictEqual(mutant, src);
    const msg = await errorOf(db, mutant);
    assert.match(msg ?? 'applied', want, `without ${drop} in the REVOKE`);
    assert.equal(await count(db, PLAN_FNS), 6, 'nothing kept');
    t.diagnostic(`without ${drop}: ${msg}`);
  }
});

test('072 mutation: without the explicit payroll delete, case B38 fails', async (t) => {
  const db = await prodShaped();
  assert.equal(await errorOf(db, MUTANT(read('072_plan_functions.sql'))), null);
  const msg = await errorOf(db, read('072_plan_functions_test.sql'));
  assert.match(msg ?? '', /B38 FAIL want ok got FAIL clear with amount: needs_review 1/, msg);
  // exactly B38: a mutation that also breaks other cases would hide which rule the delete protects
  const m = RULES.exec(msg ?? '');
  assert.ok(m, msg);
  assert.equal(Number(m[2]), 1, msg);
  t.diagnostic(`mutation: ${m[0]}`);
});
