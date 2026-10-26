// 073 / E21 (spec 2.3): GET /costs/rt gives a v5 cycle (model 2) its end as ONE rule - v_rt_cycle.ended (the Athens
// day of its last stop has passed) - in a field of its own, `ended`. Its status stays what the base says (planned or
// cancelled for ever, 071). A failed read is said (ended: null, ended_unknown: true), never "still running". A trip
// of today's model (model 1) comes back exactly as before: no `ended`, no extra read.
// Against worker/src/index.js itself, PostgREST stubbed via fetch (the harness of costs-rt-filter.test.mjs).
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
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(role, pathAndQuery) {
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method: 'GET', headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` } });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const TRIPS = [
  { id: 1, model: 1, status: 'closed', date_start: '2026-10-12', date_end: '2026-10-14' },
  { id: 2, model: 2, status: 'planned', date_start: '2026-10-13', date_end: '2026-10-14' },
  { id: 3, model: 2, status: 'planned', date_start: '2026-10-30', date_end: '2026-10-31' },
];
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let calls; let cycleFails; let trips; let cycleRows;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = []; cycleFails = false; trips = TRIPS; cycleRows = [{ rt_id: 2, ended: true }, { rt_id: 3, ended: false }];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ table, params: u.searchParams });
    if (table === 'ct_round_trips') return json(trips.map((r) => ({ ...r, ct_rt_legs: [] })));
    if (table === 'dl_v_rt_route') return json([]);
    if (table === 'dl_entries') return json([]);
    if (table === 'v_rt_cycle') {
      if (cycleFails) return json({ message: 'boom' }, 500);
      return json(cycleRows);
    }
    throw new Error(`unmocked fetch: ${table}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

test('a v5 cycle carries ended from v_rt_cycle; its status is untouched', async () => {
  const r = await call('dispatcher', '/costs/rt');
  assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.json.records.map((x) => [x.id, x]));
  assert.equal(by[2].ended, true);
  assert.equal(by[3].ended, false);
  assert.equal(by[2].status, 'planned');
  const cyc = calls.find((c) => c.table === 'v_rt_cycle');
  assert.equal(cyc.params.get('rt_id'), 'in.(2,3)', 'one read, only the v5 ids');
  assert.equal(cyc.params.get('select'), 'rt_id,ended', 'no money, no vehicle: only the end');
});

test('a trip of today\'s model is returned as before: no ended field', async () => {
  const r = await call('owner', '/costs/rt');
  const one = r.json.records.find((x) => x.id === 1);
  assert.equal('ended' in one, false);
  assert.equal('ended_unknown' in one, false);
});

test('no v5 cycle in the page: no v_rt_cycle read at all', async () => {
  trips = [TRIPS[0]];
  const r = await call('owner', '/costs/rt');
  assert.equal(r.status, 200, r.text);
  assert.equal(calls.filter((c) => c.table === 'v_rt_cycle').length, 0);
});

test('v_rt_cycle fails: the list still loads, and every v5 cycle says it does not know', async () => {
  cycleFails = true;
  const r = await call('owner', '/costs/rt');
  assert.equal(r.status, 200, r.text);
  for (const x of r.json.records.filter((y) => y.model === 2)) {
    assert.equal(x.ended, null);
    assert.equal(x.ended_unknown, true);
  }
  assert.equal('ended' in r.json.records.find((x) => x.id === 1), false);
});

// Principle 1 (F3 Task 8 review of the plan's hunk): v_rt_cycle.ended is NULL when end_at is NULL (the CHECK
// rt_v2_window lets a NULL through), and a cycle can be missing from the answer (a race with a delete, or a view
// that changed). Neither is "still running": both say they do not know, like a failed read.
test('ended NULL in the view, or the cycle missing from the answer: unknown, never false', async () => {
  cycleRows = [{ rt_id: 2, ended: null }];
  const r = await call('owner', '/costs/rt');
  assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.json.records.map((x) => [x.id, x]));
  for (const id of [2, 3]) {
    assert.equal(by[id].ended, null, `rt ${id}`);
    assert.equal(by[id].ended_unknown, true, `rt ${id}`);
  }
  assert.equal('ended' in by[1], false);
});
