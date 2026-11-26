// T188 (ValueDriven 26/11/2026): the REAL core/api.js in a vm sandbox. cacheDropForReturn runs before a page is drawn
// again on a return to the tab. It must drop every 2-min cached read (orders …) and, of the six reference tables,
// only copies older than the last fresh reference read; the copies that read wrote stay (memory and localStorage),
// so F5 still paints from localStorage. Logout's clearApiCaches is not this function.
// Run: node --test tests/api-cache-drop-return.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sandbox() {
  const store = new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  // Object.keys(localStorage) must list the stored keys, as a browser's does
  const lsProxy = new Proxy(ls, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined) });
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#orders' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1' } },
    localStorage: lsProxy, USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    showErrorToast() {}, atNotifyChange() {}, fetch: async () => new Response('{}', { status: 500 }),
  };
  ctx.window = { addEventListener() {}, location: ctx.location };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('logError = function () {};', ctx);
  return { ctx, store, run: (code) => vm.runInContext(code, ctx) };
}

const ORDERS = 'tblORDERS000000000';     // any table outside the six reference ones: the 2-min tier
const CLIENTS = 'tblFWKAQVUzAM8mCE';     // _STABLE_TABLES (30 min)
const TRUCKS = 'tblEAPExIAjiA3asD';      // _LONG_TABLES (4 h)

test('a return drops every 2-min read and the reference copies older than the last fresh read, nothing else', () => {
  const s = sandbox();
  const pre = s.run("'at_' + _userPrefix() + '_'");
  s.run(`
    _MEM['${ORDERS}filter=x'] = { data: [1], ts: 9000 };            // newer than the fresh read, still 2-min tier: goes
    _MEM['${CLIENTS}'] = { data: [1], ts: 1000 };                   // the Clients page's own read, before it: goes
    _MEM['${CLIENTS}fields[]=Company%20Name'] = { data: [1], ts: 6000 };   // written by the fresh read: stays
    _MEM['${TRUCKS}'] = { data: [1], ts: 4000 };                    // 4-h copy, before it: goes
    _refFreshAt = 5000;
  `);
  s.store.set(pre + CLIENTS, JSON.stringify({ data: [], ts: 1000 }));
  s.store.set(pre + CLIENTS + 'fields[]=Company%20Name', JSON.stringify({ data: [], ts: 6000 }));
  s.store.set(pre + TRUCKS + 'fields[]=License%20Plate', JSON.stringify({ data: [], ts: 7000 }));
  s.store.set('tms_offline_queue', '[1]');          // not a cached read: never touched
  s.store.set(pre + 'broken', '{not json');          // unreadable: treated as old
  s.run('cacheDropForReturn()');
  assert.deepStrictEqual(s.run('Object.keys(_MEM).sort()'), [`${CLIENTS}fields[]=Company%20Name`]);
  assert.deepStrictEqual([...s.store.keys()].sort(), [
    pre + CLIENTS + 'fields[]=Company%20Name', pre + TRUCKS + 'fields[]=License%20Plate', 'tms_offline_queue',
  ].sort());
});

test('before any fresh reference read (the first seconds after load) the reference copies all stay', () => {
  const s = sandbox();
  s.run(`_MEM['${CLIENTS}'] = { data: [1], ts: 1000 }; _MEM['${ORDERS}'] = { data: [1], ts: 1000 };`);
  s.run('cacheDropForReturn()');
  assert.deepStrictEqual(s.run('Object.keys(_MEM)'), [CLIENTS]);
});

test('refDataRefresh before the preload ever ran: the preload first (one shared read), then the fresh read', async () => {
  const s = sandbox();
  let preload = 0; const flags = [];
  s.ctx.__p = () => { preload++; return Promise.resolve('ok'); };
  s.ctx.__rec = (useCache) => { flags.push(useCache); return []; };
  s.run('preloadReferenceData = function () { return __p(); };');
  s.run('atGetAll = async (t, o, useCache = true) => __rec(useCache);');
  await s.run('refDataRefresh()');
  assert.strictEqual(preload, 1);
  assert.deepStrictEqual(flags, [false, false, false, false, false, false]);
});

test('a successful fresh reference read sets the mark; a failed one leaves it', async () => {
  const s = sandbox();
  s.run('atGetAll = async () => [];');
  assert.strictEqual(s.run('_refFreshAt'), 0);
  await s.run('_refDataFetchFresh()');
  const mark = s.run('_refFreshAt');
  assert.ok(mark > 0 && mark <= Date.now(), 'mark set to the read\'s start');
  s.run("atGetAll = async () => { throw new Error('network'); };");
  await assert.rejects(s.run('_refDataFetchFresh()'));
  assert.strictEqual(s.run('_refFreshAt'), mark);
});

test('after a save to a reference table (lists invalidated) refDataRefresh still reads past the cache', async () => {
  const s = sandbox();
  const flags = [];
  s.ctx.__rec = (useCache) => { flags.push(useCache); return []; };
  s.run('atGetAll = async (t, o, useCache = true) => __rec(useCache);');
  await s.run('preloadReferenceData()');                 // the boot preload: cached reads
  flags.length = 0;
  s.run('invalidateRefData()');                          // what invalidateCache does after an atPatch on CLIENTS
  await s.run('refDataRefresh()');
  assert.ok(flags.includes(false), 'a fresh read ran');
  assert.ok(s.run('_refFreshAt') > 0);
});

test('a copy promoted from localStorage to memory keeps its write time, so a return still drops it', async () => {
  const s = sandbox();
  const pre = s.run("'at_' + _userPrefix() + '_'");
  const old = Date.now() - 60 * 60_000;                   // written an hour ago, inside the 4-h tier
  s.store.set(pre + TRUCKS, JSON.stringify({ data: [{ id: 'r1', fields: {} }], ts: old }));
  const got = await s.run(`atGet('${TRUCKS}')`);           // the Φορτηγά page's read: a localStorage hit
  assert.strictEqual(got.length, 1);
  assert.strictEqual(s.run(`_MEM['${TRUCKS}'].ts`), old);
  s.run(`_refFreshAt = ${old + 1000};`);
  s.run('cacheDropForReturn()');
  assert.deepStrictEqual(s.run('Object.keys(_MEM)'), []);
  assert.strictEqual(s.store.has(pre + TRUCKS), false);
});
