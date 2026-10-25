// National v5 F2 — /plan/* routes against the real Worker in Node, PostgREST
// stubbed via fetch (harness of stock-lots.test.mjs). Contract under test:
//   - each route calls exactly ONE rpc/plan_* with {p, p_actor, p_role} (writes)
//     or its typed args (reads) — the deferred 071 rules speak at that RPC's
//     COMMIT, a second RPC would run after the first committed;
//   - writes are closed until day L (409 writes_closed, zero DB calls), except
//     {"dry_run": true} on the four RPCs that support it (decision 22);
//   - the reply is passed through as the DB wrote it (the DB cuts by role),
//     but an `amount` never reaches a role outside owner/accountant;
//   - refusals: plan:<code> → 422 Greek, need_token → 428, 23P01 → truck_busy,
//     missing 072 → 503, another named constraint → 422, anything else → 500
//     naming the route — every one in the ONE /plan/* error shape;
//   - the older paths: PATCH /costs/rt/:id on a v5 cycle → 409 before the DB;
//     a facade write refused by a plan: rule → 422 instead of 500;
//   - the Worker writes no audit_log of its own on /plan/* (the DB does).
// Two instances of the same source: as deployed (writes closed), and one with
// the single switch flipped by a loader hook (`?plan-writes-open`), so the
// write routes can be exercised without a second switch in the source.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.endsWith('/worker/src/index.js?plan-writes-open')) return next(url, ctx);
  const r = await next(url, { ...ctx, format: 'module' });
  const text = new TextDecoder().decode(r.source);
  const needle = 'var PLAN_WRITES_OPEN = false;';
  if (text.split(needle).length !== 2) throw new Error('plan-routes: the writes switch is not exactly once in index.js');
  return { format: 'module', source: text.replace(needle, 'var PLAN_WRITES_OPEN = true;'), shortCircuit: true };
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);
const { default: workerOpen } = await import(pathToFileURL(SRC_PATH).href + '?plan-writes-open');

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function callOn(w, role, method, p, body) {
  const headers = { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const res = await w.fetch(new Request(`https://w.invalid${p}`, { method, headers, body: raw }), env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const call = (...a) => callOn(worker, ...a);       // as deployed: writes closed
const callOpen = (...a) => callOn(workerOpen, ...a); // day L: writes open

// ---- PostgREST stub ----
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
const pgError = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let routes, calls;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  routes = [];
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, table, params: u.searchParams, body });
    for (const r of routes) {
      if (r.method === method && r.table === table) {
        const out = await r.handler(u, body);
        if (out) return out;
      }
    }
    if (method === 'POST' && table === 'audit_log') return json(Array.isArray(body) ? body : [body], 201);
    if (method === 'POST' && table === 'rpc/log_unknown_field') return json(null);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const on = (method, table, handler) => routes.push({ method, table, handler });
const rpcCalls = () => calls.filter((c) => c.table.startsWith('rpc/'));
const auditRows = () => calls.filter((c) => c.table === 'audit_log');
const planReject = (code, detail, sqlstate = '23514') => pgError(400, { code: sqlstate, details: null, hint: `plan:${code}`, message: `plan rule broken: ${code}:${detail}` });
const OK = { ok: true, op: 'stub', dry_run: false, ids: {}, warnings: [], notice_ids: [] };

// ─────────────────────────────── reads ───────────────────────────────
test('GET /plan/board?week=<Saturday>: one rpc/plan_board(p_week, p_role); the DB body is served as is (empty = [])', async () => {
  const board = { week: '2026-10-10', cycles: [], waiting: [], hub: [], notices: [] };
  on('POST', 'rpc/plan_board', () => json(board));
  for (const role of ['owner', 'dispatcher', 'management', 'accountant', 'warehouse']) {
    calls.length = 0;
    const r = await call(role, 'GET', '/plan/board?week=2026-10-10');
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.deepEqual(r.json, board);
    assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_board', { p_week: '2026-10-10', p_role: role }]]);
  }
  assert.equal(auditRows().length, 0);
});

test('GET /plan/board: a week that is not a real Saturday → 400 bad_week before any DB call', async () => {
  for (const q of ['', '?week=', '?week=2026-10-12', '?week=2026-02-30', '?week=10/10/2026', '?week=2026-10-10T00:00']) {
    calls.length = 0;
    const r = await call('owner', 'GET', `/plan/board${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, 'bad_week');
    assert.equal(r.json.error.type, 'BAD_REQUEST');
    assert.equal(calls.length, 0, q);
  }
});

test('GET /plan/vs-state: ids deduplicated into p_order_ids; 0, negative, text, empty or > 500 ids → 400', async () => {
  on('POST', 'rpc/plan_vs_state', () => json({ 3: 'missing', 1: { carriers: [], all_executed: false, all_planned: false, first_hub_day: null } }));
  const r = await call('warehouse', 'GET', '/plan/vs-state?order_ids=3,1,3');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(rpcCalls()[0].body, { p_order_ids: [3, 1] });
  assert.equal(r.json[3], 'missing');
  const many = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
  for (const q of ['', '?order_ids=', '?order_ids=0', '?order_ids=-1', '?order_ids=1,a', `?order_ids=${many}`]) {
    calls.length = 0;
    const bad = await call('owner', 'GET', `/plan/vs-state${q}`);
    assert.equal(bad.status, 400, q.slice(0, 30));
    assert.equal(bad.json.error.code, 'bad_order_ids');
    assert.equal(calls.length, 0);
  }
  calls.length = 0;
  on('POST', 'rpc/plan_vs_state', () => json({}));
  assert.equal((await call('owner', 'GET', `/plan/vs-state?order_ids=${many.split(',').slice(0, 500).join(',')}`)).status, 200, '500 ids pass');
});

test('GET /plan/notices?desk=: p_desk + p_role; another desk → 400', async () => {
  on('POST', 'rpc/plan_notices_list', () => json({ unread: [], recent: [] }));
  const r = await call('management', 'GET', '/plan/notices?desk=natl');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(rpcCalls()[0].body, { p_desk: 'natl', p_role: 'management' });
  calls.length = 0;
  const bad = await call('owner', 'GET', '/plan/notices?desk=all');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'bad_desk');
  assert.equal(calls.length, 0);
});

// ───────────────────── writes: the closed switch (as deployed) ─────────────────────
// [route, method, body, rpc, idKey/id merged into p]
const WRITES = [
  ['/plan/notices/12/read', 'POST', {}, 'plan_notice_read', { notice_id: 12 }],
  ['/plan/orders', 'POST', { orders: [{ client_id: 1 }] }, 'plan_orders_create', {}],
  ['/plan/orders/17', 'PATCH', { set: { price: 300 } }, 'plan_order_update', { nat_order_id: 17 }],
  ['/plan/legs', 'POST', { pieces: [{ piece_id: 4 }], target: { rt_id: 5, side: 'ANODOS' }, stops: [] }, 'plan_put_pieces', {}],
  ['/plan/legs', 'POST', { group: { order_id: 9 }, target: { rt_id: 5, side: 'KATHODOS' }, stops: [] }, 'plan_put_group', {}],
  ['/plan/move', 'POST', { from: { piece_ids: [4] }, target: { wait: true } }, 'plan_move_pieces', {}],
  ['/plan/pieces/split', 'POST', { piece_id: 4, parts: [{ pallets: 12 }, { pallets: 14 }] }, 'plan_split_piece', {}],
  ['/plan/rt/5', 'PATCH', { set: { driver_id: 8 } }, 'plan_rt_update', { rt_id: 5 }],
  ['/plan/rt/5/clear', 'POST', { confirm_token: 'abc' }, 'plan_rt_clear', { rt_id: 5 }],
  ['/plan/delete', 'POST', { nat_order_id: 17, reason: 'x', confirm_token: 'abc' }, 'plan_delete', {}],
  ['/plan/vs/day', 'POST', { order_id: 1, day: '2026-10-13' }, 'plan_vs_set_day', {}],
  ['/plan/vs/place', 'POST', { order_stop_id: 3, location_id: 2 }, 'plan_vs_set_place', {}],
  ['/plan/local-loading', 'POST', { rt_stop_id: 3, driver_id: 8, truck_id: 2 }, 'plan_local_loading', {}]
];
const DRY_CAPABLE = ['plan_move_pieces', 'plan_rt_update', 'plan_rt_clear', 'plan_delete'];
// decision 41 (b): the delete-type acts stay owner + dispatcher; every other write is every role's
const DELETE_TYPE = ['plan_rt_clear', 'plan_delete'];
const ALL_ROLES = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'];
const WRITES_CLOSED = { error: { type: 'WRITES_CLOSED', code: 'writes_closed', message: 'Οι αλλαγές στο Εβδομαδιαίο Εθνικών ανοίγουν την ημέρα της μετάβασης — ως τότε μόνο ανάγνωση και προεπισκόπηση' } };

test('writes closed: every write route → 409 writes_closed with ZERO DB calls, for every role that has it', async () => {
  for (const role of ALL_ROLES) {
    for (const [p, method, body, fn] of WRITES) {
      if (DELETE_TYPE.includes(fn) && !['owner', 'dispatcher'].includes(role)) continue;
      calls.length = 0;
      const r = await call(role, method, p, body);
      assert.equal(r.status, 409, `${role} ${method} ${p}: ${r.text}`);
      assert.deepEqual(r.json, WRITES_CLOSED);
      assert.equal(calls.length, 0, `${method} ${p}: no DB call`);
    }
  }
});

test('writes closed: dry_run passes ONLY on the four RPCs that support it; elsewhere it is still 409', async () => {
  for (const fn of DRY_CAPABLE) on('POST', `rpc/${fn}`, (u, b) => json({ ok: true, op: fn, dry_run: true, needs_confirm: false, confirm_token: 'tok', consequences: [], echo: b }));
  for (const [p, method, body, fn, merged] of WRITES) {
    calls.length = 0;
    const r = await call('dispatcher', method, p, { ...body, dry_run: true });
    if (DRY_CAPABLE.includes(fn)) {
      assert.equal(r.status, 200, `${p}: ${r.text}`);
      assert.deepEqual(rpcCalls().map((c) => c.table), [`rpc/${fn}`]);
      assert.deepEqual(rpcCalls()[0].body, { p: { ...body, dry_run: true, ...merged }, p_actor: 'tester', p_role: 'dispatcher' });
      assert.equal(r.json.dry_run, true);
    } else {
      // plan_orders_create & co. have no dry run — the flag would be ignored
      // by the DB and the row written: the switch must not open for it.
      assert.equal(r.status, 409, `${p} with dry_run must stay closed`);
      assert.equal(calls.length, 0);
    }
  }
  // strictly the boolean true
  for (const v of ['true', 1, 'yes']) {
    calls.length = 0;
    assert.equal((await call('owner', 'POST', '/plan/delete', { nat_order_id: 17, dry_run: v })).status, 409, `dry_run ${JSON.stringify(v)}`);
    assert.equal(calls.length, 0);
  }
  assert.equal(auditRows().length, 0);
});

// ───────────────────── writes: day L (switch flipped) ─────────────────────
test('writes open: each route → exactly one rpc/plan_* with {p, p_actor = JWT sub, p_role}; reply served as is', async () => {
  for (const [, , , fn] of WRITES) on('POST', `rpc/${fn}`, () => json({ ...OK, op: fn }));
  for (const [p, method, body, fn, merged] of WRITES) {
    calls.length = 0;
    const r = await callOpen('dispatcher', method, p, body);
    assert.equal(r.status, 200, `${method} ${p}: ${r.text}`);
    assert.deepEqual(r.json, { ...OK, op: fn });
    assert.equal(calls.length, 1, `${method} ${p}: one DB call, no audit of its own`);
    assert.equal(calls[0].table, `rpc/${fn}`);
    assert.deepEqual(calls[0].body, { p: { ...body, ...merged }, p_actor: 'tester', p_role: 'dispatcher' });
  }
});

test('decision 41: management, accountant, warehouse write every non-delete route (one RPC, their role); clear and delete 403', async () => {
  for (const [, , , fn] of WRITES) on('POST', `rpc/${fn}`, () => json({ ...OK, op: fn }));
  for (const role of ['management', 'accountant', 'warehouse']) {
    for (const [p, method, body, fn, merged] of WRITES) {
      calls.length = 0;
      const r = await callOpen(role, method, p, body);
      if (DELETE_TYPE.includes(fn)) {
        assert.equal(r.status, 403, `${role} ${method} ${p}: ${r.text}`);
        assert.equal(calls.length, 0, `${role} ${method} ${p}: no DB call`);
      } else {
        assert.equal(r.status, 200, `${role} ${method} ${p}: ${r.text}`);
        assert.deepEqual(calls.map((c) => [c.table, c.body]),
          [[`rpc/${fn}`, { p: { ...body, ...merged }, p_actor: 'tester', p_role: role }]], `${role} ${method} ${p}`);
      }
    }
  }
});

test('decision 44: request_id rides in p as sent on the three creations; a write is never sent twice (500, 503, 409)', async () => {
  const RID = '6f1c2a3e-0000-4000-8000-000000000044';
  const CREATE = [['/plan/orders', { orders: [{ client_id: 1 }] }, 'plan_orders_create'],
    ['/plan/pieces/split', { piece_id: 4, parts: [{ pallets: 12 }, { pallets: 14 }] }, 'plan_split_piece'],
    ['/plan/local-loading', { rt_stop_id: 3, driver_id: 8, truck_id: 2 }, 'plan_local_loading']];
  const FAILS = [
    [() => new Response('<html>bad gateway</html>', { status: 502 }), 500, 'plan_unknown'],
    [() => pgError(500, { code: '57014', hint: null, details: null, message: 'canceling statement due to statement timeout' }), 503, 'slow'],
    [() => pgError(409, { code: '40P01', hint: null, details: null, message: 'deadlock detected' }), 409, 'busy_retry'],
    [() => planReject('request_reused', RID), 422, 'request_reused'],
    [() => planReject('request_missing', 'plan_orders_create'), 422, 'request_missing']];
  for (const [p, body, fn] of CREATE) {
    routes.length = 0;
    // the DB's answer to a repeat (plan_h_replay): the first answer + replayed, served as is
    on('POST', `rpc/${fn}`, () => json({ ...OK, op: fn, replayed: true }));
    calls.length = 0;
    const r = await callOpen('warehouse', 'POST', p, { ...body, request_id: RID });
    assert.equal(r.status, 200, `${p}: ${r.text}`);
    assert.deepEqual(rpcCalls().map((c) => c.body), [{ p: { ...body, request_id: RID }, p_actor: 'tester', p_role: 'warehouse' }]);
    assert.equal(r.json.replayed, true);
    for (const [fail, status, code] of FAILS) {
      routes.length = 0;
      on('POST', `rpc/${fn}`, fail);
      calls.length = 0;
      const f = await callOpen('dispatcher', 'POST', p, { ...body, request_id: RID });
      assert.equal(f.status, status, `${p} ${code}: ${f.text}`);
      assert.equal(f.json.error.code, code);
      assert.equal(rpcCalls().length, 1, `${p} ${code}: one RPC, never a retry by the Worker`);
    }
  }
});

test('writes open: bad bodies → 400 before any DB call; a body id that contradicts the path → 400 id_mismatch', async () => {
  for (const [p, method, raw, code] of [
    ['/plan/orders', 'POST', '{not json', 'bad_json'],
    ['/plan/orders', 'POST', '[1,2]', 'bad_json'],
    ['/plan/orders', 'POST', 'null', 'bad_json'],
    ['/plan/orders', 'POST', '"x"', 'bad_json'],
    ['/plan/rt/5', 'PATCH', JSON.stringify({ rt_id: 6 }), 'id_mismatch'],
    ['/plan/orders/17', 'PATCH', JSON.stringify({ nat_order_id: 18 }), 'id_mismatch']
  ]) {
    calls.length = 0;
    const r = await callOpen('owner', method, p, raw);
    assert.equal(r.status, 400, `${p} ${raw}`);
    assert.equal(r.json.error.code, code);
    assert.equal(calls.length, 0);
  }
  // the same id in body and path is fine; an empty body is {}
  on('POST', 'rpc/plan_rt_update', () => json(OK));
  on('POST', 'rpc/plan_notice_read', () => json({ read_at: '2026-10-22T10:00:00Z', read_by: 'tester', already: false }));
  assert.equal((await callOpen('owner', 'PATCH', '/plan/rt/5', { rt_id: 5 })).status, 200);
  calls.length = 0;
  assert.equal((await callOpen('owner', 'POST', '/plan/notices/12/read')).status, 200);
  assert.deepEqual(calls[0].body, { p: { notice_id: 12 }, p_actor: 'tester', p_role: 'owner' });
});

// cross-cutting input rule (coordinator 25/10): JSON.parse reads 1e999 as Infinity and JSON.stringify would send
// it as null — a rate «cleared» in silence. Refused as bad_input '<field>:finite' before the DB, closed or open.
test('a non-finite number in the body or the path id → 400 bad_input <field>:finite, before any DB call', async () => {
  const nines = '9'.repeat(400);
  for (const [p, method, raw, field] of [
    ['/plan/rt/5', 'PATCH', '{"set":{"partner_rate":1e999}}', 'set.partner_rate'],
    ['/plan/orders', 'POST', '{"orders":[{"client_id":1,"price":-1e999}]}', 'orders[0].price'],
    ['/plan/pieces/split', 'POST', '{"piece_id":4,"parts":[{"pallets":12},{"pallets":1e400}]}', 'parts[1].pallets'],
    ['/plan/move', 'POST', '{"from":{"piece_ids":[1e999]},"target":{"wait":true},"dry_run":true}', 'from.piece_ids[0]'],
    [`/plan/rt/${nines}`, 'PATCH', '{"dry_run":true}', 'rt_id'],
    ['/plan/notices/99999999999999999999/read', 'POST', '{}', 'notice_id']
  ]) {
    for (const fetchOn of [call, callOpen]) {
      calls.length = 0;
      const r = await fetchOn('owner', method, p, raw);
      assert.equal(r.status, 400, `${p.slice(0, 30)} ${raw}: ${r.text}`);
      assert.equal(r.json.error.type, 'BAD_REQUEST');
      assert.equal(r.json.error.code, 'bad_input');
      assert.ok(r.json.error.message.endsWith(`(${field}:finite)`), r.json.error.message);
      assert.equal(calls.length, 0, `${p.slice(0, 30)}: no DB call`);
    }
  }
  // the largest finite number still reaches the DB as sent (the DB's own checks judge it)
  on('POST', 'rpc/plan_rt_update', () => json(OK));
  calls.length = 0;
  const r = await callOpen('owner', 'PATCH', '/plan/rt/5', '{"set":{"partner_rate":1e308}}');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(rpcCalls()[0].body, { p: { set: { partner_rate: 1e308 }, rt_id: 5 }, p_actor: 'tester', p_role: 'owner' });
});

// ───────────────────── refusals → the one /plan/* error shape ─────────────────────
test('plan:<code> → 422 PLAN_RULE with the Greek text + the DB detail; nothing audited by the Worker', async () => {
  on('POST', 'rpc/plan_put_pieces', () => planReject('truck_busy', 'RT-1280'));
  const r = await callOpen('dispatcher', 'POST', '/plan/legs', { pieces: [{ piece_id: 4 }], target: { rt_id: 5, side: 'ANODOS' }, stops: [] });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, { error: { type: 'PLAN_RULE', code: 'truck_busy', message: 'Το φορτηγό είναι ήδη σε άλλο δρομολόγιο εκείνες τις ώρες (RT-1280)' } });
  assert.equal(auditRows().length, 0);
});

test('need_token → 428 (the screen opens the list), stale_confirm → 422', async () => {
  on('POST', 'rpc/plan_delete', (u, b) => (b.p.confirm_token ? planReject('stale_confirm', '17') : planReject('need_token', '17')));
  let r = await callOpen('owner', 'POST', '/plan/delete', { nat_order_id: 17, reason: 'x' });
  assert.equal(r.status, 428, r.text);
  assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'need_token', message: 'Η πράξη θέλει επιβεβαίωση — δες πρώτα τη λίστα συνεπειών (17)' });
  r = await callOpen('owner', 'POST', '/plan/delete', { nat_order_id: 17, reason: 'x', confirm_token: 'old' });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'stale_confirm');
});

test('23P01 at the RPC\'s COMMIT (071b EXCLUDE) → 422 truck_busy / driver_busy', async () => {
  for (const [name, code] of [['rt_v2_truck_once', 'truck_busy'], ['rt_v2_driver_once', 'driver_busy']]) {
    routes.length = 0;
    on('POST', 'rpc/plan_rt_update', () => pgError(409, { code: '23P01', details: 'Key conflicts with existing key.', hint: null, message: `conflicting key value violates exclusion constraint "${name}"` }));
    const r = await callOpen('dispatcher', 'PATCH', '/plan/rt/5', { set: { truck_id: 2 } });
    assert.equal(r.status, 422, r.text);
    assert.equal(r.json.error.code, code);
  }
});

test('mapping of plan:vehicle_clear_use_clear (owner 25/10) → 422 PLAN_RULE with the owner\'s text, one RPC (what the DB refuses: rule cases B102-B113)', async () => {
  // the stub refuses every body: this pins the Worker's mapping only, never which change the DB refuses
  on('POST', 'rpc/plan_rt_update', () => planReject('vehicle_clear_use_clear', ''));
  for (const set of [{ truck_id: null }, { driver_id: null }, { trailer_id: null }, { trip_type: 'OWNED' }]) {
    calls.length = 0;
    const r = await callOpen('warehouse', 'PATCH', '/plan/rt/5', { set });
    assert.equal(r.status, 422, `${JSON.stringify(set)}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'vehicle_clear_use_clear', message: 'Για να βγει το όχημα, χρησιμοποίησε «Καθαρισμός ανάθεσης».' });
    assert.equal(rpcCalls().length, 1);
  }
});

