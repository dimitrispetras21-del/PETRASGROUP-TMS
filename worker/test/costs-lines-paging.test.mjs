// GET /costs/lines paging (4/10/2026). The batch read stopped at 300 lines with
// no offset; the base holds 805, so TRIP PnL read older RTs as «χωρίς κόστος».
// Contract under test — against worker/src/index.js itself (the deploy source),
// run in Node with PostgREST stubbed via fetch, like stock-lots.test.mjs:
//   ?offset=<int ≥ 0>  ?limit=<int ≥ 1, > 1000 → 1000>  (no limit → 300, as before)
//   response { records, next_offset } — next_offset = next page's offset | null
//   bad offset/limit → 400 in Greek, before any DB call
//   COSTS_PERMS gate unchanged (dispatcher/warehouse 403)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');

// The bundle imports @cloudflare/puppeteer (PDF rendering, unrelated here).
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

// ---- synthetic ct_cost_lines: 805 rows (the base's count on 4/10/2026), many
// sharing a line_date so the id tiebreaker is what keeps pages disjoint ----
const N = 805;
const LINES = Array.from({ length: N }, (_, i) => ({
  id: i + 1,
  rt_id: i % 5 === 0 ? null : 1000 + (i % 128),
  line_date: `2026-${String(8 + (i % 3)).padStart(2, '0')}-${String(1 + (i % 7)).padStart(2, '0')}`,
  category: 'fuel', net: 10, vat: 2.4, alloc_status: i % 5 === 0 ? 'unallocated' : 'allocated'
}));

// A PostgREST stand-in for ct_cost_lines: eq filters, order, limit, offset —
// and it REFUSES any order other than the deterministic one, so a Worker that
// drops the tiebreaker fails here instead of passing on a lucky sort.
function pgLines(u, table = LINES) {
  assert.equal(u.searchParams.get('order'), 'line_date.desc,id.desc', 'deterministic order with id tiebreaker');
  let rows = table.slice();
  for (const col of ['rt_id', 'alloc_status']) {
    const f = u.searchParams.get(col);
    if (f) rows = rows.filter((r) => String(r[col]) === f.replace(/^eq\./, ''));
  }
  rows.sort((a, b) => (a.line_date < b.line_date ? 1 : a.line_date > b.line_date ? -1 : b.id - a.id));
  const offset = Number(u.searchParams.get('offset') || 0);
  const limit = Number(u.searchParams.get('limit'));
  return json(rows.slice(offset, offset + limit));
}

const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let calls, linesTable;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = [];
  linesTable = LINES;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method, table, params: u.searchParams });
    if (method === 'GET' && table === 'ct_cost_lines') return pgLines(u, linesTable);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const linesReads = () => calls.filter((c) => c.table === 'ct_cost_lines');

async function readAll(role, query) {
  const pages = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const r = await call(role, `/costs/lines?${query}${query ? '&' : ''}offset=${offset}`);
    assert.equal(r.status, 200, r.text);
    pages.push(r.json.records.map((l) => l.id));
    if (r.json.next_offset === null) return pages;
    assert.equal(typeof r.json.next_offset, 'number');
    offset = r.json.next_offset;
  }
  throw new Error('paging never ended');
}

test('default (no offset/limit): still 300 lines, newest first — asks PostgREST for 301 to know there is more', async () => {
  const r = await call('owner', '/costs/lines');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.records.length, 300);
  assert.equal(r.json.next_offset, 300);
  const p = linesReads()[0].params;
  assert.equal(p.get('limit'), '301');
  assert.equal(p.get('offset'), null, 'no offset param on the first page — same request shape as before');
  assert.equal(p.get('select'), '*');
  assert.deepEqual(r.json.records[0], { ...LINES.slice().sort((a, b) => (a.line_date < b.line_date ? 1 : a.line_date > b.line_date ? -1 : b.id - a.id))[0] });
});

test('default on a small result: every row, next_offset null (present, not missing — that is the feature flag)', async () => {
  linesTable = LINES.slice(0, 120);
  const r = await call('owner', '/costs/lines');
  assert.equal(r.json.records.length, 120);
  assert.ok('next_offset' in r.json);
  assert.equal(r.json.next_offset, null);
});

test('exactly limit rows left: next_offset null — the +1 probe means no empty trailing call', async () => {
  linesTable = LINES.slice(0, 300);
  const r = await call('owner', '/costs/lines');
  assert.equal(r.json.records.length, 300);
  assert.equal(r.json.next_offset, null);
});

