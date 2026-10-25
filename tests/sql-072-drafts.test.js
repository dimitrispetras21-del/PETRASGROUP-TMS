// tests/sql-072-drafts.test.js - run: node --test tests/sql-072-drafts.test.js
// The 072 drafts (national v5 plan_* functions, F2) at build time, plain node, no database (principle 6: a stale
// guard, an open function or an untested refusal should fail here, not at 15:30 on the owner's evening):
//   - ASCII only (the owner pastes from a clipboard that has mangled Greek before); ONE DO block per file;
//   - the md5 guards are exactly the plan's starting point (22 live functions), guarded at the top AND re-proved in
//     PART 5, in one shape ('<sig>', '<md5>');
//   - born closed: every non-helper plan_* is SECURITY DEFINER SET search_path = public and returns jsonb; every
//     public writer of v_pub takes (p, p_actor, p_role), starts with plan_h_ctx and calls plan_h_finish; every
//     plan_h_* helper is SECURITY INVOKER; EXECUTE goes to service_role on exactly the v_pub list; no other GRANT;
// BOOTSTRAP of Task A1: Task B9 replaces this file with the full build test, which holds every check below.
//   - 072 adds no table, column, trigger, and replaces or drops no existing function;
//   - never a mirror (national_orders truck_id / partner_id / status), never RETURNS void, no retired code;
//   - every plan: code 072 raises has a case in 072_plan_functions_test.sql.
// The rules themselves are proven by 072_plan_functions_test.sql on PGlite (tms-auditor/test/plan-072.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['072_plan_functions.sql', '072_plan_functions_test.sql'];
// The plan's starting point (measured 22/10/2026, again 23/10 and 24/10, SELECT only): signature -> md5 of the live prosrc.
const LIVE = {
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
const RETIRED = ['hub_endpoint', 'piece_planned', 'bridge_moved', 'bridge_split', 'legacy_nl', 'frozen',
  'restore_expired', 'restore_conflict', 'partner_rate_on_owned', 'window_order'];

// Every "CREATE FUNCTION public.<name>(<args>) RETURNS <head> AS $f$ <body> $f$;" of 072.
function functions(src) {
  return [...src.matchAll(/CREATE FUNCTION public\.([a-z_0-9]+)\(([^)]*)\)\s+RETURNS ([\s\S]*?) AS \$f\$([\s\S]*?)\$f\$;/g)]
    .map((m) => ({ name: m[1], args: m[2].replace(/\s+/g, ' ').trim(), head: m[3].replace(/\s+/g, ' ').trim(), body: m[4] }));
}
// the writers of v_pub: the (jsonb,text,text) lines (the reads of Task B7 have other signatures)
function pubList(src) {
  const m = src.match(/v_pub CONSTANT text\[\] := array_remove\(ARRAY\[([\s\S]*?)\]::text\[\], NULL\);/);
  assert.ok(m, 'v_pub not found');
  return [...strip(m[1]).matchAll(/'public\.([a-z_0-9]+)\(jsonb,text,text\)'/g)].map((x) => x[1]);
}

test('the 072 files are there, ASCII only, ONE DO block each', () => {
  for (const f of DO_FILES) {
    const s = read(f);
    assert.deepStrictEqual([...s].filter((c) => c.charCodeAt(0) > 127), [], f + ' is not ASCII');
    assert.strictEqual((s.match(/^DO \$/gm) || []).length, 1, f);
  }
});

test('the md5 guards are exactly the plan\'s starting point, guarded at the top and re-proved in PART 5', () => {
  const src = read('072_plan_functions.sql');
  const pairs = [...src.matchAll(/\('(public\.[a-z_0-9]+\([a-z,\[\]]*\))', '([0-9a-f]{32})'\)/g)];
  assert.deepStrictEqual(Object.fromEntries(pairs.map((x) => [x[1], x[2]])), LIVE);
  for (const [sig, m] of Object.entries(LIVE)) {
    assert.strictEqual(src.split(`('${sig}', '${m}')`).length - 1, 2, `${sig}: once in the guard, once in the proof`);
  }
  assert.match(src, /is not the live text read 22\/10/);
  assert.match(src, /072 proof: % live function\(s\) changed/);
});

