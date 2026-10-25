// tests/sql-072-drafts.test.js - run: node --test tests/sql-072-drafts.test.js
// The 072 drafts (national v5 plan_* functions, F2) at build time, plain node, no database (principle 6: a stale
// fingerprint, a function born open or a refusal nobody tests should fail here, not at 15:30 on the owner's evening):
//   - the five files and the dry-run builder are there; ASCII only (clipboard has mangled Greek before);
//   - the writing files are ONE DO block; verify writes nothing; the dry run is regenerated, never hand-edited;
//   - the live functions 072 relies on are guarded AND proved by the same md5 list (the plan's 22 functions);
//   - 072 creates functions only: no table, column, view, index, trigger (B-54 stays), no CREATE OR REPLACE;
//   - born closed: one REVOKE loop over every plan_*, one GRANT to service_role over the 16 public signatures;
//   - every public writer checks the caller and ends with plan_h_finish; nothing public returns void;
//   - every plan: code 072 raises has a case in the rules test, which has >= 80 cases; no retired code anywhere;
//   - no mirror: national_orders.truck_id / partner_id / status are never written;
//   - every Greek text is base64 that decodes, and every notice template takes as many %s as it is given;
//   - every warning code and notice kind 072 writes is in the plan's registry (Interfaces), so F4 finds no surprise.
// The rules themselves are proven by 072_plan_functions_test.sql on PGlite (tms-auditor/test/plan-072.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // until the owner runs 072 (then: worker/migrations)
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['072_plan_functions.sql', '072_plan_functions_dryrun.sql', '072_plan_functions_test.sql',
  '072_plan_functions_rollback.sql'];
const READ_ONLY = ['072_plan_functions_verify.sql'];
const PUBLIC = [
  ['plan_orders_create', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_order_update', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_put_pieces', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_put_group', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_move_pieces', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_split_piece', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_rt_update', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_rt_clear', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_delete', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_vs_set_day', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_vs_set_place', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_local_loading', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_notice_read', 'p jsonb, p_actor text, p_role text', 'jsonb,text,text'],
  ['plan_board', 'p_week date, p_role text', 'date,text'],
  ['plan_vs_state', 'p_order_ids bigint[]', 'bigint[]'],
  ['plan_notices_list', 'p_desk text, p_role text', 'text,text'],
];
const WRITERS = PUBLIC.filter((x) => x[2] === 'jsonb,text,text').map((x) => x[0]);
// The live functions 072 relies on (the plan's starting point: 22/10 23:10, again 23/10 and 24/10).
const GUARDED = [
  ['public.dl_sync_from_rt()', '331cea3a8987b74a9b0add698df9b158'],
  ['public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af'],
  ['public.dl_sync_from_local_move()', 'f053c478c79ef55dcc62b65a61939b9b'],
  ['public.local_moves_before()', '3b9f0a27c9921c63ce9fb41f09ef0462'],
  ['public.dl_local_line_guard()', 'e7f0348ccc5764d29608b8701f0e83b6'],
  ['public.dl_cash_sync_entry()', '6d702bad6485f06535c6a0d5aff0bd0c'],
  ['public.order_cd_stop_follow()', '433a1a7205fceb264e77f5a0c71a1521'],
  ['public.ramp_follows_stop()', '6fa6a83c4191af271dbae85935d710c5'],
  ['public.invoice_mark_guard()', 'dd975c4f04f95f528c7c79a80eb4d387'],
  ['public.stock_guard_natl()', 'e941edbca9ff1bbeba0c89d49eb71cb3'],
  ['public.stock_guard_orders()', '63aa751d93cc8b34afa5587912de7045'],
  ['public.national_orders_soft_delete_cascade()', '6c423b14397c659272b1c9256189933d'],
  ['public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'],
  ['public.plan_chk()', '8f2fa7e5541aded2dffc853a57c54c22'],
  ['public.plan_rt_window_sync()', '050cbabe34493018f4335f748029761e'],
  ['public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'],
  ['public.plan_shipment_problem(bigint)', '8dd2beb159142bf5a6a4e32688688875'],
  ['public.plan_leg_problem(bigint)', '24803f176f12355faa84c07e43cb0df0'],
  ['public.plan_local_loading_problem(bigint)', '4c3dbec3810121a2a585fe8b49ceadf1'],
  ['public.ct_rt_legs_v2_guard()', '6240d699bc114ffd49c7d62780432c94'],
  ['public.rt_sync_to_orders()', 'a63234c844c2b6236b1e6dfe1410b8fc'],
  ['public.rt_sync_to_national_loads()', '028efb76373a0a6517134feaea88bc2f'],
];
const RETIRED = ['hub_endpoint', 'piece_planned', 'bridge_moved', 'bridge_split', 'legacy_nl', 'frozen', 'restore_expired',
  'restore_conflict', 'partner_rate_on_owned', 'window_order'];

