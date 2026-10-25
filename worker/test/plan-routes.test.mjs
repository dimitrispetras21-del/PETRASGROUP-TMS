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
//     missing 072 → 503, another named constraint → 422, input the DB cannot
//     take (22P02/22003/22007/22008, 23502, on a write) → 422, anything else → 500 naming the route, and a
//     write whose outcome is unknown → 422 plan_unknown (a status the legacy
//     client never sends again by itself) — every one in the ONE /plan/* error shape;
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
const realFetch = globalThis.fetch;
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
// the real fetch back after each test (review of PR #90, finding 14): hygiene inside this file only — node --test
// runs each file in its own process, so no other file could meet the stub (r2 finding 10)
afterEach(() => { Object.assign(console, realConsole); globalThis.fetch = realFetch; });
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

test('decision 44: request_id rides in p as sent on the three creations; a write is never sent twice (422 plan_unknown, 503, 409)', async () => {
  const RID = '6f1c2a3e-0000-4000-8000-000000000044';
  const CREATE = [['/plan/orders', { orders: [{ client_id: 1 }] }, 'plan_orders_create'],
    ['/plan/pieces/split', { piece_id: 4, parts: [{ pallets: 12 }, { pallets: 14 }] }, 'plan_split_piece'],
    ['/plan/local-loading', { rt_stop_id: 3, driver_id: 8, truck_id: 2 }, 'plan_local_loading']];
  const FAILS = [
    [() => new Response('<html>bad gateway</html>', { status: 502 }), 422, 'plan_unknown'],
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
    // 1e20 is finite but not a safe integer: the name a body id gets too (r2 finding 7)
    ['/plan/notices/99999999999999999999/read', 'POST', '{}', 'notice_id:safe_integer']
  ]) {
    for (const fetchOn of [call, callOpen]) {
      calls.length = 0;
      const r = await fetchOn('owner', method, p, raw);
      assert.equal(r.status, 400, `${p.slice(0, 30)} ${raw}: ${r.text}`);
      assert.equal(r.json.error.type, 'BAD_REQUEST');
      assert.equal(r.json.error.code, 'bad_input');
      assert.ok(r.json.error.message.endsWith(`(${field.includes(':') ? field : `${field}:finite`})`), r.json.error.message);
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

test('anything else → 500 in the /plan/* shape naming the route (never a CF 1101, never {}); a write says it may have happened (422)', async () => {
  on('POST', 'rpc/plan_split_piece', () => new Response('<html>bad gateway</html>', { status: 502 }));
  let r = await callOpen('dispatcher', 'POST', '/plan/pieces/split', { piece_id: 4, parts: [] });
  // 422, never a 5xx: core/api.js _atRetry would send it twice more by itself (review of PR #90, finding 1)
  assert.equal(r.status, 422, r.text);
  // the link may have dropped AFTER the COMMIT: a write never says «not done» (αρχή 1, decision 44); the route is
  // named by its path (finding 12), never by its resource («POST /plan/split» does not exist)
  assert.deepEqual(r.json.error, { type: 'OUTCOME_UNKNOWN', code: 'plan_unknown', message: 'Η πράξη POST /plan/pieces/split μπορεί να αποθηκεύτηκε — έλεγξε πρώτα στο Εβδομαδιαίο Εθνικών αν φαίνεται, και μόνο αν λείπει ξαναπάτησε το ίδιο κουμπί· ενημέρωσε τον Δημήτρη' });
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

test('a lost lock (40P01 / 40001 / 55P03) → 409 busy_retry; statement_timeout (57014) → 503 slow; never the 500 path; a read never speaks of writing', async () => {
  for (const code of ['40P01', '40001', '55P03']) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(409, { code, hint: null, details: null, message: 'deadlock detected' }));
    const r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 409, `${code}: ${r.text}`);
    // SERVER, as `slow`: transient, never the business-refusal family PLAN_RULE (finding 13)
    assert.deepEqual(r.json.error, { type: 'SERVER', code: 'busy_retry', message: 'Ταυτόχρονη αλλαγή από άλλον χρήστη — τίποτα δεν γράφτηκε· ξαναδοκίμασε' });
  }
  // a write's statement_timeout: rolled back, and its text says so (polish review 2 r2 m1)
  routes.length = 0;
  on('POST', 'rpc/plan_move_pieces', () => pgError(500, { code: '57014', hint: null, details: null, message: 'canceling statement due to statement timeout' }));
  const w = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
  assert.equal(w.status, 503, w.text);
  assert.deepEqual(w.json.error, { type: 'SERVER', code: 'slow', message: 'Η βάση άργησε να απαντήσει — τίποτα δεν γράφτηκε· ξαναδοκίμασε σε λίγο' });
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(500, { code: '57014', hint: null, details: null, message: 'canceling statement due to statement timeout' }));
  const r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.error.code, 'slow');
  // a read writes nothing: its text never speaks of writing (polish review 2 M2)
  assert.equal(r.json.error.message, 'Η βάση άργησε να απαντήσει — η πράξη GET /plan/board δεν ολοκληρώθηκε· ξαναδοκίμασε σε λίγο');
  routes.length = 0;
  on('POST', 'rpc/plan_board', () => pgError(409, { code: '40001', hint: null, details: null, message: 'could not serialize access due to concurrent update' }));
  const b = await call('owner', 'GET', '/plan/board?week=2026-10-10');
  assert.equal(b.status, 409, b.text);
  assert.deepEqual(b.json.error, { type: 'SERVER', code: 'busy_retry', message: 'Ταυτόχρονη αλλαγή από άλλον χρήστη — η πράξη GET /plan/board δεν ολοκληρώθηκε· ξαναδοκίμασε' });
});