test('072 missing in the DB (PostgREST 404 PGRST202) → 503 schema_behind, on reads and dry runs alike', async () => {
  const missing = () => pgError(404, { code: 'PGRST202', details: 'Searched for the function public.plan_board with parameters p_role, p_week', hint: null, message: 'Could not find the function public.plan_board(p_role, p_week) in the schema cache' });
  on('POST', 'rpc/plan_board', missing);
  on('POST', 'rpc/plan_delete', missing);
  for (const [method, p, body] of [['GET', '/plan/board?week=2026-10-10'], ['POST', '/plan/delete', { nat_order_id: 1, dry_run: true }]]) {
    const r = await call('owner', method, p, body);
    assert.equal(r.status, 503, `${p}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SCHEMA_BEHIND', code: 'schema_behind', message: 'Η βάση δεν έχει ακόμη το migration 072 (Εβδομαδιαίο Εθνικών) — ενημέρωσε τον Δημήτρη' });
  }
  // after a rollback of 072, until PostgREST reloads its cache, the call reaches Postgres: a 42883 naming the
  // RPC itself is the same «072 missing»; a 42883 of an inner function is a bug of 072 and stays the 500 path
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(404, { code: '42883', details: null, hint: null, message: 'function plan_board(date, text) does not exist' }));
  let r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.error.code, 'schema_behind');
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(400, { code: '42883', details: null, hint: null, message: 'function plan_h_raise(text) does not exist' }));
  r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 500, r.text);
  // the GRANT of PART 5 missing on the RPC itself (42501): named, never the retried 500
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(401, { code: '42501', details: null, hint: null, message: 'permission denied for function plan_board' }));
  r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 503, r.text);
  assert.deepEqual(r.json.error, { type: 'SCHEMA_BEHIND', code: 'db_grant', message: 'Η βάση δεν δίνει δικαίωμα κλήσης στο plan_board — ενημέρωσε τον Δημήτρη' });
});

test('another named DB constraint inside /plan/* → loud 422 naming it; an unnamed 23514 → 422 with the DB text', async () => {
  on('POST', 'rpc/plan_rt_update', () => pgError(400, { code: '23514', hint: null, details: null, message: 'new row for relation "ct_round_trips" violates check constraint "ct_round_trips_trip_type_check"' }));
  let r = await callOpen('owner', 'PATCH', '/plan/rt/5', { set: { trip_type: 'X' } });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'ct_round_trips_trip_type_check', message: 'Κανόνας βάσης ct_round_trips_trip_type_check' });
  routes.length = 0;
  on('POST', 'rpc/plan_orders_create', () => pgError(400, { code: '23514', hint: null, details: null, message: 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή' }));
  r = await callOpen('owner', 'POST', '/plan/orders', { orders: [] });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'db_rule', message: 'Κανόνας βάσης: Δεν σημαίνεται τιμολογημένη χωρίς τιμή' });
});

test('anything else → 500 in the /plan/* shape naming the route (never a CF 1101, never {}); a write says it may have happened', async () => {
  on('POST', 'rpc/plan_split_piece', () => new Response('<html>bad gateway</html>', { status: 502 }));
  let r = await callOpen('dispatcher', 'POST', '/plan/pieces/split', { piece_id: 4, parts: [] });
  assert.equal(r.status, 500, r.text);
  // the link may have dropped AFTER the COMMIT: a write never says «not done» (αρχή 1, decision 44)
  assert.deepEqual(r.json.error, { type: 'SERVER', code: 'plan_unknown', message: 'Η πράξη POST /plan/split μπορεί να αποθηκεύτηκε — έλεγξε πρώτα στο Εβδομαδιαίο Εθνικών αν φαίνεται, και μόνο αν λείπει ξαναπάτησε το ίδιο κουμπί· ενημέρωσε τον Δημήτρη' });
  // never «refresh» as the fix: a refresh closes the form, and with it its request_id (decision 44, review of PR #84)
  assert.ok(!/ανανέωσε/.test(r.json.error.message));
  routes.length = 0;
  on('POST', 'rpc/plan_delete', () => new Response('<html>bad gateway</html>', { status: 502 }));
  r = await call('owner', 'POST', '/plan/delete', { nat_order_id: 1, dry_run: true });
  assert.equal(r.status, 500, r.text);
  assert.equal(r.json.error.code, 'plan_failed', 'a dry run wrote nothing');
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => new Response('not json', { status: 200 }));
  r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 500);
  assert.equal(r.json.error.code, 'plan_failed');
});

test('a lost lock (40P01 / 40001 / 55P03) → 409 busy_retry; statement_timeout (57014) → 503 slow; never the 500 path', async () => {
  for (const code of ['40P01', '40001', '55P03']) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(409, { code, hint: null, details: null, message: 'deadlock detected' }));
    const r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 409, `${code}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'busy_retry', message: 'Ταυτόχρονη αλλαγή από άλλον χρήστη — τίποτα δεν γράφτηκε· ξαναδοκίμασε' });
  }
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(500, { code: '57014', hint: null, details: null, message: 'canceling statement due to statement timeout' }));
  const r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.error.code, 'slow');
});

