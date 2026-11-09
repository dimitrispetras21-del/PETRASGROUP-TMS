// Pallets U4 (107, owner 27–28/10) + the U3 panel's history: GET /pallets/missing (the one definition, read by owner /
// accountant / management), POST /pallets/no-exchange (owner / accountant; the act and its trace live in
// pl_no_exchange, the route only forwards the JWT's actor and role), GET /pallets/movements/:id/history (the page's
// roles), and the movements list's embeds. The fake PostgREST records every call.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(path.resolve(HERE, '../src/index.js')).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'alexia') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(method, p, role = 'accountant', body) {
  const res = await worker.fetch(new Request(`https://w.invalid/pallets/${p}`, { method, headers: { Origin: ORIGIN,
    Authorization: `Bearer ${await token(role)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, json: await res.json() };
}

let calls; let answer;
const realFetch = globalThis.fetch;
const realErr = console.error;
beforeEach(() => {
  console.error = () => {};
  calls = []; answer = () => new Response(JSON.stringify({ ok: 1 }));
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, search: u.search, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    return answer(u, init);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realErr; });
const refuse = (code, status = 400) => () => new Response(JSON.stringify({ code: '23514', hint: `pln:${code}`, message: `pln rule broken: ${code}:x` }), { status });

test('GET missing: owner, accountant, management read the 107 view, newest first, with the cap said', async () => {
  answer = () => new Response(JSON.stringify([{ order_stop_id: 12, order_id: 1 }]));
  for (const role of ['owner', 'accountant', 'management']) {
    calls = [];
    const r = await call('GET', 'missing', role);
    assert.equal(r.status, 200, role);
    assert.deepEqual(r.json, { records: [{ order_stop_id: 12, order_id: 1 }], truncated: false, cap: 2000 });
    assert.equal(calls[0].path, '/rest/v1/pl_v_missing_delivery');
    assert.match(decodeURIComponent(calls[0].search), /order=delivered_on\.desc\.nullslast/);
    assert.match(calls[0].search, /limit=2000/);
  }
});

test('GET missing: dispatcher and warehouse are refused (they do not see the list, owner 28/10)', async () => {
  for (const role of ['dispatcher', 'warehouse']) {
    calls = [];
    const r = await call('GET', 'missing', role);
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0);
  }
});

test('POST no-exchange forwards the JWT actor and role, never the body\'s, and only the three fields', async () => {
  answer = () => new Response(JSON.stringify({ order_id: 1, deleted: [100], confirmed_kept: [101] }));
  const r = await call('POST', 'no-exchange', 'accountant', { order_id: 1, order_stop_id: 12, reason: 'κρατά τις άδειες',
    p_actor: 'owner', p_role: 'owner', pallet_exchange: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.record.deleted, [100]);
  assert.equal(calls[0].path, '/rest/v1/rpc/pl_no_exchange');
  assert.deepEqual(calls[0].body, { p: { order_id: 1, order_stop_id: 12, reason: 'κρατά τις άδειες' }, p_actor: 'alexia', p_role: 'accountant' });
});

test('POST no-exchange: management, dispatcher and warehouse are refused before the base', async () => {
  for (const role of ['management', 'dispatcher', 'warehouse']) {
    calls = [];
    const r = await call('POST', 'no-exchange', role, { order_id: 1, order_stop_id: 12, reason: 'x y z' });
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0);
  }
});

test('POST no-exchange: a 107 refusal comes back Greek as «error» (plFetch reads it), 409 for already, 422 otherwise', async () => {
  answer = refuse('multi');
  let r = await call('POST', 'no-exchange', 'accountant', { order_id: 2, order_stop_id: 21, reason: 'x y z' });
  assert.equal(r.status, 422);
  assert.match(r.json.error, /πολλές στάσεις παράδοσης/);
  assert.equal(r.json.code, 'multi');
  answer = refuse('already');
  r = await call('POST', 'no-exchange', 'owner', { order_id: 9, order_stop_id: 91, reason: 'x y z' });
  assert.equal(r.status, 409);
  answer = refuse('nat_leg');
  r = await call('POST', 'no-exchange', 'owner', { order_id: 7, order_stop_id: 71, reason: 'x y z' });
  assert.equal(r.status, 422);
  assert.match(r.json.error, /εθνικό σκέλος/);
});

test('GET movements/:id/history: the audit rows of that movement, oldest first, jsonb strings parsed', async () => {
  answer = () => new Response(JSON.stringify([
    { actor: 'pantelis', role: 'dispatcher', action: 'create', before_data: null, after_data: JSON.stringify({ taken: 28, given: 0 }), created_at: '2026-10-16T09:05:00Z' },
    { actor: 'alexia', role: 'accountant', action: 'update', before_data: { taken: 30 }, after_data: { taken: 22 }, created_at: '2026-10-24T07:12:00Z' }]));
  for (const role of ['accountant', 'management', 'dispatcher', 'warehouse']) {
    calls = [];
    const r = await call('GET', 'movements/12/history', role);
    assert.equal(r.status, 200, role);
    assert.equal(calls[0].path, '/rest/v1/audit_log');
    const q = new URLSearchParams(calls[0].search);
    assert.equal(q.get('table_name'), 'eq.pl_movements');
    assert.equal(q.get('record_id'), 'eq.12');
    assert.equal(q.get('order'), 'created_at.asc,id.asc');
    assert.deepEqual(r.json.records[0], { action: 'create', changed_by: 'pantelis', role: 'dispatcher', changed_at: '2026-10-16T09:05:00Z', before: null, after: { taken: 28, given: 0 } });
    assert.deepEqual(r.json.records[1].after, { taken: 22 });
  }
  const bad = await call('GET', 'movements/abc/history', 'accountant');
  assert.equal(bad.status, 400);
});

test('GET movements embeds the point\'s city / country and the stop\'s pallets (U3 N01)', async () => {
  answer = () => new Response(JSON.stringify([]), { headers: { 'Content-Range': '0-0/0' } });
  const r = await call('GET', 'movements', 'accountant');
  assert.equal(r.status, 200);
  const sel = new URLSearchParams(calls[0].search).get('select');
  assert.equal(sel, '*,clients(company_name),partners(company_name),locations(name,city,country),order_stops(pallets,pallets_exchanged)');
});

test('the guard markers of --pmiss are in the source exactly once each', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.resolve(HERE, '../src/index.js'), 'utf8');
  for (const m of ['var PLN_RPC = {', 'resource === "missing"', 'action === "history"']) assert.equal(src.split(m).length - 1, 1, m);
});

test('every 107 refusal code has a Greek text, and every text a code (principle 8)', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(path.resolve(HERE, '../migrations/107_pl_missing_delivery.sql'), 'utf8');
  const codes = [...new Set([...sql.matchAll(/pln_h_raise\('([a-z_]+)'/g)].map((m) => m[1]))].sort();
  const src = fs.readFileSync(path.resolve(HERE, '../src/index.js'), 'utf8');
  const block = src.slice(src.indexOf('const PLN_RULE_TEXT = {'), src.indexOf('const PLN_CONFLICT'));
  const keys = [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, codes);
});
