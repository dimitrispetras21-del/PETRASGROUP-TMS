// F5 E16 (spec §5; owner 28/10, Q-10; plan W4) — the facade closes the old national model on day L, against the
// real Worker in Node, 5 roles × {NL, GL, CL, national_orders, local_moves} × {POST, PATCH, DELETE}:
//   - deploy 1 (PLAN_WRITES_OPEN false): exactly today's answer — RBAC alone decides, no 409 anywhere;
//   - deploy 2 (day L): the Q-10 table — NL/GL/CL: POST nobody, PATCH/DELETE owner only; national_orders: POST and
//     DELETE nobody, PATCH per label (owner all, accountant the invoicing three + Price, dispatcher Price /
//     Reference / Notes); local_moves: a POST of kind «local» (or no kind = the DB default) closed, relay open;
//   - every refusal is 409 {error:{type:"LEGACY_CLOSED", code:"legacy_closed", message}} with ZERO DB calls, and
//     RBAC still speaks first (403 where it refused before).
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

test('deploy 2 (day L): the Q-10 table, cell by cell — 409 legacy_closed before any DB call, RBAC still first', async () => {
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
          assert.equal(r.status, 409, cell);
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
      assert.equal(r.status, 409, cell);
      assert.equal(r.json.error.code, 'legacy_closed', cell);
      for (const l of Object.keys(fields).filter((x) => !KEEP[role].includes(x))) assert.ok(r.json.error.message.includes(`«${l}»`), `${cell}: names ${l}`);
      assert.equal(calls.length, 0, cell);
    }
  }
  // a batch PATCH with one record outside the labels writes none
  reset(); dbAnswersEverything();
  const r = await callOpen('dispatcher', 'PATCH', `${BASE}/${NO.id}`, { records: [{ id: 'recA', fields: { Price: 1 } }, { id: 'recB', fields: { Status: 'Pending' } }] });
  assert.equal(r.status, 409, r.text);
  assert.equal(calls.length, 0);
});

test('day L, local_moves POST: kind «local» or no kind (the DB default) closed, single or in a batch; relay_* passes', async () => {
  for (const [fields, closed] of [[{ Description: 'x' }, true], [{ Description: 'x', 'Move Kind': 'local' }, true],
    [{ Description: 'x', 'Move Kind': null }, true], [{ Description: 'x', 'Move Kind': 'relay_delivery' }, false],
    [{ Description: 'x', 'Move Kind': 'relay_loading' }, false]]) {
    reset(); dbAnswersEverything();
    const r = await callOpen('dispatcher', 'POST', `${BASE}/local_moves`, { fields });
    if (closed) {
      assert.equal(r.status, 409, `${JSON.stringify(fields)}: ${r.text}`);
      assert.equal(r.json.error.code, 'legacy_closed');
      assert.equal(calls.length, 0);
    } else {
      assert.ok(r.status < 300, `${JSON.stringify(fields)}: ${r.text}`);
    }
  }
  reset(); dbAnswersEverything();
  const r = await callOpen('dispatcher', 'POST', `${BASE}/local_moves`, { records: [{ fields: { Description: 'a', 'Move Kind': 'relay_delivery' } }, { fields: { Description: 'b' } }] });
  assert.equal(r.status, 409, r.text);
  assert.equal(calls.length, 0, 'a batch with one local move writes none');
});

test('day L, NL batch POST and batch PATCH by a dispatcher: refused whole, nothing written; the owner\'s batch PATCH passes', async () => {
  dbAnswersEverything();
  let r = await callOpen('dispatcher', 'POST', `${BASE}/${T.NL.id}`, { records: [{ fields: { Status: 'Pending' } }] });
  assert.equal(r.status, 409, r.text);
  assert.equal(calls.length, 0);
  r = await callOpen('dispatcher', 'PATCH', `${BASE}/${T.NL.id}`, { records: [{ id: 'recA', fields: { Status: 'Assigned' } }] });
  assert.equal(r.status, 409, r.text);
  assert.equal(calls.length, 0);
  r = await callOpen('owner', 'PATCH', `${BASE}/${T.NL.id}`, { records: [{ id: 'recA', fields: { Status: 'Assigned' } }] });
  assert.ok(r.status < 300, r.text);
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