// The body of `CREATE FUNCTION public.<name>(` up to its closing `$f$;`.
function body(src, name) {
  const a = src.indexOf(`CREATE FUNCTION public.${name}(`);
  assert.ok(a >= 0, `${name} is not created by 072`);
  const b = src.indexOf('\n$f$;', a);
  assert.ok(b > a, `${name}: no closing $f$;`);
  return src.slice(a, b);
}
// The entries of `<name> [CONSTANT] text[] := ARRAY[ ... ];` or `:= array_remove(ARRAY[ ... ]::text[], NULL);` (v_pub).
function arrayItems(src, name) {
  const m = new RegExp(`\\b${name}(?: CONSTANT)? text\\[\\] := (?:array_remove\\()?ARRAY\\[([\\s\\S]*?)\\](?:::text\\[\\], NULL\\))?;`).exec(src);
  assert.ok(m, `${name} not found`);
  return [...strip(m[1]).matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]);
}

test('the five 072 files and the dry-run builder are there', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^072_plan_functions/.test(f));
  assert.deepStrictEqual(files.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
  assert.ok(fs.existsSync(path.join(DIR, 'tools/build-072-dryrun.mjs')));
});

test('ASCII only: every 072 file and the builder', () => {
  for (const f of DO_FILES.concat(READ_ONLY, ['tools/build-072-dryrun.mjs'])) {
    const bad = [...read(f)].filter((c) => c.charCodeAt(0) > 127);
    assert.deepStrictEqual(bad, [], f);
  }
});

test('each writing file is ONE DO block; verify writes nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    const sql = strip(read(f)).replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/i, f);
    assert.doesNotMatch(sql, /^DO \$/m, f);
  }
});

test('the dry run is regenerated from 072 (node worker/migrations/drafts/tools/build-072-dryrun.mjs)', async () => {
  const { PAIR, buildDryRun } = await import(path.join(DIR, 'tools/build-072-dryrun.mjs'));
  assert.strictEqual(read(PAIR.target), buildDryRun(read(PAIR.source)), PAIR.target + ' drifted');
});

test('the live functions 072 relies on: guarded at the top AND proved at the end by the same md5 list', () => {
  const src = read('072_plan_functions.sql');
  for (const [sig, m] of GUARDED) {
    const n = src.split(`('${sig}', '${m}')`).length - 1;
    assert.ok(n >= 2, `${sig} ${m}: in the guard and in the proof (found ${n})`);
  }
  const verify = read('072_plan_functions_verify.sql');
  for (const [sig, m] of GUARDED) assert.ok(verify.includes(`('${sig}', '${m}')`), `verify reads ${sig}`);
  const pairs = [...src.matchAll(/\('public\.[a-z_0-9]+\([a-z,\[\]]*\)', '[0-9a-f]{32}'\)/g)].map((x) => x[0]);
  for (const p of pairs) assert.ok(GUARDED.some(([s, m]) => p === `('${s}', '${m}')`), `unknown guard ${p}`);
});

