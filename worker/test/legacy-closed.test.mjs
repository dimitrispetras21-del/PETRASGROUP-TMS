// F5 E16 (spec §5; owner 28/10, Q-10; plan W4) — the facade closes the old national model on day L, against the
// real Worker in Node, 5 roles × {NL, GL, CL, national_orders, local_moves} × {POST, PATCH, DELETE}:
//   - deploy 1 (PLAN_WRITES_OPEN false): exactly today's answer — RBAC alone decides, no legacy_closed anywhere;
//   - deploy 2 (day L): the Q-10 table — NL/GL/CL: POST nobody, PATCH/DELETE owner only; national_orders: POST and
//     DELETE nobody, PATCH per label (owner all, accountant the invoicing three + Price, dispatcher Price /
//     Reference / Notes); local_moves: a POST of kind «local» (or no kind = the DB default) closed, relay open;
//   - every refusal is 422 {error:{type:"LEGACY_CLOSED", code:"legacy_closed", message}} with ZERO DB calls (422, the
//     facade's final refusal: core/api.js _atRetry resends a 409 twice more), and RBAC still speaks first (403).
// Owner 28/10 (after code review): three more paths to the old history, owner only from day L, the same 422 — the
// stops of a legacy national order (facade, POST/PATCH linking one, PATCH/DELETE of one), PATCH/DELETE of a «local»
// move, and a legacy NL put on / taken off a round trip through /costs/rt.
// Plus F5 W3: a facade write that loses a lock (40P01 / 40001 / 55P03) is a 503 busy_retry, nothing kept.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { call, callOpen, json, pgError, on, calls, writes, reset, restore, SRC_PATH } from './fixtures/f5-harness.mjs';

const src = readFileSync(SRC_PATH, 'utf8');
const PERMISSIONS = new Function(src.match(/var PERMISSIONS = \{[\s\S]*?\n\};\n/)[0] + '\nreturn PERMISSIONS;')();
const can = (role, table, method) => { const r = PERMISSIONS[role][table] || PERMISSIONS[role]['*']; return !!(r && r.includes(method)); };

const ROLES = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'];
const BASE = '/v0/appTEST';
// facade id, Postgres table, a body each method can carry (real labels of that table, so an allowed write reaches the DB)
const T = {
  NL: { id: 'tblVW42cZnfC47gTb', pg: 'national_loads', fields: { Status: 'Assigned' } },
  GL: { id: 'tblxUAaIsUMEDl3qQ', pg: 'groupage_lines', fields: { Status: 'Unassigned' } },
  CL: { id: 'tbl5XSLQjOnG6yLCW', pg: 'consolidated_loads', fields: { Status: 'Assigned' } },
  NO: { id: 'tblGHCCsTMqAy4KR2', pg: 'national_orders', fields: { Price: 120 } },
  LM: { id: 'local_moves', pg: 'local_moves', fields: { Description: 'x', 'Move Kind': 'relay_delivery' } }
};
const LEGACY_REFUSED = { type: 'LEGACY_CLOSED', code: 'legacy_closed' };

beforeEach(reset);
afterEach(restore);
// an allowed write goes through: every read answers empty, every write echoes one row
function dbAnswersEverything() {
  for (const t of Object.values(T)) {
    on('GET', t.pg, () => json([]));
    on('POST', t.pg, (u, b) => json((Array.isArray(b) ? b : [b]).map((r, i) => ({ id: i + 1, legacy_id: `recNEW${i}`, ...r })), 201));
    on('PATCH', t.pg, (u, b) => json([{ id: 1, legacy_id: 'recX', ...b }]));
  }
  on('GET', 'national_orders_with_derived', () => json([]));
}
function req(t, method) {
  if (method === 'POST') return [`${BASE}/${t.id}`, { fields: t.fields }];
  if (method === 'PATCH') return [`${BASE}/${t.id}/recX`, { fields: t.fields }];
  return [`${BASE}/${t.id}/recX`, undefined];
}
// Q-10, read off the plan, never off the source: who keeps the write on day L (with the fields above)
const OPEN_KEEPS = {
  NL: { POST: [], PATCH: ['owner'], DELETE: ['owner'] },
  GL: { POST: [], PATCH: ['owner'], DELETE: ['owner'] },
  CL: { POST: [], PATCH: ['owner'], DELETE: ['owner'] },
  NO: { POST: [], PATCH: ['owner', 'accountant', 'dispatcher'], DELETE: [] },
  LM: { POST: ROLES, PATCH: ROLES, DELETE: ROLES }
};

