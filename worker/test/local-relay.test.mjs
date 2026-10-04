// 060 local relays — the Worker half (owner 4/10/2026, «οκ προχωρα με τις
// τοπικες παραδοσεις»). Like the other lift-style tests here, the real source
// text is lifted out of the bundled worker/src/index.js (no exports there),
// so the test exercises the code that is deployed, not a copy (αρχή 3).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');

function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const fn = (name) => lift(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`), name);

const parts = [
  fn('corsHeaders'), fn('jsonOk'), fn('jsonError'),
  lift(/var PERMISSIONS = \{[\s\S]*?\n\};\n/, 'PERMISSIONS'), fn('can'),
  lift(/var COSTS_PERMS = \{[\s\S]*?\n\};\n/, 'COSTS_PERMS'), fn('ctCan'),
  lift(/var TABLES = \{[\s\S]*?\n\};\n/, 'TABLES'), fn('tableConfig'),
  lift(/var PL_READERS = [^\n]*\n/, 'PL_READERS'), fn('cfgForRole'),
  fn('columnToLabel'), fn('fieldsToColumns'), fn('filterFieldMap'), fn('toAirtableRecord'),
  lift(/\/\/ src\/lib\/formula-translate\.js[\s\S]*?(?=\/\/ src\/lib\/facade-links\.js)/, 'formula-translate section'),
  fn('preResolveLinkTerms'), fn('resolveLinksOnWrite'),
  fn('authorizeWrite'), fn('buildWriteRow'), fn('buildWriteRows'),
  fn('invoiceMarkError'), fn('invoiceNeedsBefore'),
  // one mapper for the stock (057) and relay (060) families: all three tables
  lift(/const STOCK_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'STOCK_CHECK_TEXT'),
  lift(/const RELAY_RULE_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_RULE_TEXT'),
  lift(/const RELAY_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_CHECK_TEXT'),
  fn('stockRuleError'), fn('stockRuleResponse'),
  fn('dbInsert'), fn('dbInsertMany'), fn('dbUpdate'),
  fn('handleFacadeCreate'), fn('facadeBatchCreate'), fn('handleFacadeUpdate'), fn('handleFacadeBatchUpdate'),
];

// Stubs for everything outside the lifted code. `state` lets each test choose
// who is calling and what PostgREST answers.
const state = { role: 'dispatcher', pgError: null, written: [] };
const stubs = {
  __name: () => {},
  getCaller: async () => ({ role: state.role, sub: 'test' }),
  logUnknownFields: () => {},
  audit: async () => {},
  auditMany: async () => {},
  readRowBefore: async () => ({ id: 1, legacy_id: 'recLM1' }),
  dbSelectManyByLegacy: async () => [],
  shapeOneWithLinks: async (row) => ({ id: row.legacy_id, fields: {} }),
  shapeManyWithLinks: async (rows) => rows.map((r) => ({ id: r.legacy_id, fields: {} })),
  mintLegacyId: () => 'recNEW',
  // link resolution: every rec resolves to id 42 (FIND pre-resolution + writes)
  resolveLegacyToIds: async (env, db, table, recids) => new Map(recids.map((r) => [r, 42])),
  dbSelectRaw: async () => ({ rows: [] }),
  // PostgREST stand-in: answers state.pgError (status + JSON body) or echoes the row
  fetch: async (url, init) => {
    if (state.pgError) {
      return new Response(JSON.stringify(state.pgError.body), { status: state.pgError.status });
    }
    const body = JSON.parse(init.body);
    state.written.push(body);
    const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: i + 1, legacy_id: 'recLM' + (i + 1), ...r }));
    return new Response(JSON.stringify(rows), { status: 201 });
  },
};
const names = Object.keys(stubs);
const W = new Function(...names, parts.join('\n') + `
return { PERMISSIONS, can, COSTS_PERMS, ctCan, TABLES, tableConfig, cfgForRole, columnToLabel,
  fieldsToColumns, filterFieldMap, toAirtableRecord, assertClientFormula, preResolveLinkTerms, applyFilter,
  RELAY_RULE_TEXT, RELAY_CHECK_TEXT, stockRuleError, stockRuleResponse, dbInsert, dbUpdate,
  handleFacadeCreate, facadeBatchCreate, handleFacadeUpdate, handleFacadeBatchUpdate };`)(...names.map((n) => stubs[n]));

const LM = W.TABLES.local_moves;
const DRIVERS = W.TABLES.tbl7UGmYhc2Y82pPs;
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'k', ALLOWED_ORIGIN: '' };
const req = (method, body) => new Request('https://w.test/v0/app/local_moves', {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
});
const pgRefusal = (hint, message = 'local_relay: refused', code = '23514') => ({
  status: 400,
  // `details` long on purpose: it sits BEFORE hint/message in PostgREST's JSON
  // and used to push them past the 200-char cut of e.message.
  body: { code, details: 'Failing row contains (' + 'x, '.repeat(120) + ')', hint, message },
});
async function asJson(res) { return { status: res.status, body: await res.json() }; }

// ── labels ───────────────────────────────────────────────────────────────────
test('LOCAL MOVES: «Move Kind» maps to move_kind; every existing label is unchanged', () => {
  assert.deepStrictEqual(LM.fields, {
    Date: 'move_date', Sequence: 'sequence', Description: 'description', Pallets: 'pallets',
    'Time From': 'time_from', 'Time To': 'time_to', Status: 'status', Notes: 'notes', 'Move Kind': 'move_kind',
  });
  assert.deepStrictEqual(Object.keys(LM.links), ['Driver', 'Truck', 'Trailer', 'Partner', 'From Location', 'To Location', 'Parent Nat Load', 'Parent Order']);
  assert.strictEqual(LM.links['Parent Order'].column, 'parent_order_id');
});

test('LOCAL MOVES: no availability label in Φ1 (OWNER-Q3: «παραλείπουμε αυτό το κομμάτι»)', () => {
  assert.ok(!('Handover Date' in LM.fields));
  assert.ok(!Object.values(LM.fields).includes('handover_date'));
});

test('LOCAL MOVES: a relay POST reaches the DB with kind, parent and executor columns', () => {
  const row = W.fieldsToColumns(LM, { 'Move Kind': 'relay_delivery', 'Time From': '07:00', Pallets: 33, Description: 'x' });
  assert.deepStrictEqual(row, { move_kind: 'relay_delivery', time_from: '07:00', pallets: 33, description: 'x' });
  const rec = W.toAirtableRecord({ legacy_id: 'recA', move_kind: 'local', move_date: '2026-10-05', status: 'Pending' }, W.columnToLabel(LM));
  assert.strictEqual(rec.fields['Move Kind'], 'local', 'Weekly National filters on this label');
});

test('DRIVERS: «Pay Basis» → pay_basis, not the Internal/External «Type»', () => {
  assert.strictEqual(DRIVERS.fields['Pay Basis'], 'pay_basis');
  assert.strictEqual(DRIVERS.fields.Type, 'type');
  assert.deepStrictEqual(DRIVERS.plOnly, ['Pay Basis']);
});

test('DRIVERS: «Pay Basis» reaches payroll readers only (dispatcher must never see payroll)', () => {
  const row = { legacy_id: 'recD', full_name: 'Driver', type: 'Internal', pay_basis: 'salary', active: true };
  for (const role of ['owner', 'management', 'accountant']) {
    const f = W.toAirtableRecord(row, W.columnToLabel(W.cfgForRole(DRIVERS, role))).fields;
    assert.strictEqual(f['Pay Basis'], 'salary', role);
  }
  for (const role of ['dispatcher', 'warehouse', undefined]) {
    const c = W.cfgForRole(DRIVERS, role);
    const f = W.toAirtableRecord(row, W.columnToLabel(c)).fields;
    assert.ok(!('Pay Basis' in f), `leaked to ${role}`);
    assert.strictEqual(f['Full Name'], 'Driver');
    assert.ok(!('Pay Basis' in W.filterFieldMap(c)), `filterable by ${role}`);
    assert.deepStrictEqual(W.fieldsToColumns(c, { 'Pay Basis': 'per_trip' }), {});
  }
  assert.strictEqual(DRIVERS.fields['Pay Basis'], 'pay_basis', 'the original config is never mutated');
});

// ── track record filter (OWNER-Q2 answered 4/10) ─────────────────────────────
async function filterAs(cfg, role, formula) {
  const c = W.cfgForRole(cfg, role);
  const params = new URLSearchParams();
  W.assertClientFormula(formula);
  W.applyFilter(await W.preResolveLinkTerms(formula, c, {}), W.filterFieldMap(c), params);
  return params.toString();
}
test('driver history: FIND on {Driver} filters LOCAL MOVES by driver_id (the formula the front uses)', async () => {
  assert.strictEqual(await filterAs(LM, 'dispatcher', 'FIND("recDRV1", ARRAYJOIN({Driver}, ","))>0'), 'driver_id=eq.42');
  assert.strictEqual(
    await filterAs(LM, 'accountant', 'AND(FIND("recDRV1", ARRAYJOIN({Driver}, ","))>0, IS_AFTER({Date}, "2026-09-30"))'),
    'driver_id=eq.42&move_date=gt.2026-09-30');
  assert.strictEqual(await filterAs(LM, 'warehouse', '{Move Kind}="relay_delivery"'), 'move_kind=eq.relay_delivery');
  assert.strictEqual(
    await filterAs(LM, 'dispatcher', 'OR(FIND("recO1", ARRAYJOIN({Parent Order}, ","))>0, FIND("recO2", ARRAYJOIN({Parent Order}, ","))>0)'),
    'or=%28parent_order_id.eq.42%2Cparent_order_id.eq.42%29');
});

// ── roles ────────────────────────────────────────────────────────────────────
test('dispatcher: GET/POST/PATCH/DELETE on local_moves (unchanged grant)', () => {
  for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) assert.ok(W.can('dispatcher', 'local_moves', m), m);
});

test('warehouse: GET only on local_moves — and nothing else opens', () => {
  assert.ok(W.can('warehouse', 'local_moves', 'GET'));
  for (const m of ['POST', 'PATCH', 'DELETE']) assert.ok(!W.can('warehouse', 'local_moves', m), m);
  assert.ok(!('*' in W.PERMISSIONS.warehouse), 'warehouse has no wildcard');
  assert.deepStrictEqual(Object.keys(W.PERMISSIONS.warehouse).sort(),
    ['consolidated_loads', 'groupage_lines', 'local_moves', 'locations', 'national_loads', 'national_orders', 'order_documents', 'order_stops', 'orders']);
  for (const [t, ms] of Object.entries(W.PERMISSIONS.warehouse)) assert.deepStrictEqual(ms, ['GET'], t);
  assert.ok(!W.can('warehouse', 'drivers', 'GET'));
});

test('management / accountant read local_moves through their "*" — no write', () => {
  for (const role of ['management', 'accountant']) {
    assert.ok(!('local_moves' in W.PERMISSIONS[role]), `${role} has no explicit row (it would replace "*")`);
    assert.ok(W.can(role, 'local_moves', 'GET'), role);
    for (const m of ['POST', 'PATCH', 'DELETE']) assert.ok(!W.can(role, 'local_moves', m), `${role} ${m}`);
  }
});

test('ledger (/costs/ledger): owner/management/accountant read; dispatcher and warehouse 403', () => {
  for (const role of ['owner', 'management', 'accountant']) assert.ok(W.ctCan(role, 'ledger', 'GET'), role);
  for (const role of ['dispatcher', 'warehouse']) {
    for (const m of ['GET', 'POST', 'PATCH']) assert.ok(!W.ctCan(role, 'ledger', m), `${role} ${m}`);
  }
});

test('ledger reads carry local_move_id (+relay_info) for the payroll screen; still not writable', () => {
  const month = lift(/select: "id,driver_id,entry_type,entry_date,trip_value[^"]*"/, 'month select');
  assert.match(month, /,local_move_id"/);
  const pending = lift(/select: "id,driver_id,entry_date,date_end,rt_id,rt_code[^"]*"/, 'pending select');
  assert.match(pending, /local_move_id,relay_info"/);
  // the driver card reads every view column (select *), so both arrive there too
  assert.match(lift(/const params = new URLSearchParams\(\{ select: "\*", driver_id: `eq\.\$\{recId\}`[^\n]*/, 'driver card select'), /select: "\*"/);
  assert.match(src, /import \{ validateNewEntry, validatePatch, localLineLockError \} from "\.\/ledger-rules\.mjs";/);
  assert.match(lift(/const localLock = localLineLockError\(body, before\.rows\[0\]\);\n\s*if \(localLock\) return jsonError\(localLock, 400/, 'PATCH guard'), /400/);
});

test('ledger PATCH: dl_local_day_live is matched BEFORE the dl_rt_live/23505 test', () => {
  const block = lift(/const pgMsg = [\s\S]*?this round trip already has a ledger line/, 'ledger PATCH catch');
  assert.ok(block.indexOf('dl_local_day_live') < block.indexOf('23505|dl_rt_live'));
});

// ── DB refusals → Greek 422 ──────────────────────────────────────────────────
test('mapper: every known relay hint answers its Greek text', () => {
  for (const [code, text] of Object.entries(W.RELAY_RULE_TEXT)) {
    const r = W.stockRuleError({ pg: { code: '23514', hint: 'local_relay:' + code, message: 'ascii' } });
    assert.deepStrictEqual(r, { type: 'LOCAL_RELAY_RULE', code, message: text });
    assert.match(text, /[α-ωΑ-Ω]/, `${code} text is Greek`);
  }
});

test('mapper: an unknown relay code is still a loud 422 naming the code (never the silent 500)', () => {
  const r = W.stockRuleError({ pg: { code: '23514', hint: 'local_relay:brand_new_rule', message: 'local_relay: something new' } });
  assert.strictEqual(r.code, 'brand_new_rule');
  assert.match(r.message, /brand_new_rule/);
  assert.match(r.message, /something new/);
  // the hint is the marker whatever SQLSTATE carried it
  assert.strictEqual(W.stockRuleError({ pg: { code: 'P0001', hint: 'local_relay:same_driver', message: 'x' } }).code, 'same_driver');
});

test('mapper: relay CHECKs by constraint name; other local_moves_* CHECKs named; pay basis', () => {
  const chk = (name) => W.stockRuleError({ pg: { code: '23514', message: `new row for relation "local_moves" violates check constraint "${name}"` } });
  for (const [name, text] of Object.entries(W.RELAY_CHECK_TEXT)) assert.strictEqual(chk(name).message, text, name);
  assert.match(chk('local_moves_future_rule').message, /local_moves_future_rule/);
  assert.match(W.stockRuleError({ pg: { code: '23514', message: 'violates check constraint "drivers_pay_basis_check"' } }).message, /Τύπος αμοιβής/);
  const dup = W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "local_moves_relay_once"' } });
  assert.strictEqual(dup.code, 'relay_exists');
});

test('mapper: anything else keeps today\'s 500 path', () => {
  assert.strictEqual(W.stockRuleError(new Error('plain')), null);
  assert.strictEqual(W.stockRuleError({ pg: { code: '23514', hint: null, message: 'violates check constraint "orders_price_chk"' } }), null);
  assert.strictEqual(W.stockRuleError({ pg: { code: '23514', hint: 'dl_cash_lock', message: 'x' } }), null);
  assert.strictEqual(W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "dl_local_day_live"' } }), null,
    'payroll-line race: the 5xx retry is the cure');
  assert.strictEqual(W.stockRuleError({ pg: { code: '23503', message: 'fk' } }), null);
});

test('db helpers keep the FULL parsed PostgREST error (hint survives a long details)', async () => {
  state.pgError = pgRefusal('local_relay:direction');
  try {
    await assert.rejects(W.dbUpdate(env, 'local_moves', 'legacy_id', 'recLM1', { driver_id: 1 }), (e) => {
      assert.ok(!e.message.includes('local_relay:direction'), 'the 200-char cut loses the hint…');
      assert.strictEqual(e.pg.hint, 'local_relay:direction', '…e.pg keeps it');
      return true;
    });
    await assert.rejects(W.dbInsert(env, 'local_moves', {}), (e) => e.pg.hint === 'local_relay:direction');
  } finally { state.pgError = null; }
});

// End to end through the real facade handlers (stubbed caller + PostgREST).
test('facade POST / PATCH / batch: a relay refusal reaches the dispatcher as a Greek 422', async () => {
  state.role = 'dispatcher';
  state.pgError = pgRefusal('local_relay:same_driver');
  try {
    const want = { type: 'LOCAL_RELAY_RULE', code: 'same_driver', message: W.RELAY_RULE_TEXT.same_driver };
    const fields = { 'Move Kind': 'relay_delivery', 'Parent Order': ['recO1'], Driver: ['recD1'], Trailer: ['recT1'] };
    let r = await asJson(await W.handleFacadeCreate(req('POST', { fields }), 'local_moves', '', env, {}));
    assert.deepStrictEqual(r, { status: 422, body: { error: want } }, 'single POST');
    r = await asJson(await W.handleFacadeCreate(req('POST', { records: [{ fields }] }), 'local_moves', '', env, {}));
    assert.deepStrictEqual(r, { status: 422, body: { error: want } }, 'batch POST');
    r = await asJson(await W.handleFacadeUpdate(req('PATCH', { fields: { Driver: ['recD1'] } }), 'local_moves', 'recLM1', '', env, {}));
    assert.deepStrictEqual(r, { status: 422, body: { error: want } }, 'single PATCH');
    r = await asJson(await W.handleFacadeBatchUpdate(req('PATCH', { records: [{ id: 'recLM1', fields: { Driver: ['recD1'] } }] }), 'local_moves', '', env, {}));
    assert.deepStrictEqual(r, { status: 422, body: { error: want } }, 'batch PATCH');
  } finally { state.pgError = null; }
});

test('facade: a non-rule DB failure keeps the 500 (retry) path', async () => {
  state.role = 'dispatcher';
  state.pgError = { status: 503, body: { code: 'PGRST000', message: 'connection' } };
  try {
    const r = await W.handleFacadeUpdate(req('PATCH', { fields: { Notes: 'x' } }), 'local_moves', 'recLM1', '', env, {});
    assert.strictEqual(r.status, 500);
  } finally { state.pgError = null; }
});

test('facade: a dispatcher relay save writes the mapped columns (no Date/Status sent)', async () => {
  state.role = 'dispatcher';
  state.written = [];
  const res = await W.handleFacadeCreate(req('POST', { fields: {
    'Move Kind': 'relay_loading', 'Parent Order': ['recO1'], Driver: ['recD1'], Trailer: ['recT1'], 'To Location': ['recL1'], 'Time From': '06:00',
  } }), 'local_moves', '', env, {});
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(state.written[0], {
    move_kind: 'relay_loading', time_from: '06:00', parent_order_id: 42, driver_id: 42, trailer_id: 42, to_location_id: 42, legacy_id: 'recNEW',
  });
});

test('facade: warehouse cannot write a relay; management cannot either', async () => {
  for (const role of ['warehouse', 'management', 'accountant']) {
    state.role = role;
    const res = await W.handleFacadeCreate(req('POST', { fields: { 'Move Kind': 'relay_delivery' } }), 'local_moves', '', env, {});
    assert.strictEqual(res.status, 403, role);
  }
  state.role = 'dispatcher';
});