test('born closed: definer publics with ctx and finish, invoker helpers, EXECUTE only on v_pub', () => {
  const src = read('072_plan_functions.sql');
  const fns = functions(src);
  assert.ok(fns.length >= 20, `found ${fns.length} functions`);
  const pub = pubList(src);
  for (const f of fns) {
    assert.ok(f.name.startsWith('plan_'), `${f.name}: every 072 function is plan_*`);
    assert.match(f.head, /SET search_path = public$/, `${f.name}: SET search_path = public`);
    if (f.name.startsWith('plan_h_')) {
      assert.doesNotMatch(f.head, /SECURITY DEFINER/, `${f.name}: helpers are invoker`);
      continue;
    }
    // RETURNS jsonb, never void: the Worker's dbRpc reads the answer as JSON (a void would be a 500 after a write)
    assert.match(f.head, /^jsonb LANGUAGE (plpgsql|sql)( STABLE)? SECURITY DEFINER SET search_path = public$/, `${f.name}: jsonb, DEFINER`);
    if (!pub.includes(f.name)) continue;   // plan_rt_create (internal, decision 3) and the reads of Task B7
    assert.strictEqual(f.args, 'p jsonb, p_actor text, p_role text', `${f.name}: one shape (decision 2)`);
    assert.match(f.body, /\nbegin\n(\s*--[^\n]*\n)*\s*perform plan_h_ctx\(p_actor, p_role\);/, `${f.name}: plan_h_ctx first`);
    assert.match(f.body, /perform plan_h_finish\(\);/, `${f.name}: plan_h_finish inside the function`);
  }
  const writers = fns.filter((f) => !f.name.startsWith('plan_h_') && f.name !== 'plan_rt_create'
    && f.args === 'p jsonb, p_actor text, p_role text').map((f) => f.name);
  assert.deepStrictEqual(pub.slice().sort(), writers.sort(), 'v_pub = every public writer (plan_rt_create is internal)');
  const s = strip(src);
  assert.match(s, /EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f\.sig\);/);
  assert.match(s, /EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig\);/);
  assert.strictEqual((s.match(/\bGRANT\b/g) || []).length, 1, 'one GRANT: EXECUTE to service_role on v_pub');
});

test('072 adds no table, column or trigger, and replaces or drops no existing function', () => {
  const s = strip(read('072_plan_functions.sql'));
  assert.doesNotMatch(s, /\b(CREATE|create) (OR REPLACE |or replace )?(TABLE|VIEW|TRIGGER|CONSTRAINT TRIGGER|table|view|trigger)\b/);
  assert.doesNotMatch(s, /\b(ALTER TABLE|alter table|DROP (FUNCTION|TABLE|VIEW|TRIGGER|INDEX)|drop (function|table|view|trigger|index)|CREATE OR REPLACE FUNCTION|create or replace function)\b/);
  assert.match(s, /IF v_trg1 <> v_trg0 THEN/);
  assert.doesNotMatch(s, /UPDATE monitoring\.checks/, 'B-54 stays');
});

test('never a mirror, never a retired code', () => {
  const s = strip(read('072_plan_functions.sql'));
  for (const m of s.matchAll(/insert into national_orders \(([^)]*)\)/gi))
    assert.doesNotMatch(m[1], /\b(truck_id|partner_id|status|direction|type)\b/, 'INSERT national_orders');
  for (const m of s.matchAll(/update national_orders set([\s\S]*?)where /gi))
    assert.doesNotMatch(m[1], /\b(truck_id|partner_id|status)\s*=/, 'UPDATE national_orders');
  for (const c of RETIRED) assert.ok(!s.includes(c), `retired code ${c} is back`);
});

test('every plan: code 072 raises has a case in the rules test', () => {
  const s = strip(read('072_plan_functions.sql'));
  const codes = new Set([...s.matchAll(/plan_h_raise\('([a-z0-9_]+)'/g)].map((m) => m[1]));
  for (const m of s.matchAll(/then '([a-z0-9_]+)' else '([a-z0-9_]+)' end,\s*coalesce\(v_det/g)) { codes.add(m[1]); codes.add(m[2]); }
  assert.ok(codes.has('truck_busy') && codes.has('driver_busy'), 'plan_h_finish maps 23P01 by constraint name');
  const t = read('072_plan_functions_test.sql');
  for (const c of codes) assert.ok(t.includes(`'plan:${c}'`), `plan:${c} has no case in 072_plan_functions_test.sql`);
});