test('deploy 1 (switch closed): every cell answers as today — RBAC alone, never legacy_closed', async () => {
  let reached = 0;
  for (const [name, t] of Object.entries(T)) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      for (const role of ROLES) {
        reset(); dbAnswersEverything();
        const [p, body] = req(t, method);
        const r = await call(role, method, p, body);
        const cell = `${role} ${method} ${name}: ${r.status} ${r.text.slice(0, 160)}`;
        assert.notEqual(r.json?.error?.code, 'legacy_closed', cell);
        if (!can(role, t.pg, method)) {
          assert.equal(r.status, 403, cell);
          assert.equal(calls.length, 0, cell);
        } else {
          assert.ok(r.status < 300, cell);
          assert.ok(writes().length >= 1, `${cell}: the write reached the DB`);
          reached += 1;
        }
      }
    }
  }
  assert.ok(reached > 20, `allowed cells exercised: ${reached}`);
});

test('deploy 2 (day L): the Q-10 table, cell by cell — 422 legacy_closed before any DB call, RBAC still first', async () => {
  let refused = 0;
  for (const [name, t] of Object.entries(T)) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      for (const role of ROLES) {
        reset(); dbAnswersEverything();
        const [p, body] = req(t, method);
        const r = await callOpen(role, method, p, body);
        const cell = `${role} ${method} ${name}: ${r.status} ${r.text.slice(0, 160)}`;
        if (!can(role, t.pg, method)) {
          assert.equal(r.status, 403, cell);
        } else if (OPEN_KEEPS[name][method].includes(role)) {
          assert.ok(r.status < 300, cell);
          assert.ok(writes().length >= 1, `${cell}: the write reached the DB`);
        } else {
          assert.equal(r.status, 422, cell);
          assert.deepEqual({ type: r.json.error.type, code: r.json.error.code }, LEGACY_REFUSED, cell);
          assert.match(r.json.error.message, /[α-ωΑ-Ω]/, `${cell}: Greek text`);
          assert.equal(calls.length, 0, `${cell}: no DB call`);
          refused += 1;
        }
      }
    }
  }
  assert.ok(refused >= 10, `refused cells: ${refused}`);
});

test('day L, national_orders PATCH per label: the accountant\'s invoicing three + Price, the dispatcher\'s Price / Reference / Notes; one label outside = the whole write refused, naming it', async () => {
  const NO = T.NO;
  const KEEP = { accountant: ['Invoiced', 'Invoice Number', 'Invoice Date', 'Price'], dispatcher: ['Price', 'Reference', 'Notes'] };
  const cases = [
    ['accountant', { Invoiced: true, 'Invoice Number': 'ΤΠΥ-1', 'Invoice Date': '2026-11-02' }, true],
    ['accountant', { Price: 300 }, true],
    ['accountant', { Invoiced: true, Status: 'Delivered' }, false],
    ['dispatcher', { Price: 300, Reference: 'R-1', Notes: 'n' }, true],
    ['dispatcher', { Invoiced: true }, false],
    ['dispatcher', { 'Ops Status': 'Late' }, false],
    ['owner', { Status: 'Delivered', 'Ops Status': 'Late', Invoiced: true }, true]
  ];
  for (const [role, fields, ok] of cases) {
    reset(); dbAnswersEverything();
    const r = await callOpen(role, 'PATCH', `${BASE}/${NO.id}/recX`, { fields });
    const cell = `${role} ${JSON.stringify(fields)}: ${r.status} ${r.text.slice(0, 200)}`;
    if (ok) {
      assert.ok(r.status < 300, cell);
    } else {
      assert.equal(r.status, 422, cell);
      assert.equal(r.json.error.code, 'legacy_closed', cell);
      for (const l of Object.keys(fields).filter((x) => !KEEP[role].includes(x))) assert.ok(r.json.error.message.includes(`«${l}»`), `${cell}: names ${l}`);
      assert.equal(calls.length, 0, cell);
    }
  }
  // a batch PATCH with one record outside the labels writes none
  reset(); dbAnswersEverything();
  const r = await callOpen('dispatcher', 'PATCH', `${BASE}/${NO.id}`, { records: [{ id: 'recA', fields: { Price: 1 } }, { id: 'recB', fields: { Status: 'Pending' } }] });
  assert.equal(r.status, 422, r.text);
  assert.equal(calls.length, 0);
});

