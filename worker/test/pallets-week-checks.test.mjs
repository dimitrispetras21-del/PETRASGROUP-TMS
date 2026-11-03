// /pallets/week-checks (104, the week's «Ελέγχθηκε» mark, owner 2/11). The route only forwards: who may write is in
// PL_PERMS AND in the 104 functions (principle 4); the actor and role are the JWT's, never the body; a 104 refusal
// comes back Greek, 409 when someone else acted first, 422 otherwise. The fake PostgREST records every call.
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
  const res = await worker.fetch(new Request(`https://w.invalid/pallets/week-checks${p}`, { method, headers: { Origin: ORIGIN,
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
const refuse = (code, status = 400) => () => new Response(JSON.stringify({ code: '23514', hint: `plw:${code}`, message: `plw rule broken: ${code}:x` }), { status });

test('POST forwards the JWT actor and role, never the body\'s, and only the known fields', async () => {
  const r = await call('POST', '', 'accountant', { week_start: '2026-10-10', movement_ids: [1, 2], missing_stop_ids: [9],
    again: true, empty_week: 'yes', p_actor: 'owner', checked_by: 'someone' });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/rest/v1/rpc/pl_week_check');
  assert.deepEqual(calls[0].body, { p: { week_start: '2026-10-10', movement_ids: [1, 2], missing_stop_ids: [9], empty_week: false, again: true },
    p_actor: 'alexia', p_role: 'accountant' });
});

test('who may write: dispatcher / warehouse / management read only, before any database call', async () => {
  for (const role of ['dispatcher', 'warehouse', 'management']) {
    assert.equal((await call('POST', '', role, { week_start: '2026-10-10', movement_ids: [1] })).status, 403, role);
    assert.equal((await call('PATCH', '/5', role)).status, 403, role);
  }
  assert.equal(calls.length, 0);
  for (const role of ['dispatcher', 'warehouse', 'management', 'owner', 'accountant']) {
    assert.equal((await call('GET', '?from=2026-10-03&to=2026-10-31', role)).status, 200, role);
  }
  assert.equal((await call('DELETE', '/5', 'owner')).status, 403);
});

test('a 104 refusal comes back Greek: 409 when someone acted first, 422 otherwise, never 500', async () => {
  answer = refuse('already');
  let r = await call('POST', '', 'owner', { week_start: '2026-10-10', movement_ids: [1] });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'already');
  assert.match(r.json.error.message, /ήδη ελεγμένη/);
  answer = refuse('gone');
  assert.equal((await call('PATCH', '/7')).status, 409);
  answer = refuse('bad_ids');
  r = await call('POST', '', 'accountant', { week_start: '2026-10-10', movement_ids: [1] });
  assert.equal(r.status, 422);
  assert.match(r.json.error.message, /δεν υπάρχουν πια/);
  answer = refuse('something_new');
  r = await call('POST', '', 'accountant', { week_start: '2026-10-10', movement_ids: [1] });
  assert.equal(r.status, 422);
  assert.match(r.json.error.message, /something_new/);
  answer = () => new Response('boom', { status: 500 });
  assert.equal((await call('POST', '', 'accountant', { week_start: '2026-10-10', movement_ids: [1] })).status, 500);
});

test('PATCH /:id = undo through pl_week_uncheck; changes passes the shown ids', async () => {
  assert.equal((await call('PATCH', '/12')).status, 200);
  assert.equal(calls[0].path, '/rest/v1/rpc/pl_week_uncheck');
  assert.deepEqual(calls[0].body, { p: { id: 12 }, p_actor: 'alexia', p_role: 'accountant' });
  assert.equal((await call('GET', '/12/changes?ids=3,4,5', 'dispatcher')).status, 200);
  assert.equal(calls[1].path, '/rest/v1/rpc/pl_week_check_changes');
  assert.deepEqual(calls[1].body.p, { id: 12, movement_ids: [3, 4, 5] });
  assert.equal((await call('GET', '/12/changes?ids=3,x')).status, 400);
  assert.equal((await call('PATCH', '/abc')).status, 400);
});

test('GET reads the table for a range of weeks, without the snapshot', async () => {
  answer = () => new Response(JSON.stringify([{ id: 1, week_start: '2026-10-10' }]));
  const r = await call('GET', '?from=2026-10-03&to=2026-10-31', 'management');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.records, [{ id: 1, week_start: '2026-10-10' }]);
  const sp = new URLSearchParams(calls[0].search);
  assert.equal(calls[0].path, '/rest/v1/pl_week_checks');
  assert.doesNotMatch(sp.get('select'), /snap/);
  assert.deepEqual(sp.getAll('week_start'), ['gte.2026-10-03', 'lte.2026-10-31']);
  assert.equal((await call('GET', '?from=2026-10-03')).status, 400);
  assert.equal((await call('GET', '?from=2026-02-30&to=2026-03-06')).status, 400);
  assert.equal((await call('GET', '?from=2026-13-01&to=2026-12-31')).status, 400);
});