test('offset paging: disjoint pages that together are every row, once (limit 250 → 250/250/250/55)', async () => {
  const pages = await readAll('owner', 'limit=250');
  assert.deepEqual(pages.map((p) => p.length), [250, 250, 250, 55]);
  const all = pages.flat();
  assert.equal(new Set(all).size, all.length, 'no row on two pages');
  assert.deepEqual(all.slice().sort((a, b) => a - b), LINES.map((l) => l.id), 'no row missing');
  assert.deepEqual(linesReads().map((c) => c.params.get('offset')), [null, '250', '500', '750']);
});

test('offset paging with the default page: 300/300/205, every row once', async () => {
  const pages = await readAll('owner', '');
  assert.deepEqual(pages.map((p) => p.length), [300, 300, 205]);
  assert.equal(new Set(pages.flat()).size, N);
});

test('limit is clamped to 1000: limit=5000 asks for 1001 and returns all 805 in one page', async () => {
  const r = await call('owner', '/costs/lines?limit=5000');
  assert.equal(r.status, 200, r.text);
  assert.equal(linesReads()[0].params.get('limit'), '1001');
  assert.equal(r.json.records.length, N);
  assert.equal(r.json.next_offset, null);
  const big = Array.from({ length: 2500 }, (_, i) => ({ ...LINES[0], id: i + 1, line_date: '2026-09-01' }));
  linesTable = big;
  const r2 = await call('owner', '/costs/lines?limit=99999');
  assert.equal(r2.json.records.length, 1000);
  assert.equal(r2.json.next_offset, 1000);
});

test('filters still apply together with paging (rt_id, alloc_status)', async () => {
  const r = await call('owner', '/costs/lines?rt_id=1001&limit=1000&offset=0');
  assert.equal(r.status, 200, r.text);
  const p = linesReads()[0].params;
  assert.equal(p.get('rt_id'), 'eq.1001');
  assert.ok(r.json.records.length > 0 && r.json.records.every((l) => l.rt_id === 1001));
  assert.equal(r.json.next_offset, null);
  const u = await call('owner', '/costs/lines?alloc_status=unallocated&limit=100');
  assert.equal(linesReads()[1].params.get('alloc_status'), 'eq.unallocated');
  assert.equal(u.json.records.length, 100);
  assert.equal(u.json.next_offset, 100);
});

test('bad offset/limit → 400 in Greek, before any DB call — never «ignored, here is page 1»', async () => {
  for (const [q, names] of [
    ['offset=-1', 'offset'], ['offset=abc', 'offset'], ['offset=1.5', 'offset'], ['offset=1e3', 'offset'],
    ['offset=99999999999999999999', 'offset'], ['limit=10&offset=x', 'offset'],
    ['limit=0', 'limit'], ['limit=-3', 'limit'], ['limit=abc', 'limit'], ['limit=2.5', 'limit'], ['limit=1e3', 'limit']
  ]) {
    calls.length = 0;
    const r = await call('owner', `/costs/lines?${q}`);
    assert.equal(r.status, 400, q);
    assert.match(r.json.error, /[Α-Ωα-ωά-ώ]/, `${q}: Greek message`);
    assert.match(r.json.error, new RegExp(names), `${q}: names the bad parameter`);
    assert.equal(linesReads().length, 0, `${q}: no DB call`);
  }
});

test('role gate unchanged: dispatcher/warehouse 403 with no DB call; owner/accountant/management read', async () => {
  for (const role of ['dispatcher', 'warehouse']) {
    calls.length = 0;
    const r = await call(role, '/costs/lines?limit=10');
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0, `${role}: no DB call`);
  }
  for (const role of ['owner', 'accountant', 'management']) {
    const r = await call(role, '/costs/lines?limit=10');
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.equal(r.json.records.length, 10);
    assert.equal(r.json.next_offset, 10);
  }
});

test('non-owner: cash_m is still filtered, and next_offset counts DB rows — a short page can still have a next one', async () => {
  linesTable = LINES.map((l, i) => (i < 30 ? { ...l, category: 'cash_m' } : l));
  const top = linesTable.slice().sort((a, b) => (a.line_date < b.line_date ? 1 : a.line_date > b.line_date ? -1 : b.id - a.id)).slice(0, 50);
  const cashInTop = top.filter((l) => l.category === 'cash_m').length;
  assert.ok(cashInTop > 0, 'fixture: some cash_m lines land on page 1');
  const r = await call('accountant', '/costs/lines?limit=50');
  assert.equal(r.json.records.length, 50 - cashInTop);
  assert.ok(r.json.records.every((l) => l.category !== 'cash_m'));
  assert.equal(r.json.next_offset, 50);
  const o = await call('owner', '/costs/lines?limit=50');
  assert.equal(o.json.records.length, 50, 'owner sees cash_m');
  // the accountant's full walk = every non-cash_m row exactly once
  const pages = await readAll('accountant', 'limit=200');
  const all = pages.flat();
  assert.equal(all.length, N - 30);
  assert.equal(new Set(all).size, N - 30);
});