test('day L, local_moves POST: kind «local» or no kind (the DB default) closed, single or in a batch; relay_* passes', async () => {
  for (const [fields, closed] of [[{ Description: 'x' }, true], [{ Description: 'x', 'Move Kind': 'local' }, true],
    [{ Description: 'x', 'Move Kind': null }, true], [{ Description: 'x', 'Move Kind': 'relay_delivery' }, false],
    [{ Description: 'x', 'Move Kind': 'relay_loading' }, false]]) {
    reset(); dbAnswersEverything();
    const r = await callOpen('dispatcher', 'POST', `${BASE}/local_moves`, { fields });
    if (closed) {
      assert.equal(r.status, 422, `${JSON.stringify(fields)}: ${r.text}`);
      assert.equal(r.json.error.code, 'legacy_closed');
      assert.equal(calls.length, 0);
    } else {
      assert.ok(r.status < 300, `${JSON.stringify(fields)}: ${r.text}`);
    }
  }
  reset(); dbAnswersEverything();
  const r = await callOpen('dispatcher', 'POST', `${BASE}/local_moves`, { records: [{ fields: { Description: 'a', 'Move Kind': 'relay_delivery' } }, { fields: { Description: 'b' } }] });
  assert.equal(r.status, 422, r.text);
  assert.equal(calls.length, 0, 'a batch with one local move writes none');
});

test('day L, NL batch POST and batch PATCH by a dispatcher: refused whole, nothing written; the owner\'s batch PATCH passes', async () => {
  dbAnswersEverything();
  let r = await callOpen('dispatcher', 'POST', `${BASE}/${T.NL.id}`, { records: [{ fields: { Status: 'Pending' } }] });
  assert.equal(r.status, 422, r.text);
  assert.equal(calls.length, 0);
  r = await callOpen('dispatcher', 'PATCH', `${BASE}/${T.NL.id}`, { records: [{ id: 'recA', fields: { Status: 'Assigned' } }] });
  assert.equal(r.status, 422, r.text);
  assert.equal(calls.length, 0);
  r = await callOpen('owner', 'PATCH', `${BASE}/${T.NL.id}`, { records: [{ id: 'recA', fields: { Status: 'Assigned' } }] });
  assert.ok(r.status < 300, r.text);
});

test('a JSON body that is not an object (null, array, number) → 400 before anything, never a crash', async () => {
  for (const raw of ['null', '[]', '7']) {
    calls.length = 0;
    const r = await callOpen('owner', 'POST', `${BASE}/${T.NL.id}`, raw);
    assert.equal(r.status, 400, `${raw}: ${r.text}`);
    assert.equal(calls.length, 0, raw);
  }
});

test('the facade answers a lost lock (40P01 / 40001 / 55P03) with 503 busy_retry «nothing written», on every single-statement write', async () => {
  const ORDERS = 'tblgHlNmLBH3JTdIM';
  const STOPS = 'tblaeY5QOHAS1gyE8';
  const busy = (code) => () => pgError(400, { code, details: null, hint: null, message: code === '55P03' ? 'canceling statement due to lock timeout' : 'deadlock detected' });
  const BUSY = { type: 'SERVER', code: 'busy_retry', message: 'Ταυτόχρονη αλλαγή από άλλον χρήστη — τίποτα δεν γράφτηκε· δοκίμασε ξανά' };
  for (const code of ['40P01', '40001', '55P03']) {
    for (const [method, p, body, table] of [
      ['PATCH', `${BASE}/${ORDERS}/recO1`, { fields: { Notes: 'x' } }, 'orders'],
      ['PATCH', `${BASE}/${STOPS}/recS1`, { fields: { Pallets: 3 } }, 'order_stops'],
      ['POST', `${BASE}/${STOPS}`, { records: [{ fields: { Pallets: 3 } }, { fields: { Pallets: 4 } }] }, 'order_stops'],
      ['POST', `${BASE}/${STOPS}`, { fields: { Pallets: 3 } }, 'order_stops'],
      ['PATCH', `${BASE}/${STOPS}`, { records: [{ id: 'recS1', fields: { Pallets: 3 } }] }, 'order_stops'],
      ['DELETE', `${BASE}/${STOPS}/recS1`, undefined, 'order_stops']]) {
      reset();
      on('GET', table, () => json([]));
      on(method === 'DELETE' ? 'PATCH' : method, table, busy(code));
      const r = await call('dispatcher', method, p, body);
      assert.equal(r.status, 503, `${code} ${method} ${p}: ${r.text}`);
      assert.deepEqual(r.json.error, BUSY);
    }
  }
  // a batch PATCH whose first row landed: not «nothing written» — today's 500 stays
  reset();
  on('GET', 'order_stops', () => json([]));
  let n = 0;
  on('PATCH', 'order_stops', (u, b) => (++n === 1 ? json([{ id: 1, legacy_id: 'recS1', ...b }]) : busy('40P01')()));
  const r = await call('dispatcher', 'PATCH', `${BASE}/${STOPS}`, { records: [{ id: 'recS1', fields: { Pallets: 3 } }, { id: 'recS2', fields: { Pallets: 4 } }] });
  assert.equal(r.status, 500, r.text);
});

