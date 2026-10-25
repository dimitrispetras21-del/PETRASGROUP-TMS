// 071 + 071b + 072 ↔ Worker refusal contract (national v5 F2, owner 21–22/10/2026:
// the lower layer names the codes and constraints, αρχή 4). Pattern of
// local-relay-contract.test.mjs: the migrations themselves are read, so a
// rename on either side fails HERE, at build time, never on a dispatcher's
// save (αρχή 6) — and a Worker text with no counterpart in the base fails too
// (dead code, αρχή 8).
//
// The files are read from this checkout — never skipped when missing:
//   worker/migrations/071_plan_schema.sql, 071b_plan_one_vehicle.sql (live 22/10)
//   worker/migrations/drafts/072_plan_functions.sql  (draft, until it runs)
//   worker/migrations/072_plan_functions.sql         (after it ran and moved)
// On deploy/worker-plan the 072 draft is a COPY of the SQL branch's file
// (feat/national-v5-functions); when 072 changes there, copy it again and
// re-run this test before deploy — the diagnostic prints the md5 checked.
//
// 072's own refusals are parsed from `plan_h_raise('<code>'` (a literal code
// as the first argument — the convention of the SQL plan, Task A1) and from
// any literal HINT = 'plan:<code>'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(here, '..', 'migrations');
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');

