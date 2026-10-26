// tests/sql-073-drafts.test.js - run: node --test tests/sql-073-drafts.test.js
// The 073 drafts (national v5 money, route, pallets, F3) at build time, plain node, no database (principle 6):
//   - the six files and the dry-run builder are there; ASCII only (clipboard has mangled Greek before);
//   - the writing files are ONE DO block; verify and fingerprint write nothing; the dry run is regenerated;
//   - the live views and functions 073 replaces are guarded by md5 BEFORE, and their new texts proved AFTER, with
//     the same lists in 073, verify and rollback (one list per fact, principle 3);
//   - 073 adds no table, column or trigger (B-54 stays); every new object is born closed;
//   - every view that has security_invoker today is rewritten WITH it (CREATE OR REPLACE VIEW drops it otherwise:
//     measured on PGlite 17, 23/10);
//   - every plan: code 073 raises has a case in the rules test; every consequence kind it adds is in the registry;
//   - the cross-cutting input rule (coordinator 25/10): NaN / +-Infinity pallets and an infinite day are refused by
//     name (bad_input) before the pallet feeder writes;
//   - D-9 NARROW (owner 25/10): the one index 073 adds is unique only for LOADING / DELIVERY;
//   - the money choices M-1..M-3 are marked with the owner's answer (M-1 gamma, M-2 alpha, M-3 beta, 24/10), so a
//     review finds them.
//   - 073b (Task 6) is the one generated from the check files (B-78..B-90 + B-94 of F3, B-91..B-93 of 072b), ASCII, born
//     closed, B-80 disabled (M-5 delta), and 073's rollback refuses on exactly its F3 checks.
// The rules are proven by 073_plan_money_test.sql on PGlite (tms-auditor/test/plan-073.test.mjs), 073b by
// tms-auditor/test/plan-073b.test.mjs.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // until the owner runs 073 (then: worker/migrations)
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['073_plan_money.sql', '073_plan_money_dryrun.sql', '073_plan_money_test.sql', '073_plan_money_rollback.sql'];
const READ_ONLY = ['073_plan_money_verify.sql', '073_plan_money_fingerprint.sql'];
// The registry of consequence kinds the board (F4) knows: F2's eight + 073's one.
const KINDS = ['invoiced', 'costs', 'payroll_amount', 'local_loading', 'local_payroll', 'rt_cancelled', 'executed_leg',
  'later_leg', 'pallets_confirmed'];

test('073: every file is there and ASCII only', () => {
  for (const f of [...DO_FILES, ...READ_ONLY, 'tools/build-073-dryrun.mjs']) {
    assert.ok(fs.existsSync(path.join(DIR, f)), f);
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
});

test('073: one DO block per writing file; verify and fingerprint only read', () => {
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    const s = strip(read(f));
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(s.replace(/updated_at|deleted_at|created_at/g, '')), f);
  }
});

test('073: the dry run is the generated one', () => {
  execFileSync(process.execPath, [path.join(DIR, 'tools/build-073-dryrun.mjs'), '--check']);
});

test('073: one md5 list per fact - guards, proofs, verify and rollback agree', () => {
  const src = read('073_plan_money.sql');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const part5 = src.slice(src.indexOf('===== PART 5'));
  const pairs = (s) => [...s.matchAll(/\('(public\.[a-z0-9_]+(?:\([^)]*\))?)',\s*'([0-9a-f]{32})'\)/g)].map((m) => `${m[1]}=${m[2]}`);
  const before = pairs(part0);
  const hooks = [...src.matchAll(/\('(public\.[a-z_]+\([^)]*\))',\n\s+E'[\s\S]*?,\n\s+E'[\s\S]*?,\n\s+'([0-9a-f]{32})'\)/g)].map((m) => `${m[1]}=${m[2]}`);
  const after = pairs(part5).concat(hooks);
  assert.strictEqual(before.length, 22, 'PART 0 guards 12 views + 10 functions');
  assert.strictEqual(hooks.length, 5, 'five hooks in 072');
  const verify = pairs(read('073_plan_money_verify.sql'));
  assert.deepStrictEqual(verify.sort(), after.sort(), 'verify checks exactly the texts 073 proves');
  const rb = read('073_plan_money_rollback.sql');
  for (const p of before.filter((x) => /ct_v_rt_|dl_v_rt_route|stock_v_pieces/.test(x) && !/stock_v_rt_amounts|wear/.test(x))) {
    assert.ok(rb.includes(`'${p.split('=')[0]}', '${p.split('=')[1]}'`), `rollback proves ${p}`);
  }
  for (const h of hooks) assert.ok(rb.includes(h.split('=')[1]), `rollback reads the 073 text of ${h}`);
});