// ───────────────────── amounts (decision 9: the DB cuts; the Worker trips) ─────────────────────
// decision 10: a payroll line carries its month, never «paid»
const WITH_AMOUNT = { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: true, confirm_token: 'tok',
  consequences: [{ kind: 'payroll_amount', rt_id: 5, dl_entry_id: 99, month: '2026-10', amount: 230 }] };
const WITHOUT_AMOUNT = { ...WITH_AMOUNT, consequences: [{ kind: 'payroll_amount', rt_id: 5, dl_entry_id: 99, month: '2026-10' }] };
// the move's dry run: an act every role has (decision 41), so the tripwire is tested for each of them
const MOVE_DRY = { from: { piece_ids: [4] }, target: { wait: true }, dry_run: true };

test('an amount is served to owner and accountant, never to dispatcher, management or warehouse (422 amount_leak, the number not in the body)', async () => {
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
    assert.equal(r.status, 422, `${role}: ${r.text}`);
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
    assert.equal(r.status, 422, `${k}: ${r.text}`);
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

test('facade PATCH ORDER STOPS refused by a plan: rule (bridge stop, 071) → 422; «Via Hub» born closed until day L, then order_stops_via_hub_intl → 422', async () => {
  const STOPS = '/v0/appTEST/tblaeY5QOHAS1gyE8';
  on('GET', 'order_stops', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 31, legacy_id: 'recSTOP1', pallets: 20, via_hub: false }]) : null));
  on('PATCH', 'order_stops', (u, b) => (b.via_hub !== undefined
    ? pgError(400, { code: '23514', hint: null, details: null, message: 'new row for relation "order_stops" violates check constraint "order_stops_via_hub_intl"' })
    : planReject('pieces_sum', '12:19<>20')));
  let r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { Pallets: 19 } });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, { error: { type: 'PLAN_RULE', code: 'pieces_sum', message: 'Τα κομμάτια δεν αθροίζουν στις παλέτες της αποστολής (12:19<>20)' } });
  // before day L (finding 8, αρχή 5): a write naming «Via Hub» — alone, beside another field, single or batch —
  // is refused before any DB call, never dropped with a 200
  for (const [method, p, body] of [['PATCH', `${STOPS}/recSTOP1`, { fields: { 'Via Hub': true } }],
    ['PATCH', `${STOPS}/recSTOP1`, { fields: { Pallets: 19, 'Via Hub': false } }],
    ['PATCH', STOPS, { records: [{ id: 'recSTOP1', fields: { 'Via Hub': true } }] }],
    ['POST', STOPS, { fields: { 'Via Hub': true } }]]) {
    calls.length = 0;
    r = await call('owner', method, p, body);
    assert.equal(r.status, 400, `${method} ${JSON.stringify(body)}: ${r.text}`);
    assert.match(r.json.error.message || r.json.error, /«Via Hub»: γράφεται από την ημέρα της μετάβασης/);
    assert.equal(calls.filter((c) => c.method !== 'GET').length, 0, 'nothing written');
  }
  // day L (the one switch flipped): the label reaches via_hub (no silent drop) and the CHECK speaks Greek
  calls.length = 0;
  r = await callOpen('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { 'Via Hub': true } });
  assert.equal(r.status, 422, r.text);
  assert.equal(r.json.error.code, 'order_stops_via_hub_intl');
  const patch = calls.filter((c) => c.method === 'PATCH').at(-1);
  assert.deepEqual(patch.body, { via_hub: true }, '"Via Hub" reaches via_hub (no silent drop)');
  // and it is still read by every path
  r = await call('dispatcher', 'GET', `${STOPS}/recSTOP1`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.fields['Via Hub'], false, 'read as the DB holds it');
  assert.equal(auditRows().length, 0);
});

