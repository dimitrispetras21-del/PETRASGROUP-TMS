// GET /costs/pnl reads EVERY RT (owner 8/11: «θέλω να έχω πρόσβαση σε όλα»). It was one read of «limit 300» with
// nothing said: 248 RTs on 8/11, 18 a week, so the P&L would have lost RTs from the list and the totals in silence.
// The view is read in keyset pages (id.desc, id < last) to the exact count, which comes from ct_round_trips (an
// index read), never from the view. Fewer rows than the count = truncated, said, never a short list in silence.
// The fake PostgREST honours limit, order, id=lt., the four filters, status=neq.cancelled, count=exact and db-max-rows.
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
let rts; let calls; let dropFromView; let noCount; let badRange; let onPage;
const realFetch = globalThis.fetch;
const realError = console.error;
const match = (sp, r) => ['date_start', 'scope', 'truck_id'].every((col) => sp.getAll(col).every((f) => {
  const [op, v] = f.split(/\.(.*)/s);
  const x = String(r[col]);
  return op === 'eq' ? x === v : op === 'gte' ? x >= v : op === 'lte' ? x <= v : assert.fail('op ' + op);
})) && sp.getAll('id').every((f) => (/^lt\.\d+$/.test(f) ? r.id < Number(f.slice(3)) : assert.fail('id ' + f)));
beforeEach(() => {
  console.error = () => {};
  calls = []; MAX_ROWS = 1000; dropFromView = () => false; noCount = false; badRange = null; onPage = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const name = u.pathname.replace(/^\/rest\/v1\//, '');
    const sp = u.searchParams;
    const prefer = (init.headers || {}).Prefer;
    calls.push({ name, ...Object.fromEntries(sp), prefer });
    if (name === 'ct_v_rt_pnl') onPage(calls.filter((c) => c.name === 'ct_v_rt_pnl').length); // a write between pages
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

const views = () => calls.filter((c) => c.name === 'ct_v_rt_pnl');

test('248 RTs today: ONE read of the view, all of them, truncated false, total said', async () => {
  rts = mk(248);
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.json.records.length, 248);
  assert.equal(r.json.truncated, false);
  assert.equal(r.json.total, 248);
  assert.equal('cap' in r.json, false, 'no cap (owner 8/11)');
  assert.equal(views().length, 1, 'under one page: the view is computed once, as before');
  assert.equal(views()[0].limit, '1000');
  assert.equal(views()[0].id, undefined, 'the first page has no keyset bound');
});

test('cancelled RTs are neither rows nor counted: not a false cut', async () => {
  rts = mk(320, (i) => (i % 10 === 0 ? { status: 'cancelled' } : {}));
  const r = await get();
  assert.equal(r.json.records.length, 288);
  assert.equal(r.json.total, 288);
  assert.equal(r.json.truncated, false);
});

test('2 500 RTs: every one, in keyset pages (id < last), none twice, newest first', async () => {
  rts = mk(2500);
  const r = await get();
  assert.equal(r.json.records.length, 2500);
  assert.equal(r.json.truncated, false);
  assert.equal(new Set(r.json.records.map((x) => x.id)).size, 2500);
  assert.equal(r.json.records[0].id, 2500);
  assert.deepEqual(views().map((c) => c.id), [undefined, 'lt.1501', 'lt.501']);
});

test('exactly 1 000 and 2 000: all, one extra (empty) page to see the end', async () => {
  for (const n of [1000, 2000]) {
    rts = mk(n); calls = [];
    const r = await get();
    assert.equal(r.json.records.length, n);
    assert.equal(r.json.truncated, false);
    assert.equal(views().length, n / 1000 + 1);
  }
});

test('db-max-rows lowered to 300: every page short, read on to the count, all RTs', async () => {
  MAX_ROWS = 300;
  rts = mk(700);
  const r = await get();
  assert.equal(r.json.records.length, 700);
  assert.equal(r.json.truncated, false);
  assert.equal(views().length, 3);
});

test('an RT the view\'s joins drop: truncated, said and logged, never a quiet short list', async () => {
  rts = mk(248);
  dropFromView = (x) => x.id === 77;
  const logged = []; console.error = (m) => logged.push(String(m));
  const r = await get();
  assert.equal(r.json.records.length, 247);
  assert.equal(r.json.total, 248);
  assert.equal(r.json.truncated, true);
  assert.equal(views().length, 2, 'a short page below the count reads on, the empty one ends');
  assert.ok(logged.some((m) => /read 247 of 248/.test(m)), logged.join('|'));
});

test('an RT created while the pages are read (count taken before): all read, not a cut', async () => {
  rts = mk(1500);
  onPage = (n) => { if (n === 2) rts.push({ id: 1501, status: 'closed', scope: 'INTL', truck_id: 1, date_start: '2026-10-15' }); };
  const r = await get();
  assert.ok(r.json.records.length >= 1500);
  for (let id = 1; id <= 1500; id++) assert.ok(r.json.records.some((x) => x.id === id), 'missing ' + id);
  assert.equal(r.json.truncated, false);
});

test('an RT cancelled between the count and the read: truncated (loud), never hidden', async () => {
  rts = mk(1500);
  onPage = (n) => { if (n === 2) rts.find((x) => x.id === 10).status = 'cancelled'; };
  const r = await get();
  assert.equal(r.json.records.length, 1499);
  assert.equal(r.json.truncated, true);
});

test('a runaway read stops at PNL_MAX_PAGES and says truncated', async () => {
  MAX_ROWS = 10;
  rts = mk(1000);
  const r = await get();
  assert.equal(views().length, 50);
  assert.equal(r.json.records.length, 500);
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.total, 1000);
});

test('filters go to BOTH reads, so the count is the same set', async () => {
  rts = mk(4000);
  const r = await get('?from=2026-09-01&to=2026-09-30&scope=INTL&truck_id=2');
  const want = rts.filter((x) => x.date_start >= '2026-09-01' && x.date_start <= '2026-09-30' && x.scope === 'INTL' && x.truck_id === 2).length;
  assert.ok(want > 0);
  assert.equal(r.json.records.length, want);
  assert.equal(r.json.total, want);
  assert.equal(r.json.truncated, false);
  for (const c of calls) {
    assert.equal(c.scope, 'eq.INTL', c.name);
    assert.equal(c.truck_id, 'eq.2', c.name);
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
