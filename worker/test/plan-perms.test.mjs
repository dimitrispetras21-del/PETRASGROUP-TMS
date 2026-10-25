// National v5 F2 — PLAN_PERMS: 5 roles × every /plan/* route (spec §3
// «Δικαιώματα», plan decisions 25, 26 and 41: owner 23/10 «everyone has
// rights», the delete-type acts stay owner + dispatcher). Two layers, both on
// worker/src/index.js:
//   1. the map lifted from the source equals the plan's table, cell by cell;
//   2. the real Worker in Node: every refused (role, route) is a 403 in the one
//      /plan/* error shape, with ZERO calls to the DB; no token / a bad token
//      is a 401 before anything; an unknown /plan/ path is a 404 after auth.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
const src = readFileSync(SRC_PATH, 'utf8');
const m = src.match(/var PLAN_PERMS = \{[\s\S]*?\n\};\n/);
assert.ok(m, 'PLAN_PERMS not found');
const PLAN_PERMS = new Function(m[0] + '\nreturn PLAN_PERMS;')();

const ROLES = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'];
const DESK = ['owner', 'dispatcher'];
// resource → method → roles allowed (the plan's PLAN_PERMS table)
const EXPECT = {
  board: { GET: ROLES },
  'vs-state': { GET: ROLES },
  notices: { GET: ROLES },
  'notices-read': { POST: ROLES },
  orders: { POST: ROLES, PATCH: ROLES },
  legs: { POST: ROLES },
  move: { POST: ROLES },
  split: { POST: ROLES },
  rt: { PATCH: ROLES },
  // the delete-type acts (decision 41 (b)): their dry run too
  'rt-clear': { POST: DESK },
  delete: { POST: DESK },
  'vs-day': { POST: ROLES },
  'vs-place': { POST: ROLES },
  'local-loading': { POST: ROLES }
};

test('PLAN_PERMS equals the plan\'s table, cell by cell (nothing more, nothing less)', () => {
  for (const role of ROLES) {
    const want = {};
    for (const [res, byMethod] of Object.entries(EXPECT)) {
      const methods = Object.entries(byMethod).filter(([, roles]) => roles.includes(role)).map(([mm]) => mm);
      if (methods.length) want[res] = methods;
    }
    assert.deepEqual(PLAN_PERMS[role], want, role);
  }
});

// ─────────────────────────── the real Worker ───────────────────────────
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);
const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester', secret = env.JWT_SECRET) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function send(method, p, { auth, body } = {}) {
  const headers = { Origin: ORIGIN };
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://w.invalid${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const call = async (role, method, p, body) => send(method, p, { auth: `Bearer ${await token(role)}`, body });

let calls;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    throw new Error(`unmocked fetch: ${init.method || 'GET'} ${url}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

// One concrete request per (resource, method) — valid query strings, so a 403
// can only come from PLAN_PERMS.
const REQ = {
  'board GET': ['GET', '/plan/board?week=2026-10-10'],
  'vs-state GET': ['GET', '/plan/vs-state?order_ids=1,2'],
  'notices GET': ['GET', '/plan/notices?desk=natl'],
  'notices-read POST': ['POST', '/plan/notices/12/read', {}],
  'orders POST': ['POST', '/plan/orders', { orders: [] }],
  'orders PATCH': ['PATCH', '/plan/orders/17', { set: {} }],
  'legs POST': ['POST', '/plan/legs', { pieces: [] }],
  'move POST': ['POST', '/plan/move', { from: { piece_ids: [1] }, dry_run: true }],
  'split POST': ['POST', '/plan/pieces/split', { piece_id: 1, parts: [] }],
  'rt PATCH': ['PATCH', '/plan/rt/5', { dry_run: true }],
  'rt-clear POST': ['POST', '/plan/rt/5/clear', { dry_run: true }],
  'delete POST': ['POST', '/plan/delete', { nat_order_id: 17, dry_run: true }],
  'vs-day POST': ['POST', '/plan/vs/day', { order_id: 1, day: '2026-10-13' }],
  'vs-place POST': ['POST', '/plan/vs/place', { order_stop_id: 1, location_id: 2 }],
  'local-loading POST': ['POST', '/plan/local-loading', { rt_stop_id: 1, driver_id: 2, truck_id: 3 }]
};

test('every refused (role, route) → 403 in the /plan/* shape, before any DB call', async () => {
  let refused = 0;
  for (const [res, byMethod] of Object.entries(EXPECT)) {
    for (const [method, allowed] of Object.entries(byMethod)) {
      const [verb, p, body] = REQ[`${res} ${method}`];
      for (const role of ROLES.filter((r) => !allowed.includes(r))) {
        calls.length = 0;
        const r = await call(role, verb, p, body);
        assert.equal(r.status, 403, `${role} ${verb} ${p}: ${r.text}`);
        assert.deepEqual(r.json, { error: { type: 'FORBIDDEN', code: 'forbidden', message: 'Ο ρόλος σου δεν έχει αυτή την πράξη στο Εβδομαδιαίο Εθνικών' } });
        assert.equal(calls.length, 0, `${role} ${verb} ${p}: no DB call`);
        refused += 1;
      }
    }
  }
  assert.equal(refused, 6, 'refused cells of the table (2 delete-type resources × 3 roles, decision 41)');
});

test('an unknown role (forged or stale JWT role) is refused everywhere', async () => {
  for (const [verb, p, body] of Object.values(REQ)) {
    calls.length = 0;
    const r = await call('driver', verb, p, body);
    assert.equal(r.status, 403, `${verb} ${p}`);
    assert.equal(calls.length, 0);
  }
});

test('no token / a token signed with another secret → 401 before anything; unknown path → 404 after auth', async () => {
  for (const [verb, p, body] of Object.values(REQ)) {
    let r = await send(verb, p, { body });
    assert.equal(r.status, 401, `${verb} ${p}`);
    assert.deepEqual(r.json.error, { type: 'AUTH', code: 'unauthorized', message: 'Η σύνδεση έληξε — συνδέσου ξανά' });
    r = await send(verb, p, { body, auth: `Bearer ${await token('owner', 'x', 'another-secret')}` });
    assert.equal(r.status, 401, `forged ${verb} ${p}`);
    // a malformed token (atob throws inside getCaller) is a 401 in the /plan/* shape, never a CF 1101 without CORS
    r = await send(verb, p, { body, auth: 'Bearer a.b.c!!' });
    assert.equal(r.status, 401, `malformed ${verb} ${p}: ${r.text}`);
    assert.equal(r.json.error.type, 'AUTH');
  }
  assert.equal((await send('GET', '/plan/nope')).status, 401, 'auth comes first');
  for (const [verb, p] of [['GET', '/plan/nope'], ['POST', '/plan/rt'], ['DELETE', '/plan/orders/17'], ['GET', '/plan/orders'], ['POST', '/plan/restore']]) {
    const r = await call('owner', verb, p);
    assert.equal(r.status, 404, `${verb} ${p}`);
    assert.equal(r.json.error.type, 'NOT_FOUND');
  }
  assert.equal(calls.length, 0, 'no DB call on any of these');
});