function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const table = (name) => lift(new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\};\\n`), name);
const W = new Function([
  table('STOCK_CHECK_TEXT'), table('RELAY_RULE_TEXT'), table('RELAY_CHECK_TEXT'),
  table('PLAN_RULE_TEXT'), table('PLAN_CHECK_TEXT'),
  lift(/function stockRuleError\(e\) \{[\s\S]*?\n\}\n/, 'stockRuleError'),
].join('\n') + '\nreturn { RELAY_CHECK_TEXT, PLAN_RULE_TEXT, PLAN_CHECK_TEXT, stockRuleError };')();

function readOne(names, hint) {
  const file = names.map((n) => path.join(MIG, n)).find((f) => existsSync(f));
  assert.ok(file, `${names.join(' / ')} not found under worker/migrations — ${hint}`);
  return { file, sql: readFileSync(file, 'utf8') };
}
const f071 = () => readOne(['071_plan_schema.sql'], 'it is live since 22/10 and must be in main');
const f071b = () => readOne(['071b_plan_one_vehicle.sql'], 'it is live since 22/10 and must be in main');
const f072 = () => readOne(['drafts/072_plan_functions.sql', '072_plan_functions.sql'],
  'copy it from the SQL branch: git checkout feat/national-v5-functions -- worker/migrations/drafts/072_plan_functions.sql');
const uniq = (re, text) => [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort();
const greek = /[α-ωΑ-Ωά-ώ]/;

// The codes of the F2 plan's Interfaces («Κωδικοί plan:»): the parsed sets must
// equal these exactly, so a code added or dropped in SQL without the plan (or
// the reverse) fails here.
const CODES_071 = ['chain', 'chain_time', 'hard_delete', 'leg_locked', 'leg_order', 'leg_place', 'leg_stop_dead',
  'local_loading_day', 'local_loading_gone', 'local_loading_stop', 'model_locked', 'piece_dead', 'piece_locked',
  'piece_parent', 'pieces_alive', 'pieces_sum', 'rt_cancelled', 'rt_not_v2', 'rt_window', 'shipment_locked',
  'side_order', 'split_not_at_hub', 'stop_locked', 'stop_order', 'stop_seq', 'v1_link_on_v2'];
const CODES_072 = ['bad_input', 'driver_busy', 'group_empty', 'local_cancel_no_id', 'local_exists', 'need_token', 'no_actor', 'no_client',
  'no_price', 'no_vehicle', 'no_window', 'not_at_hub', 'not_stock', 'notice_gone', 'order_gone', 'order_not_v5',
  'parts_sum', 'payroll_locked', 'piece_busy', 'piece_split', 'request_missing', 'request_reused', 'rt_gone', 'same_rt', 'stale_confirm', 'stock_lot',
  'stop_gone', 'truck_busy', 'vehicle_clear_use_clear', 'vs_locked', 'vs_not_bridge'];
// Retired by the spec §7 — must appear nowhere (plan Interfaces).
const RETIRED = ['hub_endpoint', 'piece_planned', 'bridge_moved', 'bridge_split', 'legacy_nl', 'frozen',
  'restore_expired', 'restore_conflict', 'partner_rate_on_owned', 'window_order'];
// 071 rewrote three 060 CHECKs on local_moves (same names, nat_loading added):
// they keep their relay texts and type.
const RELAY_OWNED = ['local_moves_kind_chk', 'local_moves_kind_parent', 'local_moves_relay_trailer'];
// Live before 071 (pg_constraint, SELECT 22/10/2026) and reachable by plan_*.
const LIVE_PRE_071 = ['partner_needs_partner'];
// 071 constraints no request can meet, each with the reason:
const UNREACHABLE = {
  // UNIQUE (rt_id, id) exists only as the FK target of piece_legs; id is
  // already unique, so it can never be the one that fails.
  rt_stops_rt_id: 'FK target, id already unique',
};

function codes071(sql) {
  return uniq(/(?:return|prob :=|format\()\s*'([a-z_0-9]+):/g, sql)
    .concat(uniq(/hint = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i).sort();
}
// 072 also raises some 071 codes itself (rt_cancelled, piece_dead: refused at once, with 071's text): only the
// codes 072 adds are compared with CODES_072.
function codes072(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/HINT = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !CODES_071.includes(c)).sort();
}

test('071, 071b, 072 found and fingerprinted', (t) => {
  for (const { file, sql } of [f071(), f071b(), f072()]) {
    t.diagnostic(`checked: ${path.relative(path.join(here, '..', '..'), file)} md5 ${createHash('md5').update(sql).digest('hex')}`);
  }
  assert.ok(f072().sql.includes('plan_h_raise('), '072 raises through plan_h_raise');
});

test('the parsed codes are exactly the plan\'s 26 + 31 — none missing, none extra, none retired', () => {
  assert.deepEqual(codes071(f071().sql), CODES_071, '071 codes');
  assert.deepEqual(codes072(f072().sql), CODES_072, '072 codes');
  for (const sql of [f071().sql, f071b().sql, f072().sql]) {
    for (const r of RETIRED) assert.ok(!new RegExp(`'(?:plan:)?${r}[:']`).test(sql), `retired code «${r}» appears in SQL`);
  }
  for (const r of RETIRED) assert.ok(!Object.prototype.hasOwnProperty.call(W.PLAN_RULE_TEXT, r), `retired code «${r}» has a Worker text`);
});

test('every plan: code has its own Greek text, the DB detail in brackets; every Worker code key is raised by 071/072', () => {
  const all = [...CODES_071, ...CODES_072];
  for (const code of all) {
    assert.ok(Object.prototype.hasOwnProperty.call(W.PLAN_RULE_TEXT, code), `«${code}» has no Greek text in PLAN_RULE_TEXT`);
    const r = W.stockRuleError({ pg: { code: '23514', hint: 'plan:' + code, message: `plan rule broken: ${code}:RT-1280` } });
    assert.equal(r.type, 'PLAN_RULE');
    assert.equal(r.code, code);
    assert.equal(r.message, `${W.PLAN_RULE_TEXT[code]} (RT-1280)`);
    assert.match(r.message, greek, `${code} text is Greek`);
  }
  const dead = Object.keys(W.PLAN_RULE_TEXT).filter((k) => !all.includes(k));
  assert.deepEqual(dead, [], 'Worker plan: keys that 071/072 never raise (dead code, αρχή 8)');
});

test('every 071 CHECK and UNIQUE is mapped to Greek or classified; every PLAN_CHECK_TEXT key exists', () => {
  const sql = f071().sql;
  const checks = uniq(/CONSTRAINT (\w+) CHECK/g, sql);
  const uniques = uniq(/CREATE UNIQUE INDEX (\w+)/g, sql).concat(uniq(/CONSTRAINT (\w+) UNIQUE/g, sql));
  assert.ok(checks.includes('rt_v2_dates') && checks.includes('local_moves_nat_loading'), `071 CHECKs parsed: ${checks.join(', ')}`);
  for (const name of [...checks, ...LIVE_PRE_071]) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "x" violates check constraint "${name}"` } });
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.match(r.message, greek, `${name} text is Greek`);
    assert.ok(!r.message.includes('κανόνας ' + name), `${name} has its own text, not the generic fallback`);
    if (RELAY_OWNED.includes(name)) assert.equal(r.type, 'LOCAL_RELAY_RULE', `${name} keeps its 060 family`);
    else assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
  }
  for (const name of uniques) {
    const r = W.stockRuleError({ pg: { code: '23505', message: `duplicate key value violates unique constraint "${name}"` } });
    if (Object.prototype.hasOwnProperty.call(UNREACHABLE, name)) { assert.equal(r, null, `${name}: ${UNREACHABLE[name]}`); continue; }
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.equal(r.type, 'PLAN_RULE');
    assert.match(r.message, greek);
  }
  // the race floor and 072's own refusal say the same thing
  assert.deepEqual(W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "local_moves_nat_loading_once"' } }),
    { type: 'PLAN_RULE', code: 'local_exists', message: W.PLAN_RULE_TEXT.local_exists });
  const known = new Set([...checks, ...uniques, ...LIVE_PRE_071]);
  const dead = Object.keys(W.PLAN_CHECK_TEXT).filter((k) => !known.has(k));
  assert.deepEqual(dead, [], 'PLAN_CHECK_TEXT keys with no constraint in 071 or live before it');
  for (const k of RELAY_OWNED) assert.ok(!Object.prototype.hasOwnProperty.call(W.PLAN_CHECK_TEXT, k), `${k} stays in RELAY_CHECK_TEXT only`);
});