// ───────────────────── K1 review r1: what a write's failure says ─────────────────────
test('a write the DB answered with an unmapped SQLSTATE rolled back → 500 plan_failed «δεν ολοκληρώθηκε», never plan_unknown', async () => {
  // 22P02 / 23502 moved to the 422 bad_input test below (finding 5); a class-22 fault of 072 itself stays here (r2 finding 2)
  for (const pg of [{ code: '42883', message: 'function public.plan_h_missing(bigint) does not exist' },
    { code: '22012', message: 'division by zero' }, { code: '22004', message: 'null value not allowed' },
    { code: '22023', message: 'invalid parameter value' }, { code: '22001', message: 'value too long for type character varying(20)' },
    { code: 'P0001', message: 'raise without a plan: hint' },
    // polish review 2 r2 m1: idle-in-transaction fires only while the session is idle, before any COMMIT
    { code: '25P03', message: 'terminating connection due to idle-in-transaction timeout' }]) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(400, { ...pg, hint: null, details: null }));
    calls.length = 0;
    const r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 500, `${pg.code}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SERVER', code: 'plan_failed', message: 'Η πράξη POST /plan/move δεν ολοκληρώθηκε — ενημέρωσε τον Δημήτρη' }, pg.code);
    assert.equal(rpcCalls().length, 1, `${pg.code}: one RPC, never a second`);
  }
});

test('amount_leak after a write says the act was kept and must not be pressed again; a dry run keeps the plain text', async () => {
  on('POST', 'rpc/plan_move_pieces', () => json({ ...WITH_AMOUNT, dry_run: false, needs_confirm: undefined }));
  let r = await callOpen('warehouse', 'POST', '/plan/move', { from: { piece_ids: [4] }, target: { wait: true } });
  // the COMMIT is done: a status the legacy client never sends again (finding 1), one RPC
  assert.equal(r.status, 422, r.text);
  assert.equal(r.json.error.code, 'amount_leak');
  assert.equal(rpcCalls().length, 1);
  assert.match(r.json.error.message, /^Η πράξη αποθηκεύτηκε, .*μην την ξαναπατήσεις/);
  assert.ok(!r.text.includes('230'), 'the number never leaves the Worker');
  r = await call('warehouse', 'POST', '/plan/move', MOVE_DRY);
  assert.equal(r.status, 422, r.text);
  assert.equal(r.json.error.message, 'Η απάντηση της βάσης είχε ποσά για ρόλο χωρίς δικαίωμα — δεν στάλθηκε· ενημέρωσε τον Δημήτρη');
});

// ───────────────────── K1 review r2: a lost answer with a JSON body; the preview's code ─────────────────────
test('a write answered by a JSON body without a SQLSTATE (gateway 502 / 504, PGRST000), class 08, a FATAL (57P, 25P04) or a class a PANIC carries (58, XX) → plan_unknown; a dry run → plan_failed', async () => {
  const LOST = [[502, { message: 'An invalid response was received from the upstream server' }],
    [504, { message: 'The upstream server is timing out' }],
    [503, { code: 'PGRST000', details: 'connection to server failed', hint: null, message: 'Could not connect with the database' }],
    [500, { code: '08006', details: null, hint: null, message: 'could not send data to client: Broken pipe' }],
    // polish review I1: these FATAL terminations can follow the COMMIT, so they prove no rollback
    [503, { code: '57P01', details: null, hint: null, message: 'terminating connection due to administrator command' }],
    [503, { code: '57P02', details: null, hint: null, message: 'terminating connection because of crash of another server process' }],
    // polish review 2 M1: transaction_timeout (PG 17) is FATAL as well
    [503, { code: '25P04', details: null, hint: null, message: 'terminating connection due to transaction timeout' }],
    // polish review 2 r2 m3: PostgREST forwards no severity, and these PANICs can follow the commit record
    [500, { code: '58030', details: null, hint: null, message: 'could not fsync file "pg_wal/000000010000000000000001": Input/output error' }],
    [500, { code: 'XX000', details: null, hint: null, message: 'cannot abort transaction 1234, it was already committed' }]];
  for (const [status, body] of LOST) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(status, body));
    calls.length = 0;
    let r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 422, `${status} ${body.code || ''}: ${r.text}`);
    assert.equal(r.json.error.type, 'OUTCOME_UNKNOWN');
    // the COMMIT may have happened before the link dropped: never «δεν ολοκληρώθηκε» (decision 44, αρχή 1)
    assert.equal(r.json.error.code, 'plan_unknown', `${status} ${body.code || ''}`);
    assert.equal(rpcCalls().length, 1, `${status}: one RPC, never a second`);
    r = await call('dispatcher', 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.json.error.code, 'plan_failed', `${status}: a dry run wrote nothing`);
  }
});

test('plan_rt_update dry run: a constraint with a 072 code of its own is previewed under that code and text, as its execution answers', async () => {
  const preview = (conflict) => ({ ok: true, op: 'plan_rt_update', dry_run: true,
    preview: { before: {}, after: null, next_rt: null, vs_day: [], warnings: [], conflict } });
  for (const [name, sqlstate, code] of [['rt_v2_truck_once', '23P01', 'truck_busy'], ['rt_v2_driver_once', '23P01', 'driver_busy'],
    ['local_moves_nat_loading_once', '23505', 'local_exists']]) {
    routes.length = 0;
    const message = sqlstate === '23P01' ? `conflicting key value violates exclusion constraint "${name}"`
      : `duplicate key value violates unique constraint "${name}"`;
    on('POST', 'rpc/plan_rt_update', (u, b) => (b.p.dry_run === true ? json(preview({ code: name, sqlstate, detail: null }))
      : pgError(409, { code: sqlstate, details: null, hint: null, message })));
    const exec = await callOpen('dispatcher', 'PATCH', '/plan/rt/5', { set: { truck_id: 2 } });
    assert.equal(exec.status, 422, `${name}: ${exec.text}`);
    assert.equal(exec.json.error.code, code, name);
    const dry = await call('dispatcher', 'PATCH', '/plan/rt/5', { set: { truck_id: 2 }, dry_run: true });
    assert.equal(dry.status, 200, `${name}: ${dry.text}`);
    assert.deepEqual(dry.json.preview.conflict, { code, sqlstate, detail: null, message: exec.json.error.message }, name);
  }
});

// ───────────────────── K1 review r3 m1: an answer that proves the RPC never ran ─────────────────────
test('a write the gateway refused (401 / 403, any body) or PostgREST never ran (PGRST003) → 503 «δεν αποθηκεύτηκε», never plan_unknown; a read → «δεν εκτελέστηκε»', async () => {
  const NOT_RUN = [
    [401, { message: 'Invalid API key' }, 'db_refused'],
    [401, { code: 'PGRST301', details: null, hint: null, message: 'JWSError (CompactDecodeError Invalid number of parts: Expected 3 parts; got 1)' }, 'db_refused'],
    [403, { message: 'Forbidden' }, 'db_refused'],
    [403, '<html><body>403 Forbidden</body></html>', 'db_refused'],
    [504, { code: 'PGRST003', details: null, hint: null, message: 'Timed out acquiring connection from connection pool.' }, 'slow']];
  for (const [status, body, code] of NOT_RUN) {
    const label = `${status} ${typeof body === 'string' ? 'page' : body.code || body.message}`;
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(status, body));
    calls.length = 0;
    let r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 503, `${label}: ${r.text}`);
    assert.equal(r.json.error.code, code, label);
    assert.equal(r.json.error.message, code === 'slow'
      ? 'Η βάση δεν είχε ελεύθερη σύνδεση — τίποτα δεν αποθηκεύτηκε· ξαναδοκίμασε σε λίγο'
      : `Η βάση αρνήθηκε την κλήση (${status}) — η πράξη POST /plan/move δεν αποθηκεύτηκε· ενημέρωσε τον Δημήτρη`, label);
    assert.equal(rpcCalls().length, 1, `${label}: one RPC, never a second`);
    r = await call('dispatcher', 'POST', '/plan/move', MOVE_DRY);
    assert.equal(r.json.error.code, code, `${label}: a dry run says the same`);
    // a read saves nothing: the same code, a text that never says «αποθηκεύτηκε» (polish review m1)
    routes.length = 0;
    on('POST', 'rpc/plan_board', () => pgError(status, body));
    r = await call('dispatcher', 'GET', '/plan/board?week=2026-10-10');
    assert.equal(r.status, 503, `${label} read: ${r.text}`);
    assert.equal(r.json.error.code, code, `${label} read`);
    assert.equal(r.json.error.message, code === 'slow'
      ? 'Η βάση δεν είχε ελεύθερη σύνδεση — η πράξη GET /plan/board δεν εκτελέστηκε· ξαναδοκίμασε σε λίγο'
      : `Η βάση αρνήθηκε την κλήση (${status}) — η πράξη GET /plan/board δεν εκτελέστηκε· ενημέρωσε τον Δημήτρη`, `${label} read`);
  }
  // a 403 that carries a real SQLSTATE stays with it: an inner 42501 rolled back (plan_failed), the RPC's own is db_grant
  routes.length = 0;
  on('POST', 'rpc/plan_move_pieces', () => pgError(403, { code: '42501', details: null, hint: null, message: 'permission denied for table piece_legs' }));
  const r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
  assert.equal(r.status, 500, r.text);
  assert.equal(r.json.error.code, 'plan_failed');
});

// ───────────────────── review of PR #90 (Worker 39842d18), round 1 ─────────────────────
// finding 1, the Worker's side of the pin (the client's side: tests/api-plan-no-resend.test.mjs): the status of
// an answer whose write may be kept is one core/api.js _atRetry answers at once, never sends again by itself.
test('finding 1: plan_unknown / amount_leak use a status the legacy _atRetry never retries (read from core/api.js)', async () => {
  const { readFileSync } = await import('node:fs');
  const api = readFileSync(path.resolve(HERE, '../../core/api.js'), 'utf8');
  const noRetry = /if \(res\.status === 400 \|\| res\.status === 422\) \{[\s\S]*?_e\._noRetry = true;/.exec(api);
  assert.ok(noRetry, 'core/api.js: the 400/422 branch that throws _noRetry is gone — PLAN_NO_RESEND must follow it');
  const src = readFileSync(SRC_PATH, 'utf8');
  assert.equal((src.match(/^var PLAN_NO_RESEND = (\d+);$/m) || [])[1], '422');
  for (const code of ['plan_unknown', 'amount_leak']) {
    assert.ok(new RegExp(`planError\\(PLAN_NO_RESEND, "[A-Z_]+", "${code}"`).test(src), `${code} answers PLAN_NO_RESEND`);
    assert.ok(!new RegExp(`planError\\(5\\d\\d, "[A-Z_]+", "${code}"`).test(src), `${code} never a 5xx`);
  }
});

test('finding 5 (narrowed in r2 finding 2): input the DB cannot take → 422 bad_input with the SQLSTATE and «ενημέρωσε τον Δημήτρη», one RPC; on a read → 500 plan_failed', async () => {
  for (const pg of [{ code: '22P02', message: 'invalid input syntax for type bigint: "abc"' },
    { code: '22003', message: 'value "99999999999" is out of range for type integer' },
    { code: '22007', message: 'invalid input syntax for type timestamp with time zone: "x"' },
    { code: '22008', message: 'date/time field value out of range: "2026-13-45"' },
    { code: '23502', message: 'null value in column "rt_id" violates not-null constraint' }]) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(400, { ...pg, hint: null, details: null }));
    calls.length = 0;
    let r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } });
    assert.equal(r.status, 422, `${pg.code}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'BAD_REQUEST', code: 'bad_input', message: `Το αίτημα δεν έχει τη μορφή που περιμένει η βάση — ανανέωσε τη σελίδα· αν ξανασυμβεί, ενημέρωσε τον Δημήτρη (${pg.code})` }, pg.code);
    assert.equal(rpcCalls().length, 1, `${pg.code}: one RPC`);
    // a read's arguments are the Worker's own (checked before the DB): the same SQLSTATE there is a fault of 072
    routes.length = 0;
    on('POST', 'rpc/plan_board', () => pgError(400, { ...pg, hint: null, details: null }));
    r = await call('owner', 'GET', '/plan/board?week=2026-10-10');
    assert.equal(r.status, 500, `${pg.code} read: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SERVER', code: 'plan_failed', message: 'Η πράξη GET /plan/board δεν ολοκληρώθηκε — ενημέρωσε τον Δημήτρη' }, pg.code);
  }
  // a plan: hint on a class-22 SQLSTATE is still the rule it names (the hint is the marker, whatever SQLSTATE)
  routes.length = 0;
  on('POST', 'rpc/plan_move_pieces', () => planReject('parts_sum', '4', '22023'));
  const r = await callOpen('dispatcher', 'POST', '/plan/move', { from: { piece_ids: [1] }, target: { wait: true } });
  assert.equal(r.json.error.code, 'parts_sum');
});

test('finding 6: a PostgREST code that proves the RPC never ran → 503 «δεν αποθηκεύτηκε»; one that may follow the SQL stays plan_unknown', async () => {
  const MOVE = { from: { piece_ids: [1] }, target: { rt_id: 5, side: 'KATHODOS' } };
  for (const [status, code, want, text] of [
    [300, 'PGRST203', 'db_refused', 'Η βάση αρνήθηκε την κλήση (PGRST203) — η πράξη POST /plan/move δεν αποθηκεύτηκε· ενημέρωσε τον Δημήτρη'],
    [400, 'PGRST102', 'db_refused', 'Η βάση αρνήθηκε την κλήση (PGRST102) — η πράξη POST /plan/move δεν αποθηκεύτηκε· ενημέρωσε τον Δημήτρη'],
    [415, 'PGRST107', 'db_refused', 'Η βάση αρνήθηκε την κλήση (PGRST107) — η πράξη POST /plan/move δεν αποθηκεύτηκε· ενημέρωσε τον Δημήτρη'],
    [404, 'PGRST205', 'db_refused', 'Η βάση αρνήθηκε την κλήση (PGRST205) — η πράξη POST /plan/move δεν αποθηκεύτηκε· ενημέρωσε τον Δημήτρη'],
    [503, 'PGRST002', 'slow', 'Η βάση δεν ήταν έτοιμη (PGRST002) — τίποτα δεν αποθηκεύτηκε· ξαναδοκίμασε σε λίγο'],
    [504, 'PGRST003', 'slow', 'Η βάση δεν είχε ελεύθερη σύνδεση — τίποτα δεν αποθηκεύτηκε· ξαναδοκίμασε σε λίγο']]) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(status, { code, details: null, hint: null, message: 'x' }));
    calls.length = 0;
    const r = await callOpen('dispatcher', 'POST', '/plan/move', MOVE);
    assert.equal(r.status, 503, `${code}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SERVER', code: want, message: text }, code);
    assert.equal(rpcCalls().length, 1);
    routes.length = 0;
    on('POST', 'rpc/plan_board', () => pgError(status, { code, details: null, hint: null, message: 'x' }));
    const rd = await call('owner', 'GET', '/plan/board?week=2026-10-10');
    assert.equal(rd.json.error.code, want, `${code} read`);
    assert.ok(!/αποθηκεύτηκε/.test(rd.json.error.message), `${code} read: a read never speaks of saving`);
  }
  // after the SQL ran (or may have): the outcome stays unknown
  for (const [status, code] of [[503, 'PGRST000'], [503, 'PGRST001'], [500, 'PGRST111'], [500, 'PGRST112'], [406, 'PGRST116'],
    [500, 'PGRST121'], [400, 'PGRST124'], [400, 'PGRST128'], [500, 'PGRSTX00'], [400, 'PGRST999']]) {
    routes.length = 0;
    on('POST', 'rpc/plan_move_pieces', () => pgError(status, { code, details: null, hint: null, message: 'x' }));
    const r = await callOpen('dispatcher', 'POST', '/plan/move', MOVE);
    assert.equal(r.status, 422, `${code}: ${r.text}`);
    assert.equal(r.json.error.code, 'plan_unknown', code);
  }
});

