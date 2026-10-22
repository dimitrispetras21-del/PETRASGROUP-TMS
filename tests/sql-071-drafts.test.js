// tests/sql-071-drafts.test.js - run: node --test tests/sql-071-drafts.test.js
// The 071 / 071b drafts (national v5 schema, F1) at build time, plain node, no database (principle 6: a stale
// fingerprint or a forgotten rule should fail here, not at 15:30 on the owner's evening):
//   - all eleven files there; ASCII only (the owner pastes them from a clipboard that has mangled Greek before);
//   - the writing files are ONE DO block (the SQL editor is not atomic across statements); verify/fingerprint write nothing;
//   - the dry runs are regenerated from their sources, never hand-edited;
//   - the four rewrites add ONE "-- 071:" line each to the live text read 21/10, the md5 chain is written into 071,
//     its rollback and verify, and the rollback undoes exactly 071's substitutions;
//   - B-54 moves by exactly +9 (071), -9 (rollback), 0 (071b), and only from the live count;
//   - born closed; the spec deltas of 21/10 hold; the facade never maps a new table; every plan: code is tested.
// The rules themselves are proven by 071_plan_schema_test.sql on PGlite (tms-auditor/test/plan-071.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations');   // executed 22/10: out of drafts/ (CLAUDE.md rule 5)
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['071_plan_schema.sql', '071_plan_schema_dryrun.sql', '071_plan_schema_test.sql', '071_plan_schema_rollback.sql',
  '071b_plan_one_vehicle.sql', '071b_plan_one_vehicle_dryrun.sql', '071b_plan_one_vehicle_test.sql', '071b_plan_one_vehicle_rollback.sql'];
const READ_ONLY = ['071_plan_schema_verify.sql', '071_plan_schema_fingerprint.sql', '071b_plan_one_vehicle_verify.sql'];
const TABLES = ['shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices'];
const VIEWS = ['v_shipments', 'v_piece_pos', 'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket',
  'v_national_order_state', 'v_vs_state'];
const SUBS = [
  { sig: 'public.rt_status_guard()', a: 'sg_old', b: 'sg_new', old: 'f632fea1d6a5dd2cee7c80f4db9e27f2', neu: 'd7757f99c3443ac167d5bdaf3e34b142' },
  { sig: 'public.rt_recompute(bigint)', a: 'rc_old', b: 'rc_new', old: '3f85092f030b2ad92a3002ab0a9cc98d', neu: '5fa0a08418147b22d2852db3b8c72c3e' },
  { sig: 'public.rt_auto_close(bigint)', a: 'ac_old', b: 'ac_new', old: '88b41f860aaf7f925183ab84dc10c2dd', neu: 'eba2146ca4c521da6365edd28c4507af' },
  { sig: 'public.dl_local_day_sync(bigint,date)', a: 'ls_old', b: 'ls_new', old: 'a4a62603e5b0c4ad48124fea625aa611', neu: '151dab06e2676f3c8885d7298d0ac6af' },
];

// A `name CONSTANT text := '...' || E'\n' || '...';` of a DO block, evaluated.
function sqlConst(src, name) {
  const m = new RegExp(`\\b${name} CONSTANT text := ([\\s\\S]*?);\\n`).exec(src);
  assert.ok(m, `${name} not found`);
  let out = '';
  for (const t of m[1].matchAll(/E'((?:[^'\\]|\\.)*)'|'((?:[^']|'')*)'/g))
    out += t[1] !== undefined ? t[1].replace(/\\n/g, '\n') : t[2].replace(/''/g, "'");
  return out;
}

test('the eleven 071 / 071b files are all there', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^071b?_plan_/.test(f));
  assert.deepStrictEqual(files.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
});

test('ASCII only: every 071 / 071b file and the dry-run builder', () => {
  for (const f of DO_FILES.concat(READ_ONLY, ['drafts/tools/build-071-dryruns.mjs'])) {
    const bad = [...read(f)].filter((c) => c.charCodeAt(0) > 127);
    assert.deepStrictEqual(bad, [], f);
  }
});

test('each writing file is ONE DO block; verify and fingerprint write nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    // privilege names inside has_table_privilege('...', 'SELECT,INSERT,...') are strings, not writes
    const sql = strip(read(f)).replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/i, f);
    assert.doesNotMatch(sql, /^DO \$/m, f);
  }
});

