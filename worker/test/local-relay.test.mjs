// 060 local relays — the Worker half (owner 4/10/2026, «οκ προχωρα με τις
// τοπικες παραδοσεις»). Like the other lift-style tests here, the real source
// text is lifted out of the bundled worker/src/index.js (no exports there),
// so the test exercises the code that is deployed, not a copy (αρχή 3).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePatch, localLineLockError, localLineCancelError } from '../src/ledger-rules.mjs';
import { monthRange, aggregateMonth } from '../src/ledger-month.mjs';

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
  fn('authorizeWrite'), fn('refuseReadOnly'), fn('buildWriteRow'), fn('buildWriteRows'),
  fn('invoiceMarkError'), fn('invoiceNeedsBefore'),
  // one mapper for the stock (057) and relay (060) families: all three tables
  lift(/const STOCK_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'STOCK_CHECK_TEXT'),
  lift(/const RELAY_RULE_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_RULE_TEXT'),
  lift(/const RELAY_CHECK_TEXT = \{[\s\S]*?\n\};\n/, 'RELAY_CHECK_TEXT'),
  fn('stockRuleError'), fn('stockRuleResponse'),
  fn('dbInsert'), fn('dbInsertMany'), fn('dbUpdate'),
  fn('handleFacadeCreate'), fn('facadeBatchCreate'), fn('handleFacadeUpdate'), fn('handleFacadeBatchUpdate'),
  fn('schemaBehind060'), fn('schemaBehind060Response'), fn('localLineCancelFacts'), fn('handleCosts'),
];