test('finding 4: a dry run previews every family as its execution answers it (relay, stock, unknown plan code, unknown constraint)', async () => {
  const preview = (conflict) => ({ ok: true, op: 'plan_rt_update', dry_run: true,
    preview: { before: {}, after: null, next_rt: null, vs_day: [], warnings: [], conflict } });
  const CASES = [
    // a 060 CHECK the trigger of plan_rt_update can meet (relay family, its own type and text)
    [{ code: 'local_moves_relay_points', sqlstate: '23514', detail: null }, { code: '23514', hint: null, details: null, message: 'new row for relation "local_moves" violates check constraint "local_moves_relay_points"' }],
    // a 060 unique index: its code is relay_exists, not the index name
    [{ code: 'local_moves_relay_once', sqlstate: '23505', detail: null }, { code: '23505', hint: null, details: null, message: 'duplicate key value violates unique constraint "local_moves_relay_once"' }],
    // a 057 unique index: lot_exists
    [{ code: 'stock_lots_order_live', sqlstate: '23505', detail: null }, { code: '23505', hint: null, details: null, message: 'duplicate key value violates unique constraint "stock_lots_order_live"' }],
    // a 057 CHECK
    [{ code: 'stock_lots_one_source', sqlstate: '23514', detail: null }, { code: '23514', hint: null, details: null, message: 'new row for relation "stock_lots" violates check constraint "stock_lots_one_source"' }],
    // a plan: code the Worker does not know yet, with its detail
    [{ code: 'brand_new', sqlstate: '23514', detail: 'RT-7' }, { code: '23514', hint: 'plan:brand_new', details: null, message: 'plan rule broken: brand_new:RT-7' }],
    // a known plan: code with an empty detail
    [{ code: 'rt_window', sqlstate: '23514', detail: '' }, { code: '23514', hint: 'plan:rt_window', details: null, message: 'plan rule broken: rt_window:' }],
    // a foreign key nobody names
    [{ code: 'rt_stops_location_id_fkey', sqlstate: '23503', detail: null }, { code: '23503', hint: null, details: null, message: 'insert or update on table "rt_stops" violates foreign key constraint "rt_stops_location_id_fkey"' }],
    // a NOT NULL with a name (PG 18 names them, so 072's dry run fills `code`): bad_input on both sides (r2 finding 9)
    [{ code: 'rt_stops_planned_from_not_null', sqlstate: '23502', detail: null }, { code: '23502', hint: null, details: null, message: 'null value in column "planned_from" of relation "rt_stops" violates not-null constraint' }]];
  for (const [conflict, pg] of CASES) {
    routes.length = 0;
    on('POST', 'rpc/plan_rt_update', (u, b) => (b.p.dry_run === true ? json(preview({ ...conflict })) : pgError(409, pg)));
    const exec = await callOpen('dispatcher', 'PATCH', '/plan/rt/5', { set: { truck_id: 2 } });
    assert.equal(exec.status, 422, `${conflict.code}: ${exec.text}`);
    const dry = await call('dispatcher', 'PATCH', '/plan/rt/5', { set: { truck_id: 2 }, dry_run: true });
    assert.equal(dry.status, 200, `${conflict.code}: ${dry.text}`);
    assert.equal(dry.json.preview.conflict.code, exec.json.error.code, `${conflict.code}: the same code`);
    assert.equal(dry.json.preview.conflict.message, exec.json.error.message, `${conflict.code}: the same text`);
  }
});