// ───────────────────── amounts (decision 9: the DB cuts; the Worker trips) ─────────────────────
// decision 10: a payroll line carries its month, never «paid»
const WITH_AMOUNT = { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: true, confirm_token: 'tok',
  consequences: [{ kind: 'payroll_amount', rt_id: 5, dl_entry_id: 99, month: '2026-10', amount: 230 }] };
const WITHOUT_AMOUNT = { ...WITH_AMOUNT, consequences: [{ kind: 'payroll_amount', rt_id: 5, dl_entry_id: 99, month: '2026-10' }] };
// the move's dry run: an act every role has (decision 41), so the tripwire is tested for each of them
const MOVE_DRY = { from: { piece_ids: [4] }, target: { wait: true }, dry_run: true };

test('an amount is served to owner and accountant, never to dispatcher, management or warehouse (500 amount_leak, the number not in the body)', async () => {
  // a DB bug answering an amount to every role — the Worker must trip on it
  on('POST', 'rpc/plan_move_pieces', () => json(WITH_AMOUNT));
  let r;
  for (const role of ['owner', 'accountant']) {
    r = await call(role, 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.equal(r.json.consequences[0].amount, 230);
  }
  for (const role of ['dispatcher', 'management', 'warehouse']) {
    r = await call(role, 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.status, 500, `${role}: ${r.text}`);
    assert.equal(r.json.error.code, 'amount_leak');
    assert.ok(!r.text.includes('230'), 'the number never leaves the Worker');
    assert.ok(!/"amount"/.test(r.text));
  }
  routes.length = 0;
  on('POST', 'rpc/plan_move_pieces', () => json(WITHOUT_AMOUNT));
  for (const role of ['dispatcher', 'management', 'warehouse']) {
    r = await call(role, 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.ok(!/"amount"/.test(r.text), 'no amount key anywhere in the body');
    assert.equal(rpcCalls().at(-1).body.p_role, role, 'the role the DB cuts by');
  }
  // every money key the DB cuts trips it, not only `amount` (PLAN_MONEY_KEYS = plan_h_strip_amounts' list)
  for (const k of ['advance', 'expenses', 'invoice_number']) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => json({ ...WITHOUT_AMOUNT, consequences: [{ kind: 'local_payroll', dl_entry_id: 1, [k]: 20 }] }));
    r = await call('warehouse', 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.status, 500, `${k}: ${r.text}`);
    assert.equal(r.json.error.code, 'amount_leak');
  }
});