test('the dry runs are regenerated from their sources (node worker/migrations/drafts/tools/build-071-dryruns.mjs)', async () => {
  const { PAIRS, buildDryRun } = await import(path.join(ROOT, 'worker/migrations/drafts/tools/build-071-dryruns.mjs'));
  assert.strictEqual(PAIRS.length, 2);
  for (const p of PAIRS) assert.strictEqual(read(p.target), buildDryRun(read(p.source), p), p.target + ' drifted');
});

test('the four rewrites: ONE "-- 071:" line on the live text, md5 chain written down, the rollback undoes exactly them', () => {
  const src = read('071_plan_schema.sql');
  const rb = read('071_plan_schema_rollback.sql');
  const verify = read('071_plan_schema_verify.sql');
  for (const s of SUBS) {
    const a = sqlConst(src, s.a);
    const b = sqlConst(src, s.b);
    assert.notStrictEqual(a, b, s.sig);
    if (s.a === 'ls_old') {
      assert.ok(b.startsWith("|| ' ' || coalesce(lm.parent_order_id::text, "), 'dl_local_day_sync keeps the order number first');
      assert.ok(b.endsWith(', sep ORDER BY lm.id) -- 071: a nat_loading has no order, it names its cycle'));
    } else {
      assert.ok(b.startsWith(a + '\n  if '), `${s.sig}: the live line stays, ONE line follows it`);
      assert.strictEqual(b.split('\n').length, a.split('\n').length + 1, s.sig);
      assert.match(b.split('\n').pop(), /model = 2 then return( new)?; end if; -- 071: /);
    }
    assert.ok(src.includes(`'${s.sig}', '${s.old}'`), `071 guards ${s.sig} on the live md5 ${s.old}`);
    assert.ok(src.includes(`'${s.neu}'`), `071 proves the generated md5 ${s.neu}`);
    assert.strictEqual(sqlConst(rb, s.a), a, `rollback ${s.a} = 071 ${s.a}`);
    assert.strictEqual(sqlConst(rb, s.b), b, `rollback ${s.b} = 071 ${s.b}`);
    assert.ok(rb.includes(`'${s.neu}'`) && rb.includes(`'${s.old}'`), `rollback guards ${s.sig} both ways`);
    assert.ok(verify.includes(`'${s.neu}'`), `verify reads ${s.sig} at ${s.neu}`);
  }
});

test('B-54 moves by exactly +9 / -9 / 0, and only from the live count', () => {
  const guard = /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL\)/;
  const src = read('071_plan_schema.sql');
  assert.match(src, guard);
  assert.match(src, /IF v_trg1 <> v_trg0 \+ 9 THEN/);
  assert.match(src, /UPDATE monitoring\.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;/);
  assert.strictEqual((strip(src).match(/CREATE (CONSTRAINT )?TRIGGER /g) || []).length, 9, '071 creates exactly 9 triggers');
  const rb = read('071_plan_schema_rollback.sql');
  assert.match(rb, guard);
  assert.match(rb, /IF v_trg1 <> v_trg0 - 9 THEN/);
  assert.strictEqual((strip(rb).match(/DROP TRIGGER /g) || []).length, 9, 'the rollback drops exactly 9 triggers');
  const b = read('071b_plan_one_vehicle.sql');
  assert.match(b, /IF v_trg1 <> v_trg0 THEN/);
  assert.doesNotMatch(strip(b), /UPDATE monitoring\.checks|CREATE (CONSTRAINT )?TRIGGER/i, '071b adds no trigger and leaves B-54 alone');
});