test('072 creates functions only: B-54 stays, nothing existing is rewritten', () => {
  const src = strip(read('072_plan_functions.sql'));
  assert.doesNotMatch(src, /\bCREATE\s+(OR\s+REPLACE\s+)?(TABLE|VIEW|TRIGGER|CONSTRAINT\s+TRIGGER|INDEX|UNIQUE\s+INDEX|EXTENSION|POLICY)\b/i);
  assert.doesNotMatch(src, /\bALTER\s+(TABLE|FUNCTION|VIEW)\b/i);
  assert.doesNotMatch(src, /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i, 'never CREATE OR REPLACE: an existing function stays untouched');
  assert.doesNotMatch(src, /UPDATE\s+monitoring\.checks/i, 'no trigger added, B-54 not bumped');
  for (const m of src.matchAll(/\bCREATE FUNCTION public\.([a-z_0-9]+)\(/g)) {
    assert.match(m[1], /^plan_/, `072 creates only plan_* functions (${m[1]})`);
  }
  const rb = strip(read('072_plan_functions_rollback.sql'));
  assert.match(rb, /EXECUTE format\('DROP FUNCTION %s', v_f\.sig\)/);
  assert.doesNotMatch(rb, /\bDROP\s+(TABLE|VIEW|TRIGGER|INDEX)\b/i);
  assert.match(rb, /v5 row\(s\) exist/, 'the rollback refuses after the first v5 row');
});

test('born closed: one REVOKE over every plan_*, EXECUTE to service_role on the 16 public signatures only', () => {
  const src = strip(read('072_plan_functions.sql'));
  assert.match(src, /EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f\.sig\)/);
  const grants = src.match(/\bGRANT\b/g) || [];
  assert.strictEqual(grants.length, 1, 'exactly one GRANT, inside the v_pub loop');
  assert.match(src, /EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig\)/);
  const pub = arrayItems(read('072_plan_functions.sql'), 'v_pub');
  assert.deepStrictEqual(pub.slice().sort(), PUBLIC.map(([n, , t]) => `public.${n}(${t})`).sort());
  const verify = read('072_plan_functions_verify.sql');
  for (const s of pub) assert.ok(verify.includes(`'${s}'`), `verify lists ${s}`);
  assert.doesNotMatch(src, /GRANT[^;]*\b(anon|authenticated|PUBLIC)\b/i);
});