// ───────────────────── the dry run's conflict speaks Greek (one source of texts) ─────────────────────
test('plan_rt_update dry run: preview.conflict gets its message from PLAN_RULE_TEXT / PLAN_CHECK_TEXT (F4 keeps no copy)', async () => {
  const preview = (conflict) => ({ ok: true, op: 'plan_rt_update', dry_run: true,
    preview: { before: {}, after: null, next_rt: null, vs_day: [], warnings: [], conflict } });
  on('POST', 'rpc/plan_rt_update', () => json(preview({ code: 'leg_order', sqlstate: '23514', detail: '31' })));
  let r = await call('dispatcher', 'PATCH', '/plan/rt/5', { stops: [], dry_run: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.preview.conflict, { code: 'leg_order', sqlstate: '23514', detail: '31',
    message: 'Η φόρτωση γίνεται πριν από την εκφόρτωση στο ίδιο δρομολόγιο (31)' });
  routes.length = 0;
  on('POST', 'rpc/plan_rt_update', () => json(preview({ code: 'rt_v2_window', sqlstate: '23514', detail: null })));
  r = await call('dispatcher', 'PATCH', '/plan/rt/5', { dry_run: true });
  assert.equal(r.json.preview.conflict.message, 'Το δρομολόγιο θέλει ώρα αρχής πριν από την ώρα τέλους');
  routes.length = 0;
  on('POST', 'rpc/plan_rt_update', () => json(preview({ code: 'brand_new_rule', sqlstate: '23514', detail: null })));
  r = await call('dispatcher', 'PATCH', '/plan/rt/5', { dry_run: true });
  assert.equal(r.json.preview.conflict.message, 'Κανόνας βάσης brand_new_rule', 'a rule the texts do not know is still named');
  routes.length = 0;
  on('POST', 'rpc/plan_rt_update', () => json(preview(null)));
  r = await call('dispatcher', 'PATCH', '/plan/rt/5', { dry_run: true });
  assert.equal(r.json.preview.conflict, null, 'no conflict: untouched');
});

// ───────────────────── the older paths ─────────────────────
test('PATCH /costs/rt/:id on a v5 cycle (model 2) → 409 in Greek, no PATCH; a v1 cycle is patched as today', async () => {
  on('GET', 'ct_round_trips', (u) => json([{ id: Number(u.searchParams.get('id').slice(3)), model: u.searchParams.get('id') === 'eq.5' ? 2 : 1, status: 'planned', date_start: '2026-10-12' }]));
  on('PATCH', 'ct_round_trips', (u, b) => json([{ id: 7, model: 1, ...b }]));
  let r = await call('dispatcher', 'PATCH', '/costs/rt/5', { date_start: '2026-10-13' });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json, { error: 'Ο κύκλος ανήκει στο Εβδομαδιαίο Εθνικών — αλλάζει μόνο από εκεί' });
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.equal(auditRows().length, 0);
  calls.length = 0;
  r = await call('dispatcher', 'PATCH', '/costs/rt/7', { date_start: '2026-10-13' });
  assert.equal(r.status, 200, r.text);
  assert.equal(calls.filter((c) => c.method === 'PATCH' && c.table === 'ct_round_trips').length, 1);
  assert.equal(auditRows().length, 1);
});