test('born closed: RLS on, every privilege revoked from the four API roles, SELECT only, functions closed', () => {
  const src = strip(read('071_plan_schema.sql'));
  for (const t of TABLES) assert.match(src, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  const rels = TABLES.concat(VIEWS).map((r) => 'public\\.' + r).join(',\\s*');
  assert.match(src, new RegExp(`REVOKE ALL ON ${rels}\\s*FROM PUBLIC, anon, authenticated, service_role;`));
  assert.match(src, new RegExp(`GRANT SELECT ON ${rels}\\s*TO service_role, tms_reader, tms_check_runner;`));
  assert.doesNotMatch(src, /GRANT (INSERT|UPDATE|DELETE|ALL)/i, 'no write grant: only plan_* (F2) write');
  assert.doesNotMatch(src, /CREATE POLICY/i);
  for (const v of VIEWS) assert.match(src, new RegExp(`CREATE VIEW public\\.${v} WITH \\(security_invoker = true\\) AS`), v);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_chk\(\), public\.plan_rt_window_sync\(\), public\.ct_rt_legs_v2_guard\(\),\s*public\.plan_shipment_problem\(bigint\), public\.plan_leg_problem\(bigint\), public\.plan_rt_problem\(bigint\),\s*public\.plan_local_loading_problem\(bigint\) FROM PUBLIC, anon, authenticated, service_role;/);
  for (const v of VIEWS) assert.doesNotMatch(src.slice(src.indexOf(`CREATE VIEW public.${v} `)).split(';')[0], /\b(price|partner_rate|revenue|cost)\b/i, `${v} carries no money`);
});

test('the spec of 21/10 holds in the schema', () => {
  const src = strip(read('071_plan_schema.sql'));
  const rtAlter = src.slice(src.indexOf('ALTER TABLE public.ct_round_trips'), src.indexOf(';', src.indexOf('ALTER TABLE public.ct_round_trips')));
  assert.doesNotMatch(rtAlter, /deleted_at/, 'spec 2.1: ct_round_trips has no deleted_at, a cycle that did not happen is cancelled');
  assert.match(rtAlter, /ADD CONSTRAINT rt_v2_status CHECK \(model = 1 OR status IN \('planned', 'cancelled'\)\)/);
  for (const gone of ['plan_chk_hub', 'hub_endpoint', 'deleted_batch', 'plan_restore', 'loader', 'qty_unit', 'plan_config'])
    assert.ok(!src.includes(gone), `spec 7: ${gone} is gone`);
  assert.match(src, /ADD CONSTRAINT local_moves_kind_chk CHECK \(move_kind IN \('local', 'relay_delivery', 'relay_loading', 'nat_loading'\)\)/);
  assert.match(src, /ALTER TABLE public\.local_moves ADD COLUMN rt_stop_id bigint REFERENCES public\.rt_stops \(id\) ON DELETE RESTRICT;/);
  assert.match(src, /ADD COLUMN via_hub boolean NOT NULL DEFAULT false/);
  assert.match(src, /\(es\.planned_to AT TIME ZONE 'Europe\/Athens'\)::date < \(now\(\) AT TIME ZONE 'Europe\/Athens'\)::date\) IS TRUE AS executed/, 'spec 2.3: executed by the Athens day of planned_to');
  assert.match(src, /\(s\.planned_to AT TIME ZONE 'Europe\/Athens'\)::date < \(now\(\) AT TIME ZONE 'Europe\/Athens'\)::date\) AS executed/);
  assert.doesNotMatch(src, /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.(national_loads|groupage_lines|consolidated_loads|national_orders)\b/i,
    '071 writes no NL / GL / CL / national order');
  assert.doesNotMatch(src, /CREATE TRIGGER rt_status_guard|DROP FUNCTION public\.(rt_|dl_)/, 'live functions are replaced in place, never dropped');
});

test('the new tables never enter the facade TABLES map (spec 2.1)', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
  for (const t of TABLES) assert.ok(!worker.includes(`pg: "${t}"`), `${t} must stay out of TABLES`);
});

test('every plan: code 071 can raise is a case of the rules test', () => {
  const src = read('071_plan_schema.sql');
  const codes = new Set([...strip(src).matchAll(/'([a-z][a-z0-9_]*):/g)].map((m) => m[1]).filter((c) => c !== 'plan'));
  for (const m of src.matchAll(/hint = 'plan:([a-z0-9_]+)'/g)) codes.add(m[1]);
  assert.ok(codes.size >= 25, `found ${codes.size} codes`);
  const testSql = read('071_plan_schema_test.sql');
  for (const c of codes) assert.ok(testSql.includes(`'plan:${c}'`), `plan:${c} has no case in 071_plan_schema_test.sql`);
});