// ─────────── owner 28/10: the three other paths to the old history ───────────
const STOPS = { id: 'tblaeY5QOHAS1gyE8', pg: 'order_stops' };
function rowsAre(table, row) {
  on('GET', table, () => json([row]));
  on('PATCH', table, (u, b) => json([{ ...row, ...b }]));
  on('POST', table, (u, b) => json((Array.isArray(b) ? b : [b]).map((r, i) => ({ id: 90 + i, legacy_id: `recN${i}`, ...r })), 201));
}
test('day L, stops of a legacy national order: PATCH / DELETE / batch by anyone but the owner → 422 (read first, nothing written); deploy 1 and intl stops unchanged', async () => {
  const natStop = { id: 31, legacy_id: 'recS1', national_order_id: 6, order_id: null, pallets: 4 };
  const intlStop = { id: 32, legacy_id: 'recS2', national_order_id: null, order_id: 9, pallets: 4 };
  for (const [method, p, body] of [['PATCH', `${BASE}/${STOPS.id}/recS1`, { fields: { Pallets: 5 } }],
    ['PATCH', `${BASE}/${STOPS.id}`, { records: [{ id: 'recS1', fields: { Pallets: 5 } }] }],
    ['DELETE', `${BASE}/${STOPS.id}/recS1`, undefined]]) {
    reset(); rowsAre('order_stops', natStop);
    let r = await callOpen('dispatcher', method, p, body);
    assert.equal(r.status, 422, `${method} ${p}: ${r.text}`);
    assert.equal(r.json.error.code, 'legacy_closed');
    assert.equal(writes().length, 0, `${method}: nothing written`);
    reset(); rowsAre('order_stops', natStop);
    r = await callOpen('owner', method, p, body);
    assert.ok(r.status < 300, `owner ${method}: ${r.text}`);
    reset(); rowsAre('order_stops', natStop);
    r = await call('dispatcher', method, p, body);
    assert.ok(r.status < 300, `deploy 1 ${method}: ${r.text}`);
    reset(); rowsAre('order_stops', intlStop);
    r = await callOpen('dispatcher', method, p.replace('recS1', 'recS2'), body && JSON.parse(JSON.stringify(body).replace('recS1', 'recS2')));
    assert.ok(r.status < 300, `intl stop ${method}: ${r.text}`);
  }
  // the row could not be read: refused (503), never let through unchecked
  reset();
  on('GET', 'order_stops', () => pgError(500, { message: 'boom' }));
  const r = await callOpen('dispatcher', 'DELETE', `${BASE}/${STOPS.id}/recS1`);
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.error.code, 'row_unread');
  assert.equal(writes().length, 0);
});

test('day L, a stop tied to a legacy national order (POST, or PATCH setting «Parent Nat Order») by anyone but the owner → 422 before any DB call', async () => {
  for (const [method, p, body] of [['POST', `${BASE}/${STOPS.id}`, { fields: { Pallets: 3, 'Parent Nat Order': ['recNO1'] } }],
    ['POST', `${BASE}/${STOPS.id}`, { records: [{ fields: { Pallets: 3 } }, { fields: { 'Parent Nat Order': ['recNO1'] } }] }],
    ['PATCH', `${BASE}/${STOPS.id}/recS2`, { fields: { 'Parent Nat Order': ['recNO1'] } }]]) {
    reset();
    const r = await callOpen('dispatcher', method, p, body);
    assert.equal(r.status, 422, `${method}: ${r.text}`);
    assert.equal(r.json.error.code, 'legacy_closed');
    assert.equal(calls.length, 0);
  }
  // an empty link is no tie
  reset(); rowsAre('order_stops', { id: 32, legacy_id: 'recS2', national_order_id: null, order_id: 9 });
  const r = await callOpen('dispatcher', 'PATCH', `${BASE}/${STOPS.id}/recS2`, { fields: { Pallets: 2, 'Parent Nat Order': [] } });
  assert.ok(r.status < 300, r.text);
});