test('facade PATCH ORDER STOPS refused by a plan: rule (bridge stop, 071) or by order_stops_via_hub_intl → 422, not 500', async () => {
  const STOPS = '/v0/appTEST/tblaeY5QOHAS1gyE8';
  on('GET', 'order_stops', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 31, legacy_id: 'recSTOP1', pallets: 20, via_hub: false }]) : null));
  on('PATCH', 'order_stops', (u, b) => (b.via_hub !== undefined
    ? pgError(400, { code: '23514', hint: null, details: null, message: 'new row for relation "order_stops" violates check constraint "order_stops_via_hub_intl"' })
    : planReject('pieces_sum', '12:19<>20')));
  let r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { Pallets: 19 } });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, { error: { type: 'PLAN_RULE', code: 'pieces_sum', message: 'Τα κομμάτια δεν αθροίζουν στις παλέτες της αποστολής (12:19<>20)' } });
  r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { 'Via Hub': true } });
  assert.equal(r.status, 422, r.text);
  assert.equal(r.json.error.code, 'order_stops_via_hub_intl');
  const patch = calls.filter((c) => c.method === 'PATCH').at(-1);
  assert.deepEqual(patch.body, { via_hub: true }, '"Via Hub" reaches via_hub (no silent drop)');
  assert.equal(auditRows().length, 0);
});