test('finding 9: a body id that is not a safe integer → 400 bad_input <path>:safe_integer before any DB call; an amount is not an id', async () => {
  for (const [p, method, raw, field] of [
    ['/plan/move', 'POST', '{"from":{"piece_ids":[4,9007199254740993]},"target":{"wait":true},"dry_run":true}', 'from.piece_ids[1]'],
    ['/plan/rt/5', 'PATCH', '{"set":{"truck_id":9007199254740993},"dry_run":true}', 'set.truck_id'],
    ['/plan/delete', 'POST', '{"nat_order_id":1.5,"dry_run":true}', 'nat_order_id'],
    ['/plan/legs', 'POST', '{"pieces":[{"id":12345678901234567890}],"target":{"rt_id":5}}', 'pieces[0].id']
  ]) {
    for (const fetchOn of [call, callOpen]) {
      calls.length = 0;
      const r = await fetchOn('owner', method, p, raw);
      assert.equal(r.status, 400, `${p} ${raw}: ${r.text}`);
      assert.equal(r.json.error.code, 'bad_input');
      assert.ok(r.json.error.message.endsWith(`(${field}:safe_integer)`), r.json.error.message);
      assert.equal(calls.length, 0, `${p}: no DB call`);
    }
  }
  // a safe id and a large amount still reach the DB as sent
  on('POST', 'rpc/plan_rt_update', () => json(OK));
  calls.length = 0;
  const r = await callOpen('owner', 'PATCH', '/plan/rt/5', '{"set":{"truck_id":9007199254740991,"partner_rate":1e300}}');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(rpcCalls()[0].body.p.set, { truck_id: 9007199254740991, partner_rate: 1e300 });
});