test('073: no table, one column (Q6-1), no trigger; born closed; security_invoker kept', () => {
  const s = strip(read('073_plan_money.sql'));
  assert.ok(!/create\s+(table|trigger)|create\s+constraint\s+trigger/i.test(s));
  // Q6-1 (owner 26/10): the ONE schema change - a partner invoice line names its partner; nothing else is altered
  assert.deepStrictEqual([...s.matchAll(/alter\s+table[^;]*;/gi)].map((m) => m[0]),
    ['ALTER TABLE public.ct_cost_lines ADD COLUMN partner_id bigint REFERENCES public.partners (id) ON DELETE RESTRICT;']);
  assert.match(strip(read('073_plan_money_rollback.sql')), /DROP VIEW public\.ct_v_rt_partner_cost;\s+ALTER TABLE public\.ct_cost_lines DROP COLUMN partner_id;/);
  assert.match(s, /REVOKE ALL ON FUNCTION public\.plan_h_pallet_sync\(bigint\[\],text,text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(s, /REVOKE ALL ON public\.ct_v_v5_revenue, public\.ct_v_rt_partner_cost FROM PUBLIC, anon, authenticated, service_role, tms_reader;/);
  assert.match(s, /GRANT SELECT ON public\.ct_v_v5_revenue, public\.ct_v_rt_partner_cost TO service_role, tms_check_runner;/);
  for (const v of ['dl_v_rt_route', 'ct_v_rt_pallet_gate']) {
    assert.match(s, new RegExp(`CREATE OR REPLACE VIEW public\\.${v} WITH \\(security_invoker = true\\) AS`), v);
    assert.match(strip(read('073_plan_money_rollback.sql')), new RegExp(`CREATE OR REPLACE VIEW public\\.${v} WITH \\(security_invoker = true\\) AS`), `rollback ${v}`);
  }
  // one list: exactly these two are invoker, in 073 and in its rollback (a third would need the same proof)
  const invoker = (x) => [...x.matchAll(/VIEW public\.([a-z0-9_]+) WITH \(security_invoker = true\)/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(invoker(s), ['ct_v_rt_pallet_gate', 'dl_v_rt_route']);
  assert.deepStrictEqual(invoker(strip(read('073_plan_money_rollback.sql'))), ['ct_v_rt_pallet_gate', 'dl_v_rt_route']);
  // D-9 NARROW (owner 25/10): the only index, unique for the two events the feeders write, reversed rows not counted
  assert.deepStrictEqual([...s.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z0-9_]+)/gi)].map((m) => m[1]), ['pl_mov_stop_once']);
  assert.match(s, /CREATE UNIQUE INDEX pl_mov_stop_once ON public\.pl_movements \(order_stop_id, event_type\)\s+WHERE order_stop_id IS NOT NULL AND status <> 'reversed' AND event_type IN \('LOADING', 'DELIVERY'\);/);
  // the helper runs as its caller (072 PART 5: every plan_h_* is invoker)
  const fn = s.slice(s.indexOf('CREATE FUNCTION public.plan_h_pallet_sync'), s.indexOf('$f$;', s.indexOf('CREATE FUNCTION public.plan_h_pallet_sync')));
  assert.ok(!/security\s+definer/i.test(fn) && /SET search_path = public/.test(fn));
});

test('073: every code has a case, every consequence kind is registered, the money choices are marked', () => {
  const src = read('073_plan_money.sql');
  const codes = [...new Set([...src.matchAll(/plan_h_raise\('([a-z_]+)'/g)].map((m) => m[1]))];
  // bad_input is 072's code (plan_h_raise is shared), raised here by the cross-cutting input rule
  assert.deepStrictEqual(codes.sort(), ['bad_input', 'pallet_fraction']);
  const t = read('073_plan_money_test.sql');
  // a case either expects the code (want) or checks it in its verdict (cases 35-36: the rows stay unchanged too)
  for (const c of codes) assert.match(t, new RegExp(`, 'plan:${c}'|LIKE 'plan:${c} `), c);
  // the input rule itself: NaN and +-Infinity fail abs(x) < 'Infinity'; an endless day fails isfinite
  assert.match(strip(src), /not \(abs\(w\.pallets\) < 'Infinity'::numeric\) then\s+perform plan_h_raise\('bad_input'/);
  assert.match(strip(src), /not \(isfinite\(w\.pick_day\) and isfinite\(w\.drop_day\)\) then\s+perform plan_h_raise\('bad_input'/);
  const kinds = [...src.matchAll(/'kind'', ''([a-z_]+)''/g)].map((m) => m[1]);
  assert.ok(kinds.length > 0, 'no consequence kind found: the pattern no longer matches the source');
  for (const k of kinds) assert.ok(KINDS.includes(k), `consequence kind ${k} not in the registry`);
  for (const m of ['[M-1 WHICH CYCLE] (gamma, owner 24/10)', '[M-2 THE INTERNATIONAL\'S X] (alpha, owner 24/10)',
    '[M-3 ROUNDING] (beta, owner 24/10)']) assert.ok(src.includes(m), m);
  assert.ok((t.match(/^ {4}, '(ok|plan:[a-z_]+|con:[a-z_]+)'/gm) || []).length >= 36, 'the 36 cases of Task 3');
});

test('073: no mirror and no write outside the plan', () => {
  const s = strip(read('073_plan_money.sql')).toLowerCase();
  assert.ok(!/update\s+national_orders/.test(s), 'national_orders is never written (spec 2.1)');
  assert.ok(!/update\s+ct_round_trips/.test(s));
  assert.ok(!/delete\s+from\s+pl_movements/.test(s), 'a pallet row is withdrawn (reversed), never deleted (D-7)');
});

// 073b (F3 Task 6): generated from the check files, so this only proves it is the generated one and holds what the
// plan says. Its ids come from the builder (one list; never typed twice here, principle 3).
const B073 = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
  `import(${JSON.stringify(path.join(DIR, 'tools/build-073b.mjs'))}).then((m) => console.log(JSON.stringify({ f3: m.F3_IDS, all: m.IDS, files: m.FILES })))`],
  { encoding: 'utf8' }));
test('073b is the generated one, ASCII, one DO block each, and holds exactly the check files of F3 and 072b', () => {
  execFileSync(process.execPath, [path.join(DIR, 'tools/build-073b.mjs'), '--check']);
  assert.deepStrictEqual(B073.files, ['073b_plan_monitoring.sql', '073b_plan_monitoring_dryrun.sql', '073b_plan_monitoring_rollback.sql']);
  for (const f of B073.files) {
    assert.ok(!/[^\x00-\x7f]/.test(read(f)), `${f}: non-ASCII`);
    assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, `${f}: one DO block`);
  }
  // the 13 of spec 8 that do not need day L (M-6 alpha keeps B-90) + B-94 (final round 2: Q6-1's unmatched partner
  // invoice) + 072b's 3 (handover P3-6), each md5-proven
  assert.deepStrictEqual(B073.f3, ['B-78', 'B-79', 'B-80', 'B-81', 'B-82', 'B-83', 'B-84', 'B-85', 'B-86', 'B-87', 'B-88', 'B-89', 'B-90', 'B-94']);
  assert.deepStrictEqual(B073.all, [...B073.f3, 'B-91', 'B-92', 'B-93']);
  const proof = [...read('073b_plan_monitoring.sql').matchAll(/\('(B-\d+)', '[0-9a-f]{32}', '[0-9a-f]{32}', (true|false)\)/g)];
  assert.deepStrictEqual(proof.map((m) => m[1]), B073.all);
  // M-5 delta (owner 24/10): B-80 goes to production DISABLED, and it is the only one
  assert.deepStrictEqual(proof.filter((m) => m[2] === 'false').map((m) => m[1]), ['B-80']);
  // born closed: X for the runner only, the policies read-only for the two auditor roles, nothing for tms_reader
  const main = read('073b_plan_monitoring.sql');
  assert.match(main, /GRANT SELECT ON public\.ct_settings TO tms_check_runner;/);
  // the 073b dry run of 26/10 refused B-79 in production: stock_vs_charge (inside ct_v_v5_revenue) runs as the runner
  assert.match(main, /GRANT EXECUTE ON FUNCTION public\.stock_vs_charge\(numeric, numeric\) TO tms_check_runner;/);
  assert.strictEqual((strip(main).match(/\bGRANT\b/g) || []).length, 2, 'two GRANTs only');
  const rb = read('073b_plan_monitoring_rollback.sql');
  assert.match(rb, /REVOKE SELECT ON public\.ct_settings FROM tms_check_runner;/);
  assert.match(rb, /REVOKE EXECUTE ON FUNCTION public\.stock_vs_charge\(numeric, numeric\) FROM tms_check_runner;/);
  assert.strictEqual((main.match(/CREATE POLICY monitor_read ON public\.[a-z_]+ FOR SELECT TO tms_check_runner, tms_reader USING \(true\);/g) || []).length, 5);
  assert.strictEqual((strip(main).match(/CREATE POLICY/g) || []).length, 5);
  assert.ok(!/tms_reader;/.test(main.replace(/TO tms_check_runner, tms_reader USING/g, '')), 'no grant to tms_reader');
});

// Task 4 review (minor 2): 073's rollback refuses while 073b's checks exist. Its list is the builder's F3 list - the
// checks that read 073's objects (072b's B-91..B-93 read only the segments) - so a change of numbers in 073b cannot
// silently stop the guard.
test('073 rollback refuses on exactly 073b\'s F3 checks', () => {
  const rb = read('073_plan_money_rollback.sql');
  const m = rb.match(/IF EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id IN \(([^)]*)\)\) THEN\s+RAISE EXCEPTION '073 rollback: 073b''s checks/);
  assert.ok(m, '073 rollback has the 073b refusal');
  assert.deepStrictEqual([...m[1].matchAll(/'(B-\d+)'/g)].map((x) => x[1]), B073.f3);
});