test('the public functions: exact signatures, jsonb, SECURITY DEFINER; the writers check the caller and finish', () => {
  const src = read('072_plan_functions.sql');
  for (const [name, args] of PUBLIC) {
    const b = body(src, name);
    assert.ok(b.startsWith(`CREATE FUNCTION public.${name}(${args})`), `${name}(${args})`);
    assert.match(b.split('$f$')[0], /RETURNS jsonb\b/, `${name} returns jsonb, never void`);
    assert.match(b.split('$f$')[0], /SECURITY DEFINER SET search_path = public/, `${name}: definer, search_path`);
  }
  for (const name of WRITERS) {
    const b = body(src, name);
    // plan_h_ctx also sets the 071 rules DEFERRED for the call (section A)
    assert.match(b, /perform plan_h_ctx\(p_actor, p_role\);/, `${name} checks actor and role`);
    assert.match(b, /perform plan_h_keys\(p, array\[/, `${name} refuses unknown keys (principle 1)`);
    assert.match(b, /perform plan_h_finish\(\);/, `${name} checks the deferred rules inside itself`);
  }
  for (const name of ['plan_board', 'plan_vs_state', 'plan_notices_list']) {
    assert.match(body(src, name).split('$f$')[0], /\bSTABLE\b/, `${name} is a read`);
  }
  const rc = body(src, 'plan_rt_create');
  assert.ok(rc.startsWith('CREATE FUNCTION public.plan_rt_create(p jsonb, p_actor text, p_role text)'));
  assert.ok(!arrayItems(src, 'v_pub').some((s) => s.includes('plan_rt_create')), 'plan_rt_create is internal (decision 3)');
});

test('every plan: code 072 raises has a case; >= 80 cases; no retired code', () => {
  const src = read('072_plan_functions.sql');
  const testSql = read('072_plan_functions_test.sql');
  const codes = new Set([...strip(src).matchAll(/plan_h_raise\('([a-z_0-9]+)'/g)].map((m) => m[1]));
  assert.ok(codes.size >= 20, `found ${codes.size} codes`);
  for (const c of codes) assert.ok(testSql.includes(`'plan:${c}'`), `plan:${c} has no case in 072_plan_functions_test.sql`);
  // section A's cases: want ARRAY[...]; section B's: b_want, one ARRAY[...] per task, up to '-- end of b_want'
  const bWant = /\bb_want text\[\] := ([\s\S]*?);  -- end of b_want/.exec(testSql);
  assert.ok(bWant, 'b_want not found');
  const nB = [...strip(bWant[1]).matchAll(/'((?:[^']|'')*)'/g)].length;
  const n = arrayItems(testSql, 'want').length + nB;
  assert.ok(nB >= 77, `section B has ${nB} cases`);
  assert.ok(n >= 80, `${n} cases, at least 80`);
  for (const r of RETIRED) {
    assert.ok(!strip(src).includes(r), `072 must not know ${r}`);
    assert.ok(!strip(testSql).includes(`plan:${r}`), `the test must not expect ${r}`);
  }
  assert.strictEqual((src.match(/-- mut:payroll-delete-begin/g) || []).length, 1, 'mutation marker begin, once');
  assert.strictEqual((src.match(/-- mut:payroll-delete-end/g) || []).length, 1, 'mutation marker end, once');
});

test('no mirror: national_orders.truck_id / partner_id / status are never written (spec 2.1)', () => {
  const src = strip(read('072_plan_functions.sql'));
  for (const m of src.matchAll(/UPDATE\s+(?:public\.)?national_orders\s+SET\s+([\s\S]*?)\bwhere\b/gi)) {
    assert.doesNotMatch(m[1], /\b(truck_id|partner_id|status)\s*=/i, 'UPDATE national_orders SET ' + m[1]);
  }
  for (const m of src.matchAll(/INSERT\s+INTO\s+(?:public\.)?national_orders\s*\(([^)]*)\)/gi)) {
    assert.doesNotMatch(m[1], /\b(truck_id|partner_id|status)\b/i, 'INSERT INTO national_orders (' + m[1] + ')');
  }
});

test('Greek is base64 that decodes; every notice template takes the %s it is given', () => {
  const src = read('072_plan_functions.sql');
  const b64 = [...src.matchAll(/'([A-Za-z0-9+/]{16,}={0,2})'/g)].map((m) => m[1])
    .filter((s) => !/^[0-9a-f]{32}$/.test(s) && /[\u0370-\u03ff]/.test(Buffer.from(s, 'base64').toString('utf8')));
  assert.ok(b64.length >= 4, `found ${b64.length} Greek base64 texts`);
  for (const s of b64) {
    const txt = Buffer.from(s, 'base64').toString('utf8');
    assert.strictEqual(Buffer.from(txt, 'utf8').toString('base64'), s, 'round trip ' + s);
    assert.match(txt, /[Ͱ-Ͽ]/, 'Greek in ' + txt);
  }
  // b_costs (2 args) and b_place (3 args) of part 3
  const tpl = (name) => Buffer.from(new RegExp(`\\b${name} constant text := '([^']+)'`).exec(src)[1], 'base64').toString('utf8');
  assert.strictEqual((tpl('b_costs').match(/%s/g) || []).length, 2);
  assert.strictEqual((tpl('b_place').match(/%s/g) || []).length, 3);
});

test('every warning code and notice kind 072 writes is in the plan\'s registry (Interfaces)', () => {
  const src = strip(read('072_plan_functions.sql'));
  const WARNINGS = ['local_payroll_review', 'mixed_temp', 'over_33', 'v1_same_truck', 'vs_day_differs'];
  const KINDS = ['costs_without_rt', 'vs_day_changed', 'vs_place_changed'];
  const warn = [...new Set([...src.matchAll(/jsonb_build_object\('code', '([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepStrictEqual(warn, WARNINGS, 'warnings[] codes');
  const kinds = [...new Set([...src.matchAll(/plan_h_notice\('(?:intl|natl)', '([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepStrictEqual(kinds, KINDS, 'plan_notices kinds');
});