test('071b: each EXCLUDE (23P01, deferred) answers the same code as 072\'s pre-check', () => {
  const ex = uniq(/CONSTRAINT (\w+) EXCLUDE/g, f071b().sql);
  assert.deepEqual(ex, ['rt_v2_driver_once', 'rt_v2_truck_once']);
  const want = { rt_v2_truck_once: 'truck_busy', rt_v2_driver_once: 'driver_busy' };
  for (const name of ex) {
    const r = W.stockRuleError({ pg: { code: '23P01', details: 'Key (truck_id, tstzrange(start_at, end_at)) conflicts', message: `conflicting key value violates exclusion constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: want[name], message: W.PLAN_RULE_TEXT[want[name]] }, name);
  }
  assert.equal(W.stockRuleError({ pg: { code: '23P01', message: 'conflicting key value violates exclusion constraint "other_excl"' } }), null);
});

test('plan: hint is the marker whatever SQLSTATE; unknown code still loud; no detail, no brackets', () => {
  assert.equal(W.stockRuleError({ pg: { code: 'P0001', hint: 'plan:truck_busy', message: 'plan rule broken: truck_busy:RT-1290' } }).code, 'truck_busy');
  const hard = W.stockRuleError({ pg: { code: '23514', hint: 'plan:hard_delete', message: 'plan rule broken: hard delete on rt_stops (soft delete only)' } });
  assert.equal(hard.message, W.PLAN_RULE_TEXT.hard_delete, 'a message without «<code>:» adds no brackets');
  const unknown = W.stockRuleError({ pg: { code: '23514', hint: 'plan:brand_new', message: 'plan rule broken: brand_new:7' } });
  assert.equal(unknown.type, 'PLAN_RULE');
  assert.equal(unknown.code, 'brand_new');
  assert.match(unknown.message, /brand_new/);
  const long = W.stockRuleError({ pg: { code: '23514', hint: 'plan:chain', message: 'plan rule broken: chain:' + 'x'.repeat(500) } });
  assert.ok(long.message.length <= W.PLAN_RULE_TEXT.chain.length + 3 + 120, 'detail capped at 120 chars');
  assert.equal(W.stockRuleError({ pg: { code: '23514', hint: 'plan:toString', message: 'x' } }).message.startsWith('Ο κανόνας toString'), true, 'prototype key is not a text');
});
// ─────────────── Γ3: the Worker's RPC calls and money keys ↔ 072 (review 23/10) ───────────────
// PostgREST finds a function by its name AND its argument names: a rename on one side would pass every stub test
// of plan-routes and fail only on day L, as a misdiagnosed 503 schema_behind. Both sides are read from the sources.
test('every PLAN_ROUTES rpc exists in 072 with the argument names the Worker sends; every public plan_* is routed', () => {
  const sigs = Object.fromEntries([...f072().sql.matchAll(/CREATE FUNCTION public\.(plan_[a-z_]+)\(([^)]*)\)/g)]
    .filter((m) => !m[1].startsWith('plan_h_'))
    .map((m) => [m[1], m[2].split(',').map((a) => a.trim().split(/\s+/)[0]).filter(Boolean)]));
  const WRITE = ['p', 'p_actor', 'p_role'];
  const want = { plan_board: ['p_week', 'p_role'], plan_vs_state: ['p_order_ids'], plan_notices_list: ['p_desk', 'p_role'] };
  const routes = src.match(/var PLAN_ROUTES = \[[\s\S]*?\n\];\n/);
  assert.ok(routes, 'PLAN_ROUTES not found in worker/src/index.js');
  const routed = new Set([...routes[0].matchAll(/"(plan_[a-z_]+)"/g)].map((m) => m[1]));
  for (const fn of routed) assert.deepEqual(sigs[fn], want[fn] || WRITE, `${fn}: 072 signature vs the Worker's args`);
  assert.deepEqual([...routed].sort(), Object.keys(sigs).filter((x) => x !== 'plan_rt_create').sort(),
    'every public plan_* routed once; plan_rt_create internal (decision 3)');
});

test('PLAN_MONEY_KEYS of the Worker = the keys plan_h_strip_amounts cuts (one list, two layers)', () => {
  const m = src.match(/var PLAN_MONEY_KEYS = (\[[^\]]*\]);/);
  assert.ok(m, 'PLAN_MONEY_KEYS not found in worker/src/index.js');
  const strip = /CREATE FUNCTION public\.plan_h_strip_amounts\([\s\S]*?k not in \(([^)]*)\)/.exec(f072().sql);
  assert.ok(strip, 'plan_h_strip_amounts key list not found in 072');
  assert.deepEqual(JSON.parse(m[1]).slice().sort(), [...strip[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
});