test('finding 12: the route is named by its path, record id included', async () => {
  on('POST', 'rpc/plan_rt_update', () => new Response('<html>bad gateway</html>', { status: 502 }));
  let r = await callOpen('dispatcher', 'PATCH', '/plan/rt/42', { set: { truck_id: 2 } });
  assert.equal(r.json.error.code, 'plan_unknown');
  assert.match(r.json.error.message, /^Η πράξη PATCH \/plan\/rt\/42 μπορεί να αποθηκεύτηκε/);
  routes.length = 0;
  on('POST', 'rpc/plan_notice_read', () => pgError(400, { code: 'P0001', hint: null, details: null, message: 'x' }));
  r = await callOpen('owner', 'POST', '/plan/notices/7/read', {});
  assert.equal(r.json.error.message, 'Η πράξη POST /plan/notices/7/read δεν ολοκληρώθηκε — ενημέρωσε τον Δημήτρη');
});

test('finding 2: a v5 LOCAL MOVES row (nat_loading) is never changed or deleted through the facade — 422 plan_owned, nothing written', async () => {
  const LM = '/v0/appTEST/local_moves';
  const ROWS = {
    recNAT: { id: 1, legacy_id: 'recNAT', move_kind: 'nat_loading', rt_stop_id: 3, status: 'Assigned', driver_id: null },
    recLOC: { id: 2, legacy_id: 'recLOC', move_kind: 'local', rt_stop_id: null, status: 'Assigned', driver_id: null }
  };
  let readFails = false;
  on('GET', 'local_moves', (u) => {
    if (readFails) return pgError(500, { message: 'down' });
    const eq = (u.searchParams.get('legacy_id') || '').replace(/^eq\./, '');
    const ids = eq.startsWith('in.(') ? eq.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : [eq];
    return json(ids.map((id) => ROWS[id]).filter(Boolean));
  });
  on('PATCH', 'local_moves', (u, b) => json([{ ...ROWS[u.searchParams.get('legacy_id').slice(3)], ...b }]));
  const writes = () => calls.filter((c) => c.table === 'local_moves' && c.method === 'PATCH').length;
  const owned = (r, label) => {
    assert.equal(r.status, 422, `${label}: ${r.text}`);
    assert.equal(r.json.error.type, 'PLAN_RULE');
    assert.equal(r.json.error.code, 'plan_owned');
    assert.match(r.json.error.message, /Εβδομαδιαίο Εθνικών.*\/plan\/local-loading/);
  };
  for (const role of ['owner', 'dispatcher']) {
    calls.length = 0;
    owned(await call(role, 'PATCH', `${LM}/recNAT`, { fields: { Notes: 'x' } }), `${role} PATCH`);
    owned(await call(role, 'PATCH', `${LM}/recNAT`, { fields: { Status: 'Cancelled' } }), `${role} cancel`);
    owned(await call(role, 'PATCH', LM, { records: [{ id: 'recLOC', fields: { Notes: 'x' } }, { id: 'recNAT', fields: { Notes: 'x' } }] }), `${role} batch`);
    owned(await call(role, 'DELETE', `${LM}/recNAT`), `${role} DELETE`);
    assert.equal(writes(), 0, `${role}: nothing written, not even the batch's first (plain) row`);
    assert.equal(auditRows().length, 0);
  }
  // a plain local move is changed and deleted as today
  calls.length = 0;
  let r = await call('dispatcher', 'PATCH', `${LM}/recLOC`, { fields: { Notes: 'x' } });
  assert.equal(r.status, 200, r.text);
  r = await call('dispatcher', 'DELETE', `${LM}/recLOC`);
  assert.equal(r.status, 200, r.text);
  assert.equal(writes(), 2);
  // the row could not be read: nothing written (fail closed), a 503 the user may press again
  readFails = true;
  calls.length = 0;
  for (const [method, p, body] of [['PATCH', `${LM}/recLOC`, { fields: { Notes: 'x' } }], ['PATCH', LM, { records: [{ id: 'recLOC', fields: { Notes: 'x' } }] }], ['DELETE', `${LM}/recLOC`]]) {
    r = await call('dispatcher', method, p, body);
    assert.equal(r.status, 503, `${method} ${p}: ${r.text}`);
  }
  assert.equal(writes(), 0);
});
