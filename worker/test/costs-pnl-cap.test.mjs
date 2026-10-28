// GET /costs/pnl says when it is cut (28/10). It was one read of «limit 300» with nothing said: 198 RTs on 28/10 and
// ~20 a week, so the P&L would have lost RTs from the list and the totals in silence. Same answer as
// /pallets/movements (#134): records + truncated + cap (+ total). NOT paged: ct_v_rt_pnl recomputes every RT on each
// read, so it is one read of 999 and the exact count comes from ct_round_trips (an index read), never from the view.
// The fake PostgREST honours limit, order, the four filters, status=neq.cancelled, count=exact and db-max-rows.
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
async function token(role) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: 'tester', role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function get(q = '', role = 'owner') {
  const res = await worker.fetch(new Request(`https://w.invalid/costs/pnl${q}`, { headers: { Origin: ORIGIN,
    Authorization: `Bearer ${await token(role)}` } }), env, { waitUntil() {} });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let MAX_ROWS; // PostgREST db-max-rows
let rts; let calls; let dropFromView; let noCount; let badRange;
const realFetch = globalThis.fetch;
const realError = console.error;
const match = (sp, r) => ['date_start', 'scope', 'truck_id'].every((col) => sp.getAll(col).every((f) => {
  const [op, v] = f.split(/\.(.*)/s);
  const x = String(r[col]);
  return op === 'eq' ? x === v : op === 'gte' ? x >= v : op === 'lte' ? x <= v : assert.fail('op ' + op);
}));
beforeEach(() => {
  console.error = () => {};
  calls = []; MAX_ROWS = 1000; dropFromView = () => false; noCount = false; badRange = null;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const name = u.pathname.replace(/^\/rest\/v1\//, '');
    const sp = u.searchParams;
    const prefer = (init.headers || {}).Prefer;
    calls.push({ name, ...Object.fromEntries(sp), prefer });
    const live = rts.filter((r) => r.status !== 'cancelled' && match(sp, r));
    const headers = { 'content-type': 'application/json' };
    if (name === 'ct_round_trips') {
      assert.equal(sp.get('status'), 'neq.cancelled', 'the count uses the view\'s own WHERE');
      assert.equal(prefer, 'count=exact');
      const out = live.slice(0, Number(sp.get('limit'))).map((r) => ({ id: r.id }));
      if (!noCount) headers['content-range'] = badRange ?? (out.length ? `0-${out.length - 1}/${live.length}` : `*/${live.length}`);
      return new Response(JSON.stringify(out), { status: out.length ? 206 : 200, headers });
    }
    assert.equal(name, 'ct_v_rt_pnl');
    assert.equal(prefer, undefined, 'never count=exact on the view: it ran past the statement timeout (28/10)');
    assert.equal(sp.get('order'), 'id.desc');
    const view = live.filter((r) => !dropFromView(r)).sort((a, b) => b.id - a.id);
    return new Response(JSON.stringify(view.slice(0, Math.min(Number(sp.get('limit')), MAX_ROWS))), { headers });
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });
const mk = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: i + 1, status: 'closed',
  scope: i % 4 ? 'INTL' : 'NATL', truck_id: 1 + (i % 3), date_start: `2026-${String(8 + Math.floor(i * 3 / n)).padStart(2, '0')}-15`, ...extra(i) }));

test('198 RTs today: one read of the view, all of them, truncated false, cap and total said', async () => {
  rts = mk(198);
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.json.records.length, 198);
  assert.equal(r.json.truncated, false);
  assert.equal(r.json.cap, 999);
  assert.equal(r.json.total, 198);
  const views = calls.filter((c) => c.name === 'ct_v_rt_pnl');
  assert.equal(views.length, 1, 'never pages: each read recomputes every RT');
  assert.equal(views[0].limit, '999');
});

test('past 300 (the old cut): every RT, nothing said', async () => {
  rts = mk(450);
  const r = await get();
  assert.equal(r.json.records.length, 450);
  assert.equal(r.json.truncated, false);
});

test('cancelled RTs are neither rows nor counted: not a false cut', async () => {
  rts = mk(320, (i) => (i % 10 === 0 ? { status: 'cancelled' } : {}));
  const r = await get();
  assert.equal(r.json.records.length, 288);
  assert.equal(r.json.total, 288);
  assert.equal(r.json.truncated, false);
});

test('past the cap: the newest 999, truncated, total said', async () => {
  rts = mk(1200);
  const r = await get();
  assert.equal(r.json.records.length, 999);
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.total, 1200);
  assert.equal(r.json.records[0].id, 1200, 'newest first, so the cut drops the oldest');
  assert.equal(Math.min(...r.json.records.map((x) => x.id)), 202);
});

test('exactly the cap: not truncated', async () => {
  rts = mk(999);
  const r = await get();
  assert.equal(r.json.records.length, 999);
  assert.equal(r.json.truncated, false);
});

test('db-max-rows lowered to 500: a cut below the cap is still said, never quiet', async () => {
  MAX_ROWS = 500;
  rts = mk(700);
  const r = await get();
  assert.equal(r.json.records.length, 500);
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.total, 700);
});

test('an RT the view\'s joins drop is said (truncated), not hidden', async () => {
  rts = mk(198);
  dropFromView = (x) => x.id === 77;
  const r = await get();
  assert.equal(r.json.records.length, 197);
  assert.equal(r.json.truncated, true);
});

test('filters go to BOTH reads, so the count is the same set', async () => {
  rts = mk(400);
  const r = await get('?from=2026-09-01&to=2026-09-30&scope=INTL&truck_id=2');
  const want = rts.filter((x) => x.date_start >= '2026-09-01' && x.date_start <= '2026-09-30' && x.scope === 'INTL' && x.truck_id === 2).length;
  assert.ok(want > 0);
  assert.equal(r.json.records.length, want);
  assert.equal(r.json.total, want);
  assert.equal(r.json.truncated, false);
  for (const name of ['ct_v_rt_pnl', 'ct_round_trips']) {
    const c = calls.find((x) => x.name === name);
    assert.equal(c.scope, 'eq.INTL', name);
    assert.equal(c.truck_id, 'eq.2', name);
  }
});

test('no exact count in the answer: a loud error, never a guessed «complete»', async () => {
  rts = mk(10);
  noCount = true;
  const r = await get();
  assert.ok(r.status >= 500, 'status ' + r.status);
});

test('a range without a total («0-0/», «0-0/*», «0-0/ »): a loud error, never read as 0', async () => {
  rts = mk(10);
  for (const range of ['0-0/', '0-0/*', '0-0/ ', 'garbage']) {
    badRange = range;
    assert.ok((await get()).status >= 500, 'range ' + JSON.stringify(range));
  }
});

test('empty: no rows, total 0, not truncated', async () => {
  rts = [];
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.records, []);
  assert.equal(r.json.total, 0);
  assert.equal(r.json.truncated, false);
});

test('owner only, as before (COSTS_PERMS pnl)', async () => {
  rts = mk(3);
  for (const role of ['dispatcher', 'accountant', 'management', 'warehouse']) {
    assert.equal((await get('', role)).status, 403, role);
  }
  assert.equal(calls.length, 0, 'no read for a refused role');
});