// Stubs for everything outside the lifted code. `state` lets each test choose
// who is calling and what PostgREST answers.
const state = { role: 'dispatcher', pgError: null, written: [], selectRaw: null, patched: [], reads: [] };
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
  dbSelectRaw: async (...a) => (state.selectRaw ? state.selectRaw(...a) : { rows: [] }),
  // /costs/ledger (handleCosts): the real pure rules, stubbed DB writes
  validatePatch, localLineLockError, localLineCancelError, monthRange, aggregateMonth,
  ctDbPatch: async (env, table, filter, patch) => {
    if (state.patchError) throw state.patchError;
    state.patched.push({ table, filter, patch });
    return { id: 50, ...patch };
  },
  dlCashLines: async () => ({ n: 0 }),
  dlCashLockError: () => { throw new Error('dlCashLockError must not be reached in these tests'); },
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
  handleFacadeCreate, facadeBatchCreate, handleFacadeUpdate, handleFacadeBatchUpdate,
  schemaBehind060, handleCosts };`)(...names.map((n) => stubs[n]));

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

// Owner 5/10 («ας μην υπαρχει διαχωρισμος αναμεσα στους οδηγους»): there is no
// pay basis — no DRIVERS label for it and no P&L-only DRIVERS field. (Not an
// exact label list: a later DRIVERS label from main must not break this test.)
test('DRIVERS: no «Pay Basis» label, no plOnly — every driver is the same to the payroll', () => {
  assert.ok(!('Pay Basis' in DRIVERS.fields));
  assert.strictEqual(DRIVERS.fields.Type, 'type');
  assert.strictEqual(DRIVERS.plOnly, undefined);
  assert.ok(!/pay_basis/.test(src), 'no pay_basis column named anywhere in the Worker');
});

// ── track record filter (every driver's local moves, OWNER-Q2 answered 5/10) ─────────────────────────────
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

test('ledger reads: only the month read names a 060 column; the pending queue stays pre-060', () => {
  const month = lift(/select: "id,driver_id,entry_type,entry_date,trip_value[^"]*"/, 'month select');
  assert.match(month, /,local_move_id"/);
  // ?pending=1 has no caller in the front (Φ1): it keeps its pre-060 select,
  // so a Worker-before-060 deploy cannot break that queue too.
  const pending = lift(/select: "id,driver_id,entry_date,date_end,rt_id,rt_code[^"]*"/, 'pending select');
  assert.strictEqual(pending, 'select: "id,driver_id,entry_date,date_end,rt_id,rt_code,route_text,route_legs,advance,expenses"');
  // the driver card reads every view column (select *), so relay_info arrives there
  assert.match(lift(/const params = new URLSearchParams\(\{ select: "\*", driver_id: `eq\.\$\{recId\}`[^\n]*/, 'driver card select'), /select: "\*"/);
  assert.match(src, /import \{ validateNewEntry, validatePatch, localLineLockError, localLineCancelError \} from "\.\/ledger-rules\.mjs";/);
});

// ── /costs/ledger end to end (real handleCosts, stubbed PostgREST) ───────────
const costsCall = (method, pathname, body) => [
  new Request('https://w.test' + pathname, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: body ? JSON.stringify(body) : undefined }),
  new URL('https://w.test' + pathname),
];
const localLine = { id: 50, driver_id: 31, entry_type: 'trip', entry_date: '2026-10-05', local_move_id: 7, rt_id: null, trip_value: null, deleted_at: null };
async function patchLedger(line, facts, body, role = 'accountant') {
  state.role = role; state.patched = []; state.reads = [];
  state.selectRaw = async (e, table, params) => {
    state.reads.push({ table, params: params.toString() });
    if (table === 'dl_entries') return { rows: [line] };
    if (table === 'local_moves') return { rows: Array.from({ length: facts.liveRelays }, (_, i) => ({ id: i + 1 })) };
    return { rows: [] };
  };
  try {
    const [rq, url] = costsCall('PATCH', '/costs/ledger/' + line.id, body);
    return await asJson(await W.handleCosts(rq, url, '', env));
  } finally { state.selectRaw = null; }
}

test('ledger PATCH (D3): a local line with a live relay of its driver that day is not cancelled — 409, nothing written', async () => {
  for (const liveRelays of [1, 2]) {
    const r = await patchLedger(localLine, { liveRelays }, { cancel: true, reason: 'δεν έγινε' });
    assert.strictEqual(r.status, 409, String(liveRelays));
    assert.match(r.body.error, /δεν έμεινε τοπική κίνηση του οδηγού/);
    assert.match(r.body.error, new RegExp('μένουν ' + liveRelays));
    assert.deepStrictEqual(state.patched, [], 'nothing written');
    // owner 5/10: nothing about the driver is read — the day's relays are the only fact
    assert.deepStrictEqual(state.reads.map((x) => x.table), ['dl_entries', 'local_moves']);
  }
  // the «live relay» read is 060's own test: that driver, that day, relays only, not deleted, not Cancelled
  const lm = state.reads.find((x) => x.table === 'local_moves');
  const q = new URLSearchParams(lm.params);
  assert.deepStrictEqual(Object.fromEntries(q), {
    select: 'id', driver_id: 'eq.31', move_date: 'eq.2026-10-05', move_kind: 'neq.local', status: 'neq.Cancelled', deleted_at: 'is.null',
  });
});

test('ledger PATCH (D3): no live relay left that day → cancelled with the reason', async () => {
  for (const role of ['owner', 'management', 'accountant']) {
    const r = await patchLedger(localLine, { liveRelays: 0 }, { cancel: true, reason: 'η κίνηση σβήστηκε' }, role);
    assert.strictEqual(r.status, 200, role);
    assert.strictEqual(state.patched.length, 1);
    assert.strictEqual(state.patched[0].table, 'dl_entries');
    assert.strictEqual(state.patched[0].patch.deleted_reason, 'η κίνηση σβήστηκε');
    assert.ok(state.patched[0].patch.deleted_at);
  }
});

test('ledger PATCH (D3): the reason is still required, cancel stays a standalone action', async () => {
  let r = await patchLedger(localLine, { liveRelays: 0 }, { cancel: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /reason required to cancel/);
  r = await patchLedger(localLine, { liveRelays: 0 }, { cancel: true, reason: 'x', trip_value: 0 });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /cancel cannot be combined/);
  assert.deepStrictEqual(state.patched, []);
});

test('ledger PATCH: restore, day, route, RT of a local line stay refused (the system owns it); dispatcher 403', async () => {
  const cancelled = { ...localLine, deleted_at: '2026-10-05T10:00:00Z' };
  let r = await patchLedger(cancelled, { liveRelays: 0 }, { restore: true, reason: 'λάθος' }, 'owner');
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /την κρατά το σύστημα/);
  for (const body of [{ entry_date: '2026-10-06', reason: 'x' }, { route: 'x' }, { rt_id: 5 }]) {
    r = await patchLedger(localLine, { liveRelays: 1 }, body);
    assert.strictEqual(r.status, 400, JSON.stringify(body));
  }
  assert.deepStrictEqual(state.patched, []);
  r = await patchLedger(localLine, { liveRelays: 0 }, { cancel: true, reason: 'x' }, 'dispatcher');
  assert.strictEqual(r.status, 403);
});

test('ledger PATCH: the base\'s own refusal of a local line (060 dl_local_line_guard) is a 409 with its text, not a 500', async () => {
  // the race: the Worker read «no relay left», a relay was saved, the base refuses
  for (const code of ['line_has_relay', 'line_restore']) {
    const e = new Error('ctDbPatch dl_entries 400: {"code":"23514"…');
    e.pg = { code: '23514', details: null, hint: 'local_relay:' + code, message: 'local_relay: refused' };
    state.patchError = e;
    try {
      const r = await patchLedger(localLine, { liveRelays: 0 }, { cancel: true, reason: 'x' });
      assert.strictEqual(r.status, 409, code);
      assert.strictEqual(r.body.error, W.stockRuleError(e).message);
      assert.match(r.body.error, /[α-ωΑ-Ω]/);
    } finally { state.patchError = null; }
  }
  // an RT line's dl_rt_live conflict keeps its own 409 text (the mapper returns null for it)
  const dup = new Error('ctDbPatch dl_entries 409: {"code":"23505","message":"duplicate key value violates unique constraint \\"dl_rt_live\\""}');
  dup.pg = { code: '23505', message: 'duplicate key value violates unique constraint "dl_rt_live"' };
  state.patchError = dup;
  try {
    const r = await patchLedger({ ...localLine, id: 52, local_move_id: null, rt_id: 9 }, { liveRelays: 0 }, { rt_id: 10, reason: 'x' });
    assert.strictEqual(r.status, 409);
    assert.match(r.body.error, /round trip already has a ledger line/);
  } finally { state.patchError = null; }
});

test('ctDbPatch keeps the parsed PostgREST error (the 060 hint survives a long details)', async () => {
  const ctDbPatch = new Function('fetch', '__name', fn('ctDbPatch') + '\nreturn ctDbPatch;')(
    async () => new Response(JSON.stringify(pgRefusal('local_relay:line_has_relay').body), { status: 400 }), () => {});
  await assert.rejects(ctDbPatch(env, 'dl_entries', 'id=eq.50', { deleted_at: 'now' }), (e) => {
    assert.ok(!e.message.includes('line_has_relay'), 'the 200-char cut loses the hint…');
    assert.strictEqual(e.pg.hint, 'local_relay:line_has_relay', '…e.pg keeps it');
    return true;
  });
});

test('ledger PATCH: an RT line cancels as before — no relay read', async () => {
  const rtLine = { ...localLine, id: 51, local_move_id: null, rt_id: 9 };
  const r = await patchLedger(rtLine, { liveRelays: 3 }, { cancel: true, reason: 'διπλή' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(state.reads.map((x) => x.table), ['dl_entries']);
});

test('ledger month read before 060 (or after its rollback): a 503 that names 060, not a generic 500', async () => {
  state.role = 'accountant';
  const pg42703 = 'dbSelectRaw dl_v_entries 400: {"code":"42703","details":null,"hint":null,"message":"column dl_v_entries.local_move_id does not exist"}';
  for (const [err, status, re] of [
    [pg42703, 503, /060/],
    ['dbSelectRaw dl_v_entries 503: {"code":"PGRST000","message":"connection"}', 500, /Costs request failed/],
    ['dbSelectRaw dl_v_entries 400: {"code":"42703","details":null,"hint":null,"message":"column dl_v_entries.other does not exist"}', 500, /Costs request failed/],
  ]) {
    state.selectRaw = async (e, table) => {
      if (table === 'dl_v_entries') throw new Error(err);
      return { rows: [] };
    };
    try {
      const [rq, url] = costsCall('GET', '/costs/ledger?month=2026-10');
      const r = await asJson(await W.handleCosts(rq, url, '', env));
      assert.strictEqual(r.status, status, err);
      assert.strictEqual(typeof r.body.error, 'string', 'ctFetch shows data.error as text');
      assert.match(r.body.error, re);
    } finally { state.selectRaw = null; }
  }
  assert.strictEqual(W.schemaBehind060(new Error(pg42703)), true);
});

test('ledger month read after 060: local day lines counted apart (local_days)', async () => {
  state.role = 'management';
  state.selectRaw = async (e, table) => (table === 'dl_v_entries'
    ? { rows: [{ id: 1, driver_id: 31, entry_type: 'trip', entry_date: '2026-10-05', trip_value: null, pending: true, cancelled: false, local_move_id: 7 }] }
    : { rows: [] });
  try {
    const [rq, url] = costsCall('GET', '/costs/ledger?month=2026-10');
    const r = await asJson(await W.handleCosts(rq, url, '', env));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.month.drivers[31].local_days, 1);
    assert.strictEqual(r.body.month.drivers[31].trips, 0);
  } finally { state.selectRaw = null; }
});

// ── DB refusals → Greek 422 ──────────────────────────────────────────────────
// The codes themselves are checked against 060 in local-relay-contract.test.mjs.
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

test('mapper: relay CHECKs by constraint name; other local_moves_* CHECKs named', () => {
  const chk = (name) => W.stockRuleError({ pg: { code: '23514', message: `new row for relation "local_moves" violates check constraint "${name}"` } });
  for (const [name, text] of Object.entries(W.RELAY_CHECK_TEXT)) assert.strictEqual(chk(name).message, text, name);
  assert.match(chk('local_moves_future_rule').message, /local_moves_future_rule/);
  const dup = W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "local_moves_relay_once"' } });
  assert.strictEqual(dup.code, 'relay_exists');
  assert.strictEqual(dup.message, W.RELAY_RULE_TEXT.relay_exists, 'race floor and trigger refusal say the same');
});

// Rebased onto the stock-lots Worker (057, deploys first): ONE mapper serves
// both families (αρχή 3) — a second *RuleError/*RuleResponse beside it would
// let the two drift apart, so the source is pinned here.
test('one DB-rule mapper for 057 stock + 060 relay: one function, each family keeps its own type', async () => {
  assert.strictEqual((src.match(/^function \w+RuleError\(/gm) || []).length, 1, 'one *RuleError');
  assert.strictEqual((src.match(/^function \w+RuleResponse\(/gm) || []).length, 1, 'one *RuleResponse');
  const stock = W.stockRuleError({ pg: { code: '23514', hint: 'stock:over_draw', message: 'Υπέρβαση αποθέματος' } });
  assert.deepStrictEqual(stock, { code: 'over_draw', message: 'Υπέρβαση αποθέματος' });
  assert.deepStrictEqual(await asJson(W.stockRuleResponse(stock, '', env)),
    { status: 422, body: { error: { type: 'STOCK_RULE', code: 'over_draw', message: 'Υπέρβαση αποθέματος' } } });
  const relay = W.stockRuleError({ pg: { code: '23514', hint: 'local_relay:direction', message: 'ascii' } });
  assert.deepStrictEqual(await asJson(W.stockRuleResponse(relay, '', env)),
    { status: 422, body: { error: { type: 'LOCAL_RELAY_RULE', code: 'direction', message: W.RELAY_RULE_TEXT.direction } } });
  // a stock CHECK name is never answered with a relay text, nor the reverse
  const chk = (name) => W.stockRuleError({ pg: { code: '23514', message: `violates check constraint "${name}"` } });
  assert.strictEqual(chk('stock_lots_close_shape').type, undefined);
  assert.strictEqual(chk('local_moves_relay_trailer').type, 'LOCAL_RELAY_RULE');
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
