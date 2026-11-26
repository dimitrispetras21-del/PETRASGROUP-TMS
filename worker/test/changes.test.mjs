// POST /changes — «did someone else change something since this tab last looked» (T188, ValueDriven 26/11/2026).
// Against worker/src/index.js itself, PostgREST stubbed via fetch: who may ask (401, 403, the explicit role list), the
// cursor (first ask = where the log is now; then rows after it, in id order), what counts (another person's rows only:
// never the caller's own, never trigger / migration / system rows), the page cap (`more`), and that a failed read is a
// 503, never «nothing changed». Only table names and counts travel.
// Run: node --test worker/test/changes.test.mjs
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

test('CHANGES_ROLES: an explicit list of today\'s five roles, not derived from PERMISSIONS', () => {
  const m = src.match(/\nvar CHANGES_ROLES = (\[[^\]]*\]);\n/);
  assert.ok(m, 'CHANGES_ROLES not found');
  const roles = JSON.parse(m[1]);
  assert.deepEqual(roles, ['owner', 'management', 'accountant', 'dispatcher', 'warehouse']);
  const PERMISSIONS = new Function(src.match(/var PERMISSIONS = \{[\s\S]*?\n\};\n/)[0] + '\nreturn PERMISSIONS;')();
  for (const r of roles) assert.ok(PERMISSIONS[r], `${r} is a real role`);
  assert.doesNotMatch(src, /CHANGES_ROLES\s*=\s*Object\.keys/);
});

test('the owner\'s lever is declared in wrangler.toml [vars] (a dashboard-only var is erased by the next deploy)', () => {
  const toml = readFileSync(path.resolve(HERE, '../wrangler.toml'), 'utf8');
  assert.match(toml, /\nCHANGES_OFF = "0"\n/);
});

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);
const ORIGIN = 'https://dimitrispetras21-del.github.io';
const BASE_ENV = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, name: sub, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(BASE_ENV.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
// body: the JSON body to send ({} = first ask); raw: a body string as is
async function get(body = {}, { role = 'dispatcher', sub = 'disp1', auth = true, env = BASE_ENV, method = 'POST', raw } = {}) {
  const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await token(role, sub)}`;
  const init = { method, headers };
  if (method === 'POST') init.body = raw ?? JSON.stringify(body);
  const res = await worker.fetch(new Request('https://w.invalid/changes', init), env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const jsonRes = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

let calls, auditAnswer;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
let errors;
beforeEach(() => {
  errors = [];
  console.log = console.warn = () => {};
  console.error = (...a) => errors.push(a.join(' '));
  calls = [];
  auditAnswer = () => jsonRes([]);
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method: init.method || 'GET', table, params: Object.fromEntries(u.searchParams) });
    if (table === 'audit_log') return auditAnswer(u.searchParams);
    throw new Error(`unmocked fetch: ${table}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

test('first ask ({}, no since): where the log is now, nothing to report; one read of the newest id only', async () => {
  auditAnswer = () => jsonRes([{ id: 24778 }]);
  const r = await get();
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { latest: 24778, tables: {}, n: 0, more: false });
  assert.deepEqual(calls.map((c) => c.params), [{ select: 'id', order: 'id.desc', limit: '1' }]);
});

test('an empty log answers latest 0', async () => {
  const r = await get();
  assert.deepEqual(r.json, { latest: 0, tables: {}, n: 0, more: false });
});

test('since: rows after the cursor in id order; only other people\'s rows count, by table; latest = last row read', async () => {
  auditAnswer = () => jsonRes([
    { id: 101, table_name: 'orders', actor: 'pantelis', role: 'dispatcher' },
    { id: 102, table_name: 'order_stops', actor: 'pantelis', role: 'dispatcher' },
    { id: 103, table_name: 'orders', actor: 'disp1', role: 'dispatcher' },            // the caller's own save
    { id: 104, table_name: 'ct_round_trips', actor: 'trigger:rt_sync', role: 'system' },
    { id: 105, table_name: 'orders', actor: 'migration:075', role: 'system' },
    { id: 106, table_name: 'pl_movements', actor: 'pallet_feed', role: 'system' },
    { id: 107, table_name: 'clients', actor: 'eirini', role: 'accountant' },
    { id: 108, table_name: 'orders', actor: 'trigger:x', role: 'dispatcher' },        // a trigger row with a person's role
  ]);
  const r = await get({ since: 100 });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { latest: 108, tables: { orders: 1, order_stops: 1, clients: 1 }, n: 3, more: false });
  assert.deepEqual(calls[0].params, { select: 'id,table_name,actor,role', id: 'gt.100', order: 'id.asc', limit: '501' });
});

test('nothing new: latest stays the cursor', async () => {
  const r = await get({ since: 24778 });
  assert.deepEqual(r.json, { latest: 24778, tables: {}, n: 0, more: false });
});

test('more than 500 rows: the first 500 are counted, latest is the 500th, more says ask again', async () => {
  auditAnswer = () => jsonRes(Array.from({ length: 501 }, (_, i) => ({ id: 1001 + i, table_name: 'orders', actor: 'pantelis', role: 'dispatcher' })));
  const r = await get({ since: 1000 });
  assert.deepEqual(r.json, { latest: 1500, tables: { orders: 500 }, n: 500, more: true });
});

test('a bad cursor or body is a 400 before any read', async () => {
  for (const b of [{ since: '' }, { since: -1 }, { since: '12' }, { since: 1.5 }, { since: 2 ** 60 }, { since: 1, other: 2 }, []]) {
    const r = await get(b);
    assert.equal(r.status, 400, `${JSON.stringify(b)}: ${r.text}`);
  }
  assert.equal((await get(null, { raw: 'not json' })).status, 400);
  assert.equal(calls.length, 0);
});

test('{since: null} is a first ask, as {}', async () => {
  auditAnswer = () => jsonRes([{ id: 7 }]);
  assert.deepEqual((await get({ since: null })).json, { latest: 7, tables: {}, n: 0, more: false });
});

test('401 without a token, 403 for a role outside the list, both before any read', async () => {
  assert.equal((await get({ since: 1 }, { auth: false })).status, 401);
  assert.equal((await get({ since: 1 }, { role: 'driver' })).status, 403);
  assert.equal(calls.length, 0);
});

test('every one of the five roles may ask', async () => {
  for (const role of ['owner', 'management', 'accountant', 'dispatcher', 'warehouse']) {
    assert.equal((await get({ since: 1 }, { role, sub: `u_${role}` })).status, 200, role);
  }
});

test('a failed read is a 503 and is logged, never a 200 «nothing changed»', async () => {
  auditAnswer = () => jsonRes({ message: 'boom' }, 500);
  const r = await get({ since: 1 });
  assert.equal(r.status, 503, r.text);
  assert.equal(errors.length, 1);
  auditAnswer = () => jsonRes({ not: 'a list' });
  assert.equal((await get({ since: 1 })).status, 503);
});

test('CHANGES_OFF = "1": 410 {stop:true} before auth or any read', async () => {
  const r = await get({ since: 1 }, { auth: false, env: { ...BASE_ENV, CHANGES_OFF: '1' } });
  assert.equal(r.status, 410);
  assert.deepEqual(r.json, { stop: true });
  assert.equal(calls.length, 0);
});

test('only POST: a GET to /changes is not this route', async () => {
  const r = await get({}, { method: 'GET' });
  assert.notEqual(r.status, 200);
  assert.equal(calls.filter((c) => c.table === 'audit_log').length, 0);
});