test('day L, «local» moves: PATCH / DELETE by anyone but the owner → 422; relay rows and the owner pass', async () => {
  const local = { id: 5, legacy_id: 'recLM1', move_kind: 'local', rt_stop_id: null };
  const relay = { id: 6, legacy_id: 'recLM1', move_kind: 'relay_delivery', rt_stop_id: null };
  for (const [method, body] of [['PATCH', { fields: { Description: 'y' } }], ['DELETE', undefined]]) {
    reset(); rowsAre('local_moves', local);
    let r = await callOpen('dispatcher', method, `${BASE}/local_moves/recLM1`, body);
    assert.equal(r.status, 422, `${method}: ${r.text}`);
    assert.equal(r.json.error.code, 'legacy_closed');
    assert.equal(writes().length, 0);
    reset(); rowsAre('local_moves', local);
    r = await callOpen('owner', method, `${BASE}/local_moves/recLM1`, body);
    assert.ok(r.status < 300, `owner ${method}: ${r.text}`);
    reset(); rowsAre('local_moves', relay);
    r = await callOpen('dispatcher', method, `${BASE}/local_moves/recLM1`, body);
    assert.ok(r.status < 300, `relay ${method}: ${r.text}`);
    reset(); rowsAre('local_moves', local);
    r = await call('dispatcher', method, `${BASE}/local_moves/recLM1`, body);
    assert.ok(r.status < 300, `deploy 1 ${method}: ${r.text}`);
  }
});

test('day L, /costs/rt: a legacy NL put on (POST legs nat_load_id) or taken off (DELETE ?nat_load_id) a round trip by anyone but the owner → 422 before any DB call', async () => {
  for (const role of ['dispatcher', 'accountant']) {
    reset();
    const r = await callOpen(role, 'POST', '/costs/rt', { scope: 'NATL', trip_type: 'OWNED', truck_id: 3, date_start: '2026-10-31', legs: [{ direction: 'KATHODOS', nat_load_id: 77 }] });
    assert.equal(r.status, 422, `${role}: ${r.text}`);
    assert.equal(r.json.error.code, 'legacy_closed');
    assert.equal(calls.length, 0);
  }
  reset();
  let r = await callOpen('dispatcher', 'DELETE', '/costs/rt/5/legs?nat_load_id=77');
  assert.equal(r.status, 422, r.text);
  assert.equal(calls.length, 0);
  // both ids: the leg removed is the ORDER's (legFilter prefers order_id), so it is not refused - and the DELETE sent
  // filters by order_id only, never by the NL (pinned: a swap of that preference would open the NL path)
  reset();
  on('GET', 'ct_round_trips', () => json([{ id: 5, status: 'planned', model: 1 }]));
  on('GET', 'ct_rt_legs', () => json([{ id: 1, rt_id: 5, order_id: 9 }]));
  on('DELETE', 'ct_rt_legs', () => new Response(null, { status: 204 }));
  r = await callOpen('dispatcher', 'DELETE', '/costs/rt/5/legs?order_id=9&nat_load_id=77');
  assert.notEqual(r.json?.error?.code, 'legacy_closed', r.text);
  const del = calls.find((c) => c.method === 'DELETE');
  assert.ok(del, r.text);
  assert.equal(del.params.get('order_id'), 'eq.9');
  assert.equal(del.params.get('nat_load_id'), null);
  // an order leg is not legacy national: the request goes on to the DB (whatever it answers here)
  for (const [send, role, method, p, body] of [[callOpen, 'dispatcher', 'DELETE', '/costs/rt/5/legs?order_id=9', undefined],
    [callOpen, 'owner', 'DELETE', '/costs/rt/5/legs?nat_load_id=77', undefined], [call, 'dispatcher', 'DELETE', '/costs/rt/5/legs?nat_load_id=77', undefined],
    [callOpen, 'owner', 'POST', '/costs/rt', { scope: 'NATL', trip_type: 'OWNED', truck_id: 3, date_start: '2026-10-31', legs: [{ direction: 'KATHODOS', nat_load_id: 77 }] }]]) {
    reset();
    on('GET', 'ct_round_trips', () => json([]));
    on('GET', 'ct_rt_legs', () => json([]));
    r = await send(role, method, p, body);
    assert.notEqual(r.json?.error?.code, 'legacy_closed', `${role} ${method} ${p}: ${r.text}`);
    assert.ok(calls.length >= 1, `${role} ${method} ${p}: reached the DB`);
  }
});
